"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mockSchema } from "@/lib/dashboard/validation";
import { subtaskLabel, type ExamSubtask, type WeightageUnit } from "@/lib/exam-subtasks";
import { inputClass, primaryClass, secondaryClass, Notice, sendJson } from "./shared";
import type { ExamMaterial, ExamQuestion, MockExam } from "@/lib/dashboard/types";
import { getSubtasks } from "@/lib/exam-subtasks";
import { EXAM_LEVELS, LEVEL_NAMES } from "@/lib/exam-levels";

type QuestionDraft = {
  key: string; from: string; to: string; subject: string; intro: string; taskPrompt: string;
  subtasks: (ExamSubtask & { key: string })[]; weightageUnit: WeightageUnit; timeMinutes: number; file: File | null; retained: ExamMaterial[];
};
const makeQuestion = (key = crypto.randomUUID()): QuestionDraft => ({ key, from: "Finance Director", to: "Senior Finance Manager", subject: "", intro: "", taskPrompt: "Please prepare briefing papers for the following:", subtasks: [{ key: `${key}-a`, description: "", weightage: 55 }, { key: `${key}-b`, description: "", weightage: 45 }], weightageUnit: "percent", timeMinutes: 60, file: null, retained: [] });

export type MockEditState = { exam: MockExam; questions: ExamQuestion[]; materials: ExamMaterial[]; attemptCount: number };
export function MockUploadForm({ initialExam }: { initialExam?: MockEditState }) {
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => initialExam ? initialExam.questions.map(q => ({
    ...makeQuestion(q.id), ...q.content, key: q.id, timeMinutes: q.duration_seconds / 60,
    weightageUnit: q.content.weightageUnit ?? "percent",
    subtasks: getSubtasks(q.content).map((task, index) => ({ ...task, key: `${q.id}-task-${index}` })),
    retained: initialExam.materials.filter(m => m.kind === "reference" && m.question_id === q.question_id),
  })) : [makeQuestion("first")]);
  const [retainedPreseen, setRetainedPreseen] = useState(() => initialExam?.materials.filter(m => m.kind === "preseen") ?? []);
  const [retainedSolutions, setRetainedSolutions] = useState(() => initialExam?.materials.filter(m => m.kind === "solution") ?? []);
  const [preseen, setPreseen] = useState<File | null>(null);
  const [solutionGuide, setSolutionGuide] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  function update(key: string, patch: Partial<QuestionDraft>) {
    setQuestions(current => current.map(q => q.key === key ? { ...q, ...patch } : q));
  }
  function updateSubtask(questionKey: string, taskKey: string, patch: Partial<ExamSubtask>) {
    setQuestions(current => current.map(q => q.key === questionKey ? { ...q, subtasks: q.subtasks.map(task => task.key === taskKey ? { ...task, ...patch } : task) } : q));
  }
  return <form className="space-y-6" onSubmit={async event => {
    event.preventDefault(); setError(""); setBusy(true);
    const uploaded: string[] = [];
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    try {
      const parsed = mockSchema.safeParse({ level: form.get("level"), name: form.get("name"), description: form.get("description"), status: initialExam ? "draft" : form.get("status"), questions, materials: [] });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const files = [
        ...(preseen ? [{ file: preseen, kind: "preseen" as const, question_id: null }] : []),
        ...(solutionGuide ? [{ file: solutionGuide, kind: "solution" as const, question_id: null }] : []),
        ...questions.flatMap((q, i) => q.file ? [{ file: q.file, kind: "reference" as const, question_id: `section-${i + 1}` }] : []),
      ];
      for (const { file } of files) {
        if (file.size > 20 * 1024 * 1024 || file.size === 0) throw new Error(`${file.name}: PDFs must be between 1 byte and 20 MB.`);
        if (!(await file.slice(0, 5).text()).startsWith("%PDF-")) throw new Error(`${file.name} is not a valid PDF document.`);
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired. Please sign in again.");
      const folder = `${user.id}/${crypto.randomUUID()}`;
      const materials: { name: string; storage_path: string; kind: "preseen" | "reference" | "solution"; question_id: string | null }[] = [
        ...(!preseen ? retainedPreseen.map(m => ({ name: m.name, storage_path: m.storage_path, kind: m.kind, question_id: null })) : []),
        ...(!solutionGuide ? retainedSolutions.map(m => ({ name: m.name, storage_path: m.storage_path, kind: m.kind, question_id: null })) : []),
        ...questions.flatMap((q, index) => !q.file ? q.retained.map(m => ({ name: m.name, storage_path: m.storage_path, kind: m.kind, question_id: `section-${index + 1}` })) : []),
      ];
      for (const [index, item] of files.entries()) {
        setProgress(`Uploading PDF ${index + 1} of ${files.length}…`);
        const path = `${folder}/${index}-${item.kind}.pdf`;
        const { error: storageError } = await supabase.storage.from("exam-materials").upload(path, item.file, { contentType: "application/pdf", upsert: false });
        if (storageError) throw new Error(storageError.message);
        uploaded.push(path);
        materials.push({ name: item.file.name, storage_path: path, kind: item.kind, question_id: item.question_id });
      }
      setProgress("Saving exam structure…");
      const result = await sendJson(initialExam ? `/api/dashboard/exams/${initialExam.exam.id}` : "/api/dashboard/exams", initialExam ? "PUT" : "POST", { ...parsed.data, materials, ...(initialExam ? { revision: initialExam.exam.revision } : {}) });
      router.push(initialExam ? `/dashboard/exams?saved=${result.action === "copied" ? "copy" : "updated"}` : "/dashboard/exams?created=1"); router.refresh();
    } catch (err) {
      // RLS only allows deletion of unattached files; committed exam PDFs remain protected.
      if (uploaded.length) {
        // Offline cleanup must not hide the original error or leave the form stuck.
        await supabase.storage.from("exam-materials").remove(uploaded).catch(() => undefined);
      }
      setError(err instanceof Error ? err.message : "Unable to upload mock exam.");
    } finally { setBusy(false); setProgress(""); }
  }}>
    {initialExam && <Notice message={initialExam.attemptCount > 0 || initialExam.exam.status === "archived" ? "Saving creates a new draft copy. The original paper, attempts, answers and feedback remain unchanged." : "Saving updates this unused mock and returns it to draft. If an attempt starts while you edit, a new draft copy will be created instead."} />}
    <fieldset disabled={busy} className="space-y-6 disabled:opacity-70">
      <label className="block max-w-md text-sm font-medium text-slate-700">Case study level<select name="level" aria-label="Case study level" defaultValue={initialExam?.exam.level ?? "SCS"} className={`${inputClass} mt-2`}>{EXAM_LEVELS.map(level => <option key={level} value={level}>{level} — {LEVEL_NAMES[level]}</option>)}</select></label>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="mb-5 text-lg font-semibold text-[#0B2545]">Exam details</h2><div className="grid gap-5 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700">Exam name<input name="name" defaultValue={initialExam ? initialExam.attemptCount > 0 ? `${initialExam.exam.name.slice(0, 184)} — Revised draft` : initialExam.exam.name : undefined} required maxLength={200} placeholder="CGMA Strategic Case Study — Mock 4" className={`${inputClass} mt-2`} /></label><label className="block text-sm font-medium text-slate-700">Availability<select name="status" disabled={Boolean(initialExam)} className={`${inputClass} mt-2`} defaultValue="draft"><option value="draft">Draft — staff only</option><option value="published">Published — available to students</option></select></label><label className="block text-sm font-medium text-slate-700 md:col-span-2">Description<textarea name="description" defaultValue={initialExam?.exam.description} maxLength={5000} rows={2} className={`${inputClass} mt-2`} /></label></div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><FileText className="size-5 text-cyan-600" /><h2 className="text-lg font-semibold text-[#0B2545]">Pre-seen material</h2></div><p className="mb-4 text-sm text-slate-500">Upload the complete PDF. It will be available throughout the exam.</p><input aria-label="Pre-seen PDF" type="file" accept="application/pdf,.pdf" className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-cyan-50 file:px-3 file:py-1 file:text-cyan-800`} onChange={e => setPreseen(e.target.files?.[0] ?? null)} /><p className="mt-2 text-xs text-slate-500">PDF only · maximum 20 MB</p></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><FileText className="size-5 text-cyan-600" /><h2 className="text-lg font-semibold text-[#0B2545]">Suggested solution guide</h2></div><p className="mb-4 text-sm text-slate-500">Upload the official solution PDF. It is released only after a student submits this mock.</p><input aria-label="Suggested solution PDF" type="file" accept="application/pdf,.pdf" className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-cyan-50 file:px-3 file:py-1 file:text-cyan-800`} onChange={e => setSolutionGuide(e.target.files?.[0] ?? null)} /><p className="mt-2 text-xs text-slate-500">PDF only · maximum 20 MB · not available during the exam</p></section>
      {retainedPreseen.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-2 text-sm font-medium text-slate-700">Existing pre-seen PDFs {preseen && "(replaced by your new upload)"}</p>{retainedPreseen.map(m => <div key={m.id} className="flex items-center justify-between gap-3 py-1"><a className="text-sm text-blue-700 hover:underline" href={`/api/dashboard/materials/${m.id}`} target="_blank" rel="noreferrer">{m.name}</a><button type="button" aria-label={`Remove retained PDF ${m.name}`} className="text-xs text-red-700" onClick={() => setRetainedPreseen(current => current.filter(item => item.id !== m.id))}>Remove from draft</button></div>)}</section>}
      {retainedSolutions.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-2 text-sm font-medium text-slate-700">Existing solution guides {solutionGuide && "(replaced by your new upload)"}</p>{retainedSolutions.map(m => <div key={m.id} className="flex items-center justify-between gap-3 py-1"><a className="text-sm text-blue-700 hover:underline" href={`/api/dashboard/materials/${m.id}`} target="_blank" rel="noreferrer">{m.name}</a><button type="button" aria-label={`Remove retained solution ${m.name}`} className="text-xs text-red-700" onClick={() => setRetainedSolutions(current => current.filter(item => item.id !== m.id))}>Remove from draft</button></div>)}</section>}
      {questions.map((q, index) => <section key={q.key} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-[#0B2545]">Question {index + 1}</h2>{questions.length > 1 && <button type="button" aria-label={`Remove question ${index + 1}`} onClick={() => setQuestions(current => current.filter(item => item.key !== q.key))} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" /></button>}</div><div className="grid gap-5 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">From<input value={q.from} required maxLength={200} onChange={e => update(q.key, { from: e.target.value })} className={`${inputClass} mt-2`} /></label>
        <label className="text-sm font-medium text-slate-700">To<input value={q.to} required maxLength={200} onChange={e => update(q.key, { to: e.target.value })} className={`${inputClass} mt-2`} /></label>
        <label className="text-sm font-medium text-slate-700">Subject<input value={q.subject} required maxLength={300} onChange={e => update(q.key, { subject: e.target.value })} className={`${inputClass} mt-2`} /></label>
        <label className="text-sm font-medium text-slate-700">Time per question (minutes)<input type="number" min={1} max={180} step={1} required value={q.timeMinutes} onChange={e => update(q.key, { timeMinutes: Number(e.target.value) })} className={`${inputClass} mt-2`} /></label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Scenario / background<textarea required rows={4} maxLength={20000} value={q.intro} onChange={e => update(q.key, { intro: e.target.value })} className={`${inputClass} mt-2`} /></label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Task instruction<input required maxLength={20000} value={q.taskPrompt} onChange={e => update(q.key, { taskPrompt: e.target.value })} className={`${inputClass} mt-2`} /></label>
        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4"><h3 className="text-sm font-semibold text-[#0B2545]">Subtasks & weightage</h3><label className="text-xs font-medium text-slate-600">Weightage unit<select aria-label={`Question ${index + 1} weightage unit`} value={q.weightageUnit} onChange={e => update(q.key, { weightageUnit: e.target.value as WeightageUnit })} className={`${inputClass} mt-1`}><option value="percent">Percentage (%)</option><option value="marks">Marks</option></select></label></div>
          {q.subtasks.map((task, taskIndex) => <div key={task.key} className="grid items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_140px_auto]">
            <label className="text-sm font-medium text-slate-700">Sub-task ({subtaskLabel(taskIndex)})<textarea aria-label={`Question ${index + 1} subtask ${taskIndex + 1} description`} required rows={3} maxLength={20000} value={task.description} onChange={e => updateSubtask(q.key, task.key, { description: e.target.value })} className={`${inputClass} mt-2`} /></label>
            <label className="text-xs font-medium text-slate-700">Weightage ({q.weightageUnit === "percent" ? "%" : "marks"})<input aria-label={`Question ${index + 1} subtask ${taskIndex + 1} weightage`} required type="number" min={0.01} max={q.weightageUnit === "percent" ? 100 : 100000} step={0.01} value={task.weightage || ""} onChange={e => updateSubtask(q.key, task.key, { weightage: Number(e.target.value) })} className={`${inputClass} mt-2`} /></label>
            <button type="button" disabled={q.subtasks.length === 1} aria-label={`Remove question ${index + 1} subtask ${taskIndex + 1}`} onClick={() => update(q.key, { subtasks: q.subtasks.filter(t => t.key !== task.key) })} className="mt-5 rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"><Trash2 className="size-4" /></button>
          </div>)}
          <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" aria-label={`Add subtask to question ${index + 1}`} disabled={q.subtasks.length >= 100} onClick={() => update(q.key, { subtasks: [...q.subtasks, { key: crypto.randomUUID(), description: "", weightage: 0 }] })} className={secondaryClass}><Plus className="size-4" />Add subtask</button><p role="status" className="text-xs font-medium text-slate-600">Total weightage: {Number(q.subtasks.reduce((sum, t) => sum + t.weightage, 0).toFixed(2))}{q.weightageUnit === "percent" ? "% (required: 100%)" : " marks"}</p></div>
        </div>
        {q.retained.length > 0 && <div className="space-y-2 md:col-span-2"><p className="text-xs text-slate-500">Existing reference PDFs {q.file && "(replaced by your new upload)"}</p>{q.retained.map(m => <div key={m.id} className="flex items-center justify-between gap-3"><a className="text-sm text-blue-700 hover:underline" href={`/api/dashboard/materials/${m.id}`} target="_blank" rel="noreferrer">{m.name}</a><button type="button" aria-label={`Remove retained PDF ${m.name}`} className="text-xs text-red-700" onClick={() => update(q.key, { retained: q.retained.filter(item => item.id !== m.id) })}>Remove from draft</button></div>)}</div>}
        <label className="text-sm font-medium text-slate-700">Question reference PDF (optional)<input type="file" accept="application/pdf,.pdf" className={`${inputClass} mt-2`} onChange={e => update(q.key, { file: e.target.files?.[0] ?? null })} /></label>
      </div></section>)}
      <div className="flex flex-wrap items-center justify-between gap-4"><button type="button" disabled={questions.length >= 12} onClick={() => setQuestions(current => [...current, makeQuestion()])} className={secondaryClass}><Plus className="size-4" />Add question</button><button className={primaryClass}><Upload className="size-4" />{initialExam ? "Save draft changes" : "Save mock exam"}</button></div>
    </fieldset>
    {busy && <Notice message={progress || "Preparing upload…"} />}{error && <Notice error message={error} />}
  </form>;
}
