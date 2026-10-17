import Link from "next/link";
import { ArrowUpRight, ClipboardCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./shared";
import type { Submission } from "@/lib/dashboard/types";

export function SubmissionTable({ submissions }: { submissions: Submission[] }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.025)]">
      <Table>
        <TableHeader className="bg-slate-50/80">
          <TableRow>
            <TableHead className="pl-5">Student</TableHead><TableHead>Mock exam</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead>Score</TableHead><TableHead><span className="sr-only">Review</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="py-14 text-center">
              <ClipboardCheck className="mx-auto mb-3 size-7 text-slate-300" /><p className="text-sm font-medium text-slate-600">No submissions in this view.</p>
            </TableCell></TableRow>
          ) : submissions.map(s => {
            const name = s.student?.full_name || s.student?.email || "Student";
            return (
              <TableRow key={s.id}>
                <TableCell className="py-4 pl-5"><div className="flex items-center gap-3">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{name.slice(0, 1).toUpperCase()}</span>
                  <div><p className="font-semibold text-[#0B2545]">{name}</p><p className="mt-1 text-[11px] text-slate-500">{s.student?.email}</p></div>
                </div></TableCell>
                <TableCell className="min-w-48 max-w-sm whitespace-normal leading-relaxed text-slate-700">{s.exam?.name ?? "Mock exam"}</TableCell>
                <TableCell className="text-xs text-slate-500">{new Date(s.submitted_at).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="font-semibold tabular-nums text-slate-700">{s.score === null ? "—" : `${s.score}/100`}</TableCell>
                <TableCell className="pr-5 text-right"><Link href={`/dashboard/submissions/${s.id}`} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600">{s.status === "graded" ? "View grade" : "Review answers"}<ArrowUpRight className="size-3.5" /></Link></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
