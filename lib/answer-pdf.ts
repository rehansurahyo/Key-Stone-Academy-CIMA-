import "server-only";
import PdfPrinter from "pdfmake";
import type { Content, ContentTable, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { ANSWER_STYLE, AnswerExportValidationError, buildAnswerModel, type AnswerBlock, type AnswerExportInput, type AnswerTable } from "@/lib/answer-export-model";
import { answerFonts } from "@/lib/answer-export-fonts";

function blockText(blocks: AnswerBlock[]): string {
  return blocks.map(block => block.kind === "paragraph" ? block.runs.map(run => run.text).join("")
    : block.kind === "list" ? block.items.map(blockText).join("\n") : block.rows.flatMap(row => row.map(cell => blockText(cell.blocks))).join("\n")).join("\n");
}

function pdfTable(block: AnswerTable): ContentTable {
  const body: TableCell[][] = [];
  const occupied = new Map<number, Set<number>>();
  let columns = 0;
  block.rows.forEach((cells, rowIndex) => {
    const row: TableCell[] = [];
    let column = 0;
    const covered = occupied.get(rowIndex) ?? new Set<number>();
    for (const cell of cells) {
      while (covered.has(column)) row[column++] = {};
      const rowSpan = Math.min(cell.rowSpan, block.rows.length - rowIndex);
      row[column] = { stack: render(cell.blocks), colSpan: cell.colSpan, rowSpan,
        ...(cell.header ? { fillColor: "#F1F5F9" } : {}) };
      for (let y = rowIndex; y < rowIndex + rowSpan; y++) {
        const slots = occupied.get(y) ?? new Set<number>();
        for (let x = column; x < column + cell.colSpan; x++) {
          if ((y !== rowIndex || x !== column) && slots.has(x)) throw new AnswerExportValidationError("This answer contains an overlapping table span.");
          slots.add(x);
          if (y === rowIndex && x !== column) row[x] = {};
        }
        occupied.set(y, slots);
      }
      column += cell.colSpan;
      if (column > 100) throw new AnswerExportValidationError("This answer table has too many columns.");
    }
    while (covered.has(column)) row[column++] = {};
    columns = Math.max(columns, row.length);
    body.push(row);
  });
  for (const row of body) for (let index = 0; index < columns; index++) row[index] ??= { text: "" };
  let headerRows = 0;
  for (const cells of block.rows) { if (!cells.length || !cells.every(cell => cell.header)) break; headerRows++; }
  // Keep ordinary rows intact; oversized cells must be allowed to flow rather
  // than being clipped by an unbreakable row larger than a page.
  const keepRows = block.rows.every(row => row.every(cell => {
    const charsPerLine = Math.max(1, Math.floor(((ANSWER_STYLE.width - ANSWER_STYLE.margin * 2) * cell.colSpan / columns - 12) / (ANSWER_STYLE.body * 0.6)));
    const lines = blockText(cell.blocks).split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    return lines * (ANSWER_STYLE.body * 1.5 + ANSWER_STYLE.after) < (ANSWER_STYLE.height - ANSWER_STYLE.margin * 2) * 0.8;
  }));
  return { table: { widths: Array.from({ length: columns }, () => "*"), headerRows, body, dontBreakRows: keepRows, keepWithHeaderRows: keepRows ? 1 : 0 }, margin: [0, 0, 0, ANSWER_STYLE.after],
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "#D9D9D9", vLineColor: () => "#D9D9D9",
      paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 5, paddingBottom: () => 5 } };
}
function render(blocks: AnswerBlock[]): Content[] {
  return blocks.map(block => {
    if (block.kind === "paragraph") return {
      text: block.runs.some(run => run.text.length) ? block.runs.map(run => ({ text: run.text, bold: run.bold, italics: run.italic,
        decoration: [...(run.underline ? ["underline" as const] : []), ...(run.strike ? ["lineThrough" as const] : [])] })) : " ",
      ...(block.heading ? { style: block.heading, headlineLevel: block.heading === "title" ? 1 : 2 } : {}),
      alignment: block.alignment, margin: [0, 0, 0, ANSWER_STYLE.after],
      pageBreak: block.pageBreakBefore ? "before" : undefined,
    };
    if (block.kind === "list") {
      const items = block.items.map(item => ({ stack: render(item) }));
      return block.ordered ? { ol: items, start: block.start, margin: [0, 0, 0, ANSWER_STYLE.after] } : { ul: items, margin: [0, 0, 0, ANSWER_STYLE.after] };
    }
    return pdfTable(block);
  });
}

export async function buildAnswerPdf(input: AnswerExportInput): Promise<Buffer> {
  const definition: TDocumentDefinitions = {
    info: { title: "CIMA Mock Exam Answers", author: "Keystone Academia" },
    pageSize: { width: ANSWER_STYLE.width, height: ANSWER_STYLE.height }, pageMargins: ANSWER_STYLE.margin,
    defaultStyle: { font: ANSWER_STYLE.font, fontSize: ANSWER_STYLE.body, color: "#000000", lineHeight: ANSWER_STYLE.lineHeight },
    styles: { title: { fontSize: ANSWER_STYLE.title, bold: true }, h1: { fontSize: ANSWER_STYLE.h1, bold: true }, h2: { fontSize: ANSWER_STYLE.h2, bold: true } },
    content: render(buildAnswerModel(input)),
    pageBreakBefore: (current, following) => !!current.headlineLevel && following.length === 0,
  };
  const printer = new PdfPrinter({ [ANSWER_STYLE.font]: answerFonts });
  return new Promise((resolve, reject) => {
    const pdf = printer.createPdfKitDocument(definition);
    const chunks: Buffer[] = [];
    pdf.on("data", chunk => chunks.push(Buffer.from(chunk)));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.end();
  });
}
