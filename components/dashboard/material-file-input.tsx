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
