import "server-only";
import fontData from "pdfmake/build/vfs_fonts";

// pdfmake 0.2 ships its OFL/Apache licensed Roboto fonts as a virtual filesystem.
// Buffer-backed fonts work on Vercel without a system font installation.
const vfs = fontData as unknown as Record<string, string>;
export const answerFonts = {
  normal: Buffer.from(vfs["Roboto-Regular.ttf"], "base64"),
  bold: Buffer.from(vfs["Roboto-Medium.ttf"], "base64"),
  italics: Buffer.from(vfs["Roboto-Italic.ttf"], "base64"),
  bolditalics: Buffer.from(vfs["Roboto-MediumItalic.ttf"], "base64"),
};
