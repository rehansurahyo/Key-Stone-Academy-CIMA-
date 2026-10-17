function safeToken(value: string, fallback: string) {
  const token = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "");
  return token.slice(0, 80) || fallback;
}

function submittedParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "unknown-date", time: "0000" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}${parts.minute}` };
}

export function answerDownloadFilename(candidate: string, examName: string, submittedAt: string, format: "docx" | "pdf" = "docx") {
  const mockMatch = /\bmock\s*#?\s*(\d+)\b/i.exec(examName);
  const mock = mockMatch ? `Mock${mockMatch[1]}` : "Mock";
  const timestamp = submittedParts(submittedAt);
  return `${safeToken(candidate, "Student")}_${mock}_${timestamp.date}_${timestamp.time}.${format}`;
}
