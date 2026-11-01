import pdfMake from "pdfmake/build/pdfmake";
import fontData from "pdfmake/build/vfs_fonts";
import { answerPdfDefinition } from "./answer-pdf-layout";
import { ANSWER_STYLE, type AnswerExportInput } from "./answer-export-model";

// This self-contained build embeds layout data and fonts instead of reading a
// Node filesystem. The same document definition runs in browsers and Workers.
export function buildAnswerPdfBytes(input: AnswerExportInput): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const pdf = pdfMake.createPdf(answerPdfDefinition(input), undefined, {
      [ANSWER_STYLE.font]: { normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf", italics: "Roboto-Italic.ttf", bolditalics: "Roboto-MediumItalic.ttf" },
    }, fontData as unknown as Record<string, string>).getStream();
    const chunks: Uint8Array[] = [];
    pdf.on("data", chunk => chunks.push(new Uint8Array(chunk)));
    pdf.on("error", reject);
    pdf.on("end", () => {
      const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
      resolve(output);
    });
    pdf.end();
  });
}
