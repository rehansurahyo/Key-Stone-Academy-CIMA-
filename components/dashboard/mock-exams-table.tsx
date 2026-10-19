"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send, Pencil, Archive, Trash2, RotateCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Notice, secondaryClass, sendJson, StatusBadge } from "./shared";
import type { MockExam } from "@/lib/dashboard/types";
import { SetFreeMockButton, type FreeMockControls } from "./set-free-mock-button";

export type MockExamListItem = MockExam & { questions: { id: string; duration_seconds: number }[]; materials: { id: string; name: string }[]; attemptCount?: number };

function MockExamRow({ exam, announce, managementReady, freeMockControls }: { exam: MockExamListItem; announce: (message: string) => void; managementReady: boolean; freeMockControls?: FreeMockControls }) {
  const [status, setStatus] = useState(exam.status);
  const [revision, setRevision] = useState(exam.revision ?? 0);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<"unpublish" | "remove" | null>(null);
  const router = useRouter();
  const blocked = busy || !managementReady || Boolean(freeMockControls?.busy);
  const isFreeMock = freeMockControls?.ids[exam.level] === exam.id;
  const attempted = (exam.attemptCount ?? 0) > 0;
  async function mutate(action: "publish" | "unpublish" | "remove" | "restore") {
    if (blocked) return;
    setBusy(true); setError("");
    try {
      const body = action === "remove" ? { revision } : action === "restore" ? { action, revision } : { status: action === "publish" ? "published" : "draft", revision };
      const result = await sendJson(`/api/dashboard/exams/${exam.id}`, action === "remove" ? "DELETE" : "PATCH", body);
      if (result.action === "deleted") { setRemoved(true); announce("Unused mock deleted. Shared PDF files and other exams were not changed."); }
      else {
        if (!["draft", "published", "archived"].includes(result.status ?? "")) throw new Error("Unexpected response. Reload to verify this mock's status.");
        setStatus(result.status as MockExam["status"]); setRevision(result.revision ?? revision + 1);
        announce(result.status === "archived" ? "Mock archived. Attempts, answers and feedback are preserved." : action === "unpublish" ? "Mock unpublished. Existing attempts can continue; new attempts are disabled." : action === "restore" ? "Mock restored as a staff-only draft." : "Mock published and available to students.");
      }
      setConfirmation(null); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update this mock."); }
    finally { setBusy(false); }
  }
  if (removed) return null;
  return <TableRow>
    <TableCell><span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">{exam.level ?? "SCS"}</span></TableCell>
    <TableCell className="max-w-sm whitespace-normal py-5 pl-5"><p className="font-semibold text-[#0B2545]">{exam.name}</p><p className="mt-1 text-xs text-slate-500">{exam.description}</p><p className="mt-2 text-xs text-slate-500">{exam.attemptCount ?? 0} attempts {exam.copied_from && "· Revised draft copy"}</p>{error && !confirmation && <div className="mt-3"><Notice error message={error} /></div>}</TableCell>
    <TableCell><p>{exam.questions.length} questions</p><p className="mt-1 text-xs text-slate-500">{exam.questions.map(q => `${q.duration_seconds / 60} min`).join(" / ")}</p></TableCell>
    <TableCell><div className="flex flex-col gap-1">{exam.materials.length ? exam.materials.map(m => <a key={m.id} href={`/api/dashboard/materials/${m.id}`} target="_blank" rel="noreferrer" className="text-sm text-blue-700 hover:underline">{m.name}</a>) : <span className="text-xs text-slate-400">No PDFs</span>}</div></TableCell>
    <TableCell><div className="flex flex-wrap items-center gap-2"><StatusBadge status={status} />{isFreeMock && <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status === "published" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-100 text-slate-600"}`}>{status === "published" ? "Free mock" : "Free mock (unavailable)"}</span>}{busy && <LoaderCircle aria-label="Updating mock" className="size-4 animate-spin" />}</div><div className="mt-3 flex flex-wrap gap-2">
      {status === "draft" && <button aria-label={`Publish ${exam.name}`} disabled={blocked} onClick={() => void mutate("publish")} className={`${secondaryClass} px-3 py-1.5 text-xs`}><Send className="size-3.5" />{busy ? "Publishing…" : "Publish"}</button>}
      {status === "published" && <button aria-label={`Unpublish ${exam.name}`} disabled={blocked} onClick={() => { setError(""); setConfirmation("unpublish"); }} className={`${secondaryClass} px-3 py-1.5 text-xs`}>Unpublish</button>}
      {status === "published" && !isFreeMock && freeMockControls && <SetFreeMockButton exam={{ ...exam, revision }} controls={{ ...freeMockControls, ready: freeMockControls.ready && !busy && managementReady }} />}
      {status === "archived" ? <button aria-label={`Restore ${exam.name}`} disabled={blocked} onClick={() => void mutate("restore")} className={`${secondaryClass} px-3 py-1.5 text-xs`}><RotateCcw className="size-3.5" />Restore draft</button> : <>
        <Link aria-label={`Edit ${exam.name}`} aria-disabled={blocked} tabIndex={blocked ? -1 : undefined} href={`/dashboard/exams/${exam.id}/edit`} className={`${secondaryClass} px-3 py-1.5 text-xs ${blocked ? "pointer-events-none opacity-50" : ""}`}><Pencil className="size-3.5" />{attempted ? "Edit copy" : "Edit"}</Link>
        <button aria-label={`${attempted ? "Archive" : "Delete"} ${exam.name}`} disabled={blocked} onClick={() => { setError(""); setConfirmation("remove"); }} className={`${secondaryClass} px-3 py-1.5 text-xs text-red-700`}>{attempted ? <Archive className="size-3.5" /> : <Trash2 className="size-3.5" />}{attempted ? "Archive" : "Delete"}</button>
      </>}
    </div>
      <AlertDialog open={confirmation !== null} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
        <AlertDialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}><AlertDialogHeader>
          <AlertDialogTitle>{confirmation === "unpublish" ? "Unpublish mock exam?" : attempted ? "Archive mock exam?" : "Delete unused mock exam?"}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation === "unpublish" ? `“${exam.name}” will stop accepting new attempts. Existing students can continue, and their answers and feedback remain safe.${isFreeMock ? " New trial registrations for this level will be unavailable until you publish this mock again or choose another published free mock." : ""}` : attempted ? `“${exam.name}” has student attempts and will be archived, not deleted. All exam content, answers and grades are retained.` : `Delete “${exam.name}”? This removes the unused mock and its question/PDF metadata. If an attempt has started meanwhile, it will be archived instead. Shared PDF files are never deleted.`}</AlertDialogDescription>
        </AlertDialogHeader>{error && <Notice error message={error} />}<AlertDialogFooter><AlertDialogCancel disabled={blocked}>Cancel</AlertDialogCancel><AlertDialogAction disabled={blocked} className="bg-[#0B2545] text-white hover:bg-[#133E68]" onClick={event => { event.preventDefault(); void mutate(confirmation === "unpublish" ? "unpublish" : "remove"); }}>{busy ? "Working…" : confirmation === "unpublish" ? "Yes, Unpublish" : attempted ? "Yes, Archive" : "Yes, Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </TableCell>
    <TableCell className="pr-5">{status === "published" ? <Link href={`/exam/${exam.id}`} className="font-semibold text-blue-700 hover:underline">Open exam</Link> : <span className="text-xs text-slate-400">{status === "archived" ? "Archived — existing attempts only" : "Staff draft"}</span>}</TableCell>
  </TableRow>;
}

export function MockExamsTable({ exams, managementReady = true, freeMockControls }: { exams: MockExamListItem[]; managementReady?: boolean; freeMockControls?: FreeMockControls }) {
  const [notice, setNotice] = useState("");
  return <>{notice && <div className="mb-4"><Notice message={notice} /></div>}<div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white"><Table><TableHeader className="bg-slate-50"><TableRow><TableHead>Level</TableHead><TableHead className="pl-5">Exam</TableHead><TableHead>Questions / timing</TableHead><TableHead>Materials</TableHead><TableHead>Status / actions</TableHead><TableHead>Student link</TableHead></TableRow></TableHeader><TableBody>{exams.length === 0 ? <TableRow><TableCell colSpan={6} className="py-14 text-center text-slate-500">No mocks in this view.</TableCell></TableRow> : exams.map(exam => <MockExamRow key={`${exam.id}-${exam.status}-${exam.revision}`} exam={exam} announce={setNotice} managementReady={managementReady} freeMockControls={freeMockControls} />)}</TableBody></Table></div></>;
}
