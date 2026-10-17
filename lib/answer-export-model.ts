import { parseDocument } from "htmlparser2";
import type { ExamQuestion } from "@/lib/dashboard/types";
import { getSubtasks, subtaskLabel } from "@/lib/exam-subtasks";

export type AnswerExportInput = {
  examName: string; level: string; candidate: string; submittedAt: string;
  questions: ExamQuestion[]; answers: Record<string, string>;
};
export class AnswerExportValidationError extends Error {}
export type AnswerRun = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean };
export type AnswerParagraph = {
  kind: "paragraph"; runs: AnswerRun[]; heading?: "title" | "h1" | "h2";
  pageBreakBefore?: boolean;
  alignment?: "left" | "center" | "right" | "justify";
};
export type AnswerCell = { blocks: AnswerBlock[]; header: boolean; colSpan: number; rowSpan: number };
export type AnswerTable = { kind: "table"; rows: AnswerCell[][] };
export type AnswerList = { kind: "list"; ordered: boolean; start: number; items: AnswerBlock[][] };
export type AnswerBlock = AnswerParagraph | AnswerTable | AnswerList;
export const ANSWER_STYLE = {
  font: "Roboto", body: 11, title: 18, h1: 14, h2: 12, after: 8,
  lineHeight: 1.15, margin: 72, width: 612, height: 792,
};

type HtmlNode = ReturnType<typeof parseDocument>["children"][number];
const clean = (text: string) => text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
const ignored = new Set(["script", "style", "iframe", "object", "img", "svg", "video", "audio"]);
function runs(nodes: HtmlNode[], style: Omit<AnswerRun, "text"> = {}, depth = 0): AnswerRun[] {
  if (depth > 50) throw new AnswerExportValidationError("Answer formatting is nested too deeply.");
  return nodes.flatMap(node => {
    if (node.type === "text") return [{ ...style, text: clean(node.data) }];
    if (!("name" in node) || !("children" in node) || ignored.has(node.name)) return [];
    if (node.name === "br") return [{ ...style, text: "\n" }];
    const next = { ...style };
    if (["strong", "b"].includes(node.name)) next.bold = true;
    if (["em", "i"].includes(node.name)) next.italic = true;
    if (node.name === "u") next.underline = true;
    if (["s", "strike", "del"].includes(node.name)) next.strike = true;
    return runs(node.children, next, depth + 1);
  });
}
export const answerParagraph = (text: string, heading?: AnswerParagraph["heading"]): AnswerParagraph => ({ kind: "paragraph", runs: [{ text: clean(text) }], heading });

function htmlBlocks(nodes: HtmlNode[], depth = 0): AnswerBlock[] {
  if (depth > 50) throw new AnswerExportValidationError("Answer formatting is nested too deeply.");
  const output: AnswerBlock[] = [];
  let loose: HtmlNode[] = [];
  const flush = () => { if (loose.length) { output.push({ kind: "paragraph", runs: runs(loose) }); loose = []; } };
  for (const node of nodes) {
    if (!("name" in node) || !("children" in node)) { if (node.type === "text" && node.data.trim()) loose.push(node); continue; }
    if (ignored.has(node.name)) continue;
    if (["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(node.name)) {
      flush();
      const alignment = /text-align:\s*(left|center|right|justify)/.exec(node.attribs.style ?? "")?.[1] as AnswerParagraph["alignment"];
      output.push({ kind: "paragraph", runs: runs(node.children), alignment,
        heading: node.name.startsWith("h") ? node.name === "h1" ? "h1" : "h2" : undefined });
    } else if (["ul", "ol"].includes(node.name)) {
      flush();
      const start = Math.max(1, Math.min(9999, Number.parseInt(node.attribs.start ?? "1", 10) || 1));
      output.push({ kind: "list", ordered: node.name === "ol", start, items: node.children
        .filter(item => "name" in item && item.name === "li")
        .map(item => { const content = htmlBlocks("children" in item ? item.children : [], depth + 1); return content.length ? content : [answerParagraph("")]; }) });
    } else if (node.name === "table") {
      flush();
      const rows = node.children.flatMap(item => "name" in item && "children" in item && ["thead", "tbody", "tfoot"].includes(item.name) ? item.children : [item])
        .filter(item => "name" in item && "children" in item && item.name === "tr");
      if (rows.length > 1000) throw new AnswerExportValidationError("This answer table has too many rows.");
      const span = (value?: string) => Math.max(1, Math.min(100, Number.parseInt(value ?? "1", 10) || 1));
      const cells = rows.map(row => ("children" in row ? row.children : []).filter(cell => "name" in cell && ["td", "th"].includes(cell.name)).map(cell => {
        const attributes = "attribs" in cell ? cell.attribs : {};
        const content = htmlBlocks("children" in cell ? cell.children : [], depth + 1);
        return { blocks: content.length ? content : [answerParagraph("")], header: "name" in cell && cell.name === "th", colSpan: span(attributes.colspan), rowSpan: span(attributes.rowspan) };
      }));
      if (cells.length && cells.some(row => row.length)) output.push({ kind: "table", rows: cells });
      output.push(answerParagraph(""));
    } else if (["div", "blockquote", "li", "section"].includes(node.name)) { flush(); output.push(...htmlBlocks(node.children, depth + 1)); }
    else loose.push(node);
  }
  flush(); return output;
}

export function buildAnswerModel(input: AnswerExportInput): AnswerBlock[] {
  if (Object.values(input.answers).reduce((sum, answer) => sum + answer.length, 0) > 2_000_000) throw new AnswerExportValidationError("This answer is too large to export.");
  const blocks: AnswerBlock[] = [answerParagraph("CIMA Mock Exam Answers", "title"), answerParagraph(`${input.level} ${input.examName}`),
    answerParagraph(`Candidate: ${input.candidate}`), answerParagraph(`Submitted: ${new Date(input.submittedAt).toISOString()}`)];
  const included = new Set<string>();
  for (const question of input.questions) {
    const questionHeading = answerParagraph(`Question ${question.position}`, "h1");
    questionHeading.pageBreakBefore = included.size > 0;
    included.add(question.question_id);
    blocks.push(questionHeading, answerParagraph(question.content.subject), answerParagraph("Task requirements", "h2"), answerParagraph(question.content.taskPrompt));
    getSubtasks(question.content).forEach((task, index) => blocks.push(answerParagraph(`(${subtaskLabel(index)}) ${task.description} [${task.weightage}${question.content.weightageUnit === "marks" ? " marks" : "%"}]`)));
    blocks.push(answerParagraph("Student response", "h2"), ...htmlBlocks(parseDocument(input.answers[question.question_id] || "<p>No response submitted.</p>").children));
  }
  // Retain historic responses whose question is no longer present in the structure.
  for (const [id, html] of Object.entries(input.answers)) if (!included.has(id)) blocks.push(answerParagraph(`Response ${id}`, "h1"), ...htmlBlocks(parseDocument(html).children));
  return blocks;
}
