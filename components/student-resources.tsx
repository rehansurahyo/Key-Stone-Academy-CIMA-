import { BookOpen, MessageCircle } from "lucide-react";
import type { ExamLevel } from "@/lib/exam-levels";
import { STUDENT_RESOURCES } from "@/lib/student-resources";

export function StudentResources({ level }: { level: ExamLevel }) {
  const links = STUDENT_RESOURCES[level];
  return <aside aria-label={`${level} study resources`} className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="font-semibold text-[#0B2545]">Free {level} study resources</h2>
    <div className="mt-3 flex flex-wrap gap-3">
      <a href={links.course} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-[#0B2545] px-4 py-2 text-sm font-semibold text-white"><BookOpen aria-hidden className="size-4 shrink-0" />Explore {level} mini-course</a>
      <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"><MessageCircle aria-hidden className="size-4 shrink-0" />Join {level} WhatsApp group</a>
    </div>
  </aside>;
}
