import "server-only";
import { buildAnswerPdfBytes } from "./answer-pdf-bytes";
import type { AnswerExportInput } from "./answer-export-model";

export async function buildAnswerPdf(input: AnswerExportInput): Promise<Buffer> {
  return Buffer.from(await buildAnswerPdfBytes(input));
}
