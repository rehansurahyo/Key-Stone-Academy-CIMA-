import "server-only";
import { inflateRawSync } from "node:zlib";
import { DOCX_MIME, DOC_MIME, MAX_REPORT_BYTES, reportExtension } from "./report-files";

// Inspect bounded compound-file directory sectors, not just a renamed suffix.
function legacyWord(bytes: Uint8Array) {
  const data = Buffer.from(bytes);
  const invalid = () => new Error("Upload a valid Word (.doc) document.");
  if (data.length < 512 || data.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1" || data.readUInt16LE(28) !== 0xfffe) throw invalid();
  const shift = data.readUInt16LE(30);
  if (![9, 12].includes(shift)) throw invalid();
  const sectorSize = 1 << shift;
  const sectorCount = Math.floor(data.length / sectorSize) - 1;
  const sector = (id: number) => {
    if (id >= sectorCount) throw invalid();
    return data.subarray((id + 1) * sectorSize, (id + 2) * sectorSize);
  };
  const fatCount = data.readUInt32LE(44);
  if (!fatCount || fatCount > sectorCount) throw invalid();
  const fatIds: number[] = [];
  for (let index = 0; index < 109; index++) {
    const id = data.readUInt32LE(76 + index * 4);
    if (id !== 0xffffffff) fatIds.push(id);
  }
  // Larger Word 97-2003 files use additional DIFAT sectors beyond the header.
  const difatCount = data.readUInt32LE(72);
  if (difatCount > sectorCount) throw invalid();
  let difatId = data.readUInt32LE(68);
  const difatSeen = new Set<number>();
  for (let index = 0; index < difatCount; index++) {
    if (difatSeen.has(difatId)) throw invalid();
    difatSeen.add(difatId);
    const table = sector(difatId);
    for (let offset = 0; offset < sectorSize - 4; offset += 4) {
      const id = table.readUInt32LE(offset);
      if (id !== 0xffffffff) fatIds.push(id);
    }
    difatId = table.readUInt32LE(sectorSize - 4);
  }
  if (fatIds.length !== fatCount || new Set(fatIds).size !== fatCount || difatId !== 0xfffffffe) throw invalid();
  const fat = fatIds.map(sector);
  const seen = new Set<number>();
  let current = data.readUInt32LE(48);
  let hasWordStream = false;
  while (current !== 0xfffffffe) {
    if (seen.has(current) || seen.size >= sectorCount) throw invalid();
    seen.add(current);
    const directory = sector(current);
    for (let offset = 0; offset < directory.length; offset += 128) {
      const length = directory.readUInt16LE(offset + 64);
      if (!length) continue;
      if (length < 2 || length > 64 || length % 2) throw invalid();
      const name = directory.subarray(offset, offset + length - 2).toString("utf16le");
      if (["VBA", "Macros", "_VBA_PROJECT_CUR"].includes(name)) throw new Error("Macro-enabled documents are not supported. Upload a PDF or macro-free Word report.");
      if (name === "WordDocument" && directory[offset + 66] === 2 && directory.readUInt32LE(offset + 120) > 0) hasWordStream = true;
    }
    const table = fat[Math.floor(current / (sectorSize / 4))];
    if (!table) throw invalid();
    current = table.readUInt32LE((current % (sectorSize / 4)) * 4);
  }
  if (!hasWordStream) throw invalid();
}

// Only the required XML parts are inflated, with a hard allocation limit.
// Reject ZIP64, encrypted archives, excessive entries and oversized packages.
function wordParts(bytes: Uint8Array) {
  const data = Buffer.from(bytes);
  let end = -1;
  for (let offset = data.length - 22; offset >= Math.max(0, data.length - 65557); offset--) {
    if (data.readUInt32LE(offset) === 0x06054b50 && offset + 22 + data.readUInt16LE(offset + 20) === data.length) { end = offset; break; }
  }
  if (end < 0 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) throw new Error("Invalid Word archive.");
  const count = data.readUInt16LE(end + 10);
  if (count > 5000 || count !== data.readUInt16LE(end + 8)) throw new Error("This Word archive has too many entries.");
  let offset = data.readUInt32LE(end + 16);
  const directoryEnd = offset + data.readUInt32LE(end + 12);
  if (directoryEnd > end) throw new Error("Invalid Word archive directory.");
  const parts = new Map<string, string>();
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > directoryEnd || data.readUInt32LE(offset) !== 0x02014b50) throw new Error("Damaged Word archive.");
    const flags = data.readUInt16LE(offset + 8), method = data.readUInt16LE(offset + 10);
    const size = data.readUInt32LE(offset + 24), compressed = data.readUInt32LE(offset + 20);
    const nameSize = data.readUInt16LE(offset + 28), extra = data.readUInt16LE(offset + 30), comment = data.readUInt16LE(offset + 32);
    if (offset + 46 + nameSize + extra + comment > directoryEnd) throw new Error("Damaged Word archive.");
    const name = data.subarray(offset + 46, offset + 46 + nameSize).toString("utf8");
    total += size;
    if ((flags & 1) || size > 20 * 1024 * 1024 || total > 50 * 1024 * 1024) throw new Error("Encrypted or oversized Word packages are not supported.");
    if (/vbaProject|\.exe$|\.dll$|\.bin$/i.test(name)) throw new Error("Macro-enabled or embedded executable documents are not supported.");
    if (["[Content_Types].xml", "word/document.xml", "_rels/.rels"].includes(name)) {
      const limit = name === "word/document.xml" ? 20 * 1024 * 1024 : 512 * 1024;
      if (parts.has(name) || size > limit) throw new Error("Invalid Word document parts.");
      const local = data.readUInt32LE(offset + 42);
      if (local + 30 > data.length || data.readUInt32LE(local) !== 0x04034b50) throw new Error("Damaged Word document part.");
      const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
      if (start + compressed > data.length || ![0, 8].includes(method)) throw new Error("Invalid Word compression.");
      const raw = data.subarray(start, start + compressed);
      const content = method === 8 ? inflateRawSync(raw, { maxOutputLength: limit }) : raw;
      if (content.length !== size) throw new Error("Damaged Word document part.");
      parts.set(name, content.toString("utf8"));
    }
    offset += 46 + nameSize + extra + comment;
  }
  if (offset !== directoryEnd || !parts.get("[Content_Types].xml")?.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") || !/<(?:\w+:)?document\b/.test(parts.get("word/document.xml") ?? "") || !/<(?:\w+:)?Relationships\b/.test(parts.get("_rels/.rels") ?? "")) throw new Error("Upload a valid Word (.docx) document, not a renamed ZIP.");
}

export async function validateReport(bytes: Uint8Array, name: string) {
  if (!bytes.length || bytes.length > MAX_REPORT_BYTES) throw new Error("Reports must be between 1 byte and 20 MB.");
  if (reportExtension(name) === "pdf") {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("This file is not a PDF.");
    return "application/pdf";
  }
  if (reportExtension(name) === "doc") {
    legacyWord(bytes);
    return DOC_MIME;
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("This file is not a Word document.");
  wordParts(bytes);
  return DOCX_MIME;
}
