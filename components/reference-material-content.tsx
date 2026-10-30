"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { isReferenceImage } from "@/lib/exam-material-files";
import type { ExamMaterial } from "@/lib/dashboard/types";

export function ReferenceMaterialContent({ material, url }: { material: ExamMaterial; url: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [bounds, setBounds] = useState({ width: 600, height: 400 });
  const viewport = useRef<HTMLDivElement>(null);
  const image = isReferenceImage(material.storage_path);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (width > 0 && height > 0) setBounds(current => current.width === width && current.height === height ? current : { width, height });
    };
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const scale = zoom / 100;
  return <>
    <div role="toolbar" aria-label="Reference material zoom" className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-800">
      <button type="button" aria-label="Zoom out reference material" disabled={zoom <= 50} onClick={() => setZoom(current => Math.max(50, current - 25))} className="grid size-8 place-items-center rounded border bg-white hover:bg-slate-100 disabled:opacity-40"><ZoomOut className="size-4" /></button>
      <output aria-live="polite" aria-label="Reference zoom level" className="w-11 text-center tabular-nums">{zoom}%</output>
      <button type="button" aria-label="Zoom in reference material" disabled={zoom >= 300} onClick={() => setZoom(current => Math.min(300, current + 25))} className="grid size-8 place-items-center rounded border bg-white hover:bg-slate-100 disabled:opacity-40"><ZoomIn className="size-4" /></button>
      <button type="button" aria-label="Fit reference material to width" onClick={() => setZoom(100)} className="h-8 rounded border bg-white px-2 hover:bg-slate-100">Fit width</button>
      <a href={url} target="_blank" rel="noreferrer" className="ml-auto px-1 py-2 text-blue-800 underline">Open original</a>
    </div>
    <div ref={viewport} aria-label="Reference document viewport" className="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-100">
      {image ? failedUrl === url
        ? <p role="alert" className="p-3 text-sm text-red-800">Unable to display this image. Please check your connection or reopen the reference material.</p>
        // Signed private Storage URLs renew independently of the Next.js image cache.
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={url} alt={material.name} style={{ width: `${zoom}%`, maxWidth: "none", height: "auto" }} onError={() => setFailedUrl(url)} />
        : <div style={{ width: bounds.width * scale, height: bounds.height * scale }}>
          {/* Scale the live PDF surface, preserving its page and scroll state.
              Changing only a PDF URL's #zoom fragment is not reliable across viewers. */}
          <iframe title={material.name} src={`${url.split("#")[0]}#toolbar=0&navpanes=0&view=FitH`} className="block border-0 bg-white" style={{ width: bounds.width, height: bounds.height, maxWidth: "none", transform: `scale(${scale})`, transformOrigin: "top left" }} />
        </div>}
    </div>
  </>;
}
