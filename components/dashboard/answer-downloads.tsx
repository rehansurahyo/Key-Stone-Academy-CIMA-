import { FileDown } from "lucide-react";
import { secondaryClass } from "./shared";

export function AnswerDownloads({ submissionId }: { submissionId: string }) {
  return <div aria-label="Download answer sheet" className="flex flex-wrap items-center gap-2">
    <a className={secondaryClass} href={`/api/submissions/${submissionId}/answers?format=docx`}><FileDown className="size-4" />Download as Word (.docx)</a>
    <a className={secondaryClass} href={`/api/submissions/${submissionId}/answers?format=pdf`}><FileDown className="size-4" />Download as PDF (.pdf)</a>
  </div>;
}
