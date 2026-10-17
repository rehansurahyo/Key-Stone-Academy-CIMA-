export const REPORT_BUCKET = "graded-reports";
export const MAX_REPORT_BYTES = 20 * 1024 * 1024;
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOC_MIME = "application/msword";
export const REPORT_ACCEPT = ".pdf,.docx,.doc,application/pdf," + DOCX_MIME + "," + DOC_MIME;
export function reportExtension(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx" && extension !== "doc") throw new Error("Upload a PDF or Word (.docx or .doc) report.");
  return extension;
}
export function safeFileName(name: string) {
  return name.replace(/[\x00-\x1f\x7f/\\]/g, "_").trim().slice(0, 255) || "report";
}
export function reportMime(name: string) {
  const extension = reportExtension(name);
  return extension === "pdf" ? "application/pdf" : extension === "doc" ? DOC_MIME : DOCX_MIME;
}
