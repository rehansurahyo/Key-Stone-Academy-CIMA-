import JSZip from "jszip";
import { countryName } from "@/lib/countries";
import type { TrialLead } from "@/lib/trial-leads";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_EXPORT_LEADS = 10_000;
export const MAX_EXPORT_CHARACTERS = 5_000_000;
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const columns = [
  ["Full name", 28], ["Email address", 36], ["Phone / WhatsApp number", 27],
  ["Phone code", 15], ["Phone country", 25], ["Case Study", 17],
  ["Registered (Asia/Karachi)", 29], ["Status", 17], ["Internal notes", 60],
] as const;

function xml(value: string) {
  // XML 1.0 excludes control characters and unpaired UTF-16 surrogates.
  // Escape literal OOXML _xHHHH_ sequences so Excel does not change source text.
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "\uFFFD")
    .replace(/_x[0-9a-f]{4}_/gi, "_x005F_$&")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const localDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function excelDate(value: string): number | string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const parts = Object.fromEntries(localDate.formatToParts(date).map(part => [part.type, part.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) / 86_400_000 + 25569;
}

export function leadExportValues(lead: TrialLead): (string | number)[] {
  return [lead.full_name, lead.email, lead.phone, lead.country_code || "", countryName(lead.phone_country),
    lead.target_level, excelDate(lead.created_at), lead.status.charAt(0).toUpperCase() + lead.status.slice(1), lead.admin_notes || ""];
}

export function leadExportFilename(now: Date) {
  const parts = Object.fromEntries(localDate.formatToParts(now).map(part => [part.type, part.value]));
  return `keystone-trial-leads-${parts.year}-${parts.month}-${parts.day}.xlsx`;
}

export async function buildLeadXlsx(leads: TrialLead[]) {
  if (leads.length > MAX_EXPORT_LEADS) throw new Error("Lead export exceeds its row limit.");
  let characters = 0;
  function cell(value: string | number, row: number, col: number, header = false) {
    const address = `${String.fromCharCode(65 + col)}${row}`;
    const style = header ? 1 : typeof value === "number" ? (row % 2 ? 5 : 3) : (row % 2 ? 4 : 2);
    if (typeof value === "number") return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
    characters += value.length;
    if (value.length > 32767 || characters > MAX_EXPORT_CHARACTERS) throw new Error("Lead export exceeds its size limit.");
    // All user-entered fields are explicit text, including +phone numbers and
    // formula-looking names/notes. No formulas, hyperlinks or macros are emitted.
    return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }
  const header = `<row r="1" ht="32" customHeight="1">${columns.map(([name], col) => cell(name, 1, col, true)).join("")}</row>`;
  const rows = leads.map((lead, index) => {
    const values = leadExportValues(lead);
    const lines = Math.max(1, ...values.map((value, col) => typeof value === "number" ? 1 : value.split(/\r\n|\r|\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (columns[col][1] - 2))), 0)));
    return `<row r="${index + 2}" ht="${Math.min(120, Math.max(24, lines * 15))}" customHeight="1">${values.map((value, col) => cell(value, index + 2, col)).join("")}</row>`;
  }).join("");
  const lastRow = leads.length + 1;
  const zip = new JSZip();
  // SpreadsheetML package parts, per Microsoft's Open XML documentation:
  // https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document
  zip.file("[Content_Types].xml", `${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `${xmlHeader}<workbook xmlns="${ns}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets><sheet name="Free trial leads" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", `${xmlHeader}<worksheet xmlns="${ns}"><dimension ref="A1:I${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols>${columns.map(([, width], index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${header}${rows}</sheetData><autoFilter ref="A1:I${lastRow}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>`);
  const xf = (numFmtId: number, fillId: number) => `<xf numFmtId="${numFmtId}" fontId="0" fillId="${fillId}" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`;
  zip.file("xl/styles.xml", `${xmlHeader}<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd mmm yyyy, hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B2545"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>${xf(49, 0)}${xf(164, 0)}${xf(49, 3)}${xf(164, 3)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 3 } });
}
