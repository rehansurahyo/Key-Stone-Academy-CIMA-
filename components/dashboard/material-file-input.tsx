"use client";
import { useRef } from "react";
import { inputClass } from "./shared";

export function MaterialFileInput({ label, accept, file, onChange, disabled = false, className = inputClass }: {
  label: string; accept: string; file: File | null; onChange: (file: File | null) => void; disabled?: boolean; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <span className="block"><input ref={input} aria-label={label} type="file" accept={accept} disabled={disabled} className={className} onChange={event => onChange(event.target.files?.[0] ?? null)} />
    {file && <button type="button" aria-label={`Clear ${label}`} disabled={disabled} className="mt-2 text-xs font-semibold text-red-700" onClick={() => { if (input.current) input.current.value = ""; onChange(null); }}>Clear selected file</button>}
  </span>;
}

export function MaterialFilesInput({ label, accept, files, onChange, disabled = false, lockedFiles = [], className = inputClass }: {
  label: string; accept: string; files: File[]; onChange: (files: File[]) => void; disabled?: boolean; lockedFiles?: File[]; className?: string;
}) {
  return <span className="block min-w-0">
    <input aria-label={label} type="file" multiple accept={accept} disabled={disabled} className={`${className} min-w-0 max-w-full`} onChange={event => {
      const added = Array.from(event.currentTarget.files ?? []);
      const next = [...files];
      for (const file of added) {
        if (!next.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified && item.type === file.type)) next.push(file);
      }
      onChange(next);
      // The queue owns the File objects; reset the picker so a removed file can be selected again.
      event.currentTarget.value = "";
    }} />
    {files.length > 0 && <span role="list" aria-label={`Selected ${label}`} className="mt-2 block space-y-2">{files.map((file, index) => <span role="listitem" key={index} className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
      <span className="min-w-0 [overflow-wrap:anywhere]">{file.name}</span>
      <button type="button" aria-label={`Remove ${label}: ${file.name}`} disabled={disabled || lockedFiles.includes(file)} title={lockedFiles.includes(file) ? "Retry the upload to confirm attachment before removing this file." : undefined} className="shrink-0 font-semibold text-red-700 disabled:opacity-50" onClick={() => onChange(files.filter((_, position) => position !== index))}>Remove</button>
    </span>)}</span>}
  </span>;
}
