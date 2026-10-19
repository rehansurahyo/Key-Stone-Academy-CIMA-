"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Notice, secondaryClass } from "./shared";
import type { ExamLevel } from "@/lib/exam-levels";

export type FreeMockIds = Partial<Record<ExamLevel, string>>;
export type FreeMockControls = {
  ids: FreeMockIds;
  busy: boolean;
  ready: boolean;
  select: (exam: { id: string; name: string; level: ExamLevel; revision: number }) => Promise<void>;
};

export function SetFreeMockButton({ exam, controls }: {
  exam: { id: string; name: string; level: ExamLevel; revision: number };
  controls: FreeMockControls;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  return <>
    <button type="button" aria-label={`Set ${exam.name} as free mock`} disabled={controls.busy || !controls.ready}
      className={`${secondaryClass} px-3 py-1.5 text-xs`} onClick={() => { setError(""); setOpen(true); }}>
      <Gift className="size-3.5" />Set as Free Mock
    </button>
    <AlertDialog open={open} onOpenChange={next => { if (!controls.busy) setOpen(next); }}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto [overflow-wrap:anywhere]" onEscapeKeyDown={event => { if (controls.busy) event.preventDefault(); }}>
        <AlertDialogHeader><AlertDialogTitle>Change {exam.level} free mock?</AlertDialogTitle>
          <AlertDialogDescription>“{exam.name}” will be the free mock for new {exam.level} trial registrations. It replaces the current free selection for this level only. Existing students keep their assigned mock, answers, timers and attempts.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <Notice error message={error} />}
        <AlertDialogFooter><AlertDialogCancel disabled={controls.busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={controls.busy || !controls.ready} className="bg-[#0B2545] text-white hover:bg-[#133E68]" onClick={async event => {
            event.preventDefault(); setError("");
            try { await controls.select(exam); setOpen(false); }
            catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to change the free mock."); }
          }}>{controls.busy ? "Saving…" : "Yes, Set as Free Mock"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
