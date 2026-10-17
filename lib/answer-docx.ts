import { AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun, UnderlineType, WidthType, type IParagraphOptions, type INumberingOptions } from "docx";
import { ANSWER_STYLE, answerParagraph, buildAnswerModel, type AnswerBlock, type AnswerExportInput, type AnswerParagraph } from "@/lib/answer-export-model";
import { answerFonts } from "@/lib/answer-export-fonts";

export async function buildAnswerDocx(input: AnswerExportInput) {
  const model = buildAnswerModel(input);
  const numbering: INumberingOptions["config"][number][] = [];
  let listIndex = 0;
  const paragraph = (block: AnswerParagraph, marker?: IParagraphOptions["numbering"]) => new Paragraph({
    children: block.runs.flatMap(run => run.text.split("\n").map((text, index) => new TextRun({ text, bold: run.bold, italics: run.italic,
      underline: run.underline ? { type: UnderlineType.SINGLE } : undefined, strike: run.strike, ...(index ? { break: 1 } : {}) }))),
    spacing: { after: ANSWER_STYLE.after * 20, line: ANSWER_STYLE.lineHeight * 240 },
    pageBreakBefore: block.pageBreakBefore,
    ...(marker ? { numbering: marker } : {}),
    ...(block.heading ? { heading: block.heading === "title" ? HeadingLevel.TITLE : block.heading === "h1" ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, keepNext: true } : {}),
    alignment: block.alignment === "center" ? AlignmentType.CENTER : block.alignment === "right" ? AlignmentType.RIGHT : block.alignment === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
  });
  function render(blocks: AnswerBlock[], depth = 0, marker?: IParagraphOptions["numbering"]): (Paragraph | Table)[] {
    const output: (Paragraph | Table)[] = [];
    let marked = false;
    for (const block of blocks) {
      if (block.kind === "paragraph") {
        output.push(paragraph(block, !marked ? marker : undefined)); marked = true;
      } else if (block.kind === "list") {
        const reference = `answer-list-${listIndex++}`;
        numbering.push({ reference, levels: Array.from({ length: 9 }, (_, level) => ({ level,
          format: block.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET, text: block.ordered ? `%${level + 1}.` : "•", start: block.start,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) });
        for (const item of block.items) output.push(...render(item, depth + 1, { reference, level: Math.min(8, depth) }));
      } else {
        const borders = Object.fromEntries(["top", "bottom", "left", "right", "insideHorizontal", "insideVertical"].map(side => [side, { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }]));
        output.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders,
          rows: block.rows.map(cells => new TableRow({ tableHeader: cells.length > 0 && cells.every(cell => cell.header),
            children: (cells.length ? cells : [{ blocks: [answerParagraph("")], header: false, colSpan: 1, rowSpan: 1 }]).map(cell => new TableCell({
              children: render(cell.blocks), columnSpan: cell.colSpan, rowSpan: cell.rowSpan,
              ...(cell.header ? { shading: { fill: "F1F5F9" } } : {}), margins: { top: 100, bottom: 100, left: 120, right: 120 },
            })),
          })),
        }));
      }
    }
    return output;
  }
  const children = render(model);
  const heading = (size: number) => ({ run: { font: ANSWER_STYLE.font, color: "000000", size: size * 2, bold: true }, paragraph: { spacing: { before: 0, after: ANSWER_STYLE.after * 20 } } });
  return Packer.toBuffer(new Document({ creator: "Keystone Academia", title: "CIMA Mock Exam Answers", numbering: { config: numbering },
    fonts: [{ name: ANSWER_STYLE.font, data: answerFonts.normal }],
    styles: { default: { document: { run: { font: ANSWER_STYLE.font, size: ANSWER_STYLE.body * 2, color: "000000" },
      paragraph: { spacing: { after: ANSWER_STYLE.after * 20, line: ANSWER_STYLE.lineHeight * 240 } } },
      title: heading(ANSWER_STYLE.title), heading1: heading(ANSWER_STYLE.h1), heading2: heading(ANSWER_STYLE.h2) } },
    sections: [{ properties: { page: { size: { width: ANSWER_STYLE.width * 20, height: ANSWER_STYLE.height * 20 },
      margin: { top: ANSWER_STYLE.margin * 20, bottom: ANSWER_STYLE.margin * 20, left: ANSWER_STYLE.margin * 20, right: ANSWER_STYLE.margin * 20 } } }, children }],
  }));
}
