"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Grip, Maximize2, Minimize2, X } from "lucide-react";

type Rect = { x: number; y: number; width: number; height: number };
const viewport = () => typeof window === "undefined" ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight };
function constrain(rect: Rect): Rect {
  const view = viewport();
  const width = Math.min(Math.max(Math.min(320, view.width - 16), rect.width), view.width - 16);
  const height = Math.min(Math.max(Math.min(240, view.height - 64), rect.height), view.height - 64);
  return { width, height, x: Math.max(8, Math.min(rect.x, view.width - width - 8)), y: Math.max(48, Math.min(rect.y, view.height - height - 8)) };
}
const maximizedRect = (): Rect => ({ x: 8, y: 48, width: viewport().width - 16, height: viewport().height - 56 });

export function ResizableMaterialWindow({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const [rect, setRect] = useState(() => constrain({ x: 24, y: 112, width: 650, height: viewport().height * 0.72 }));
  const [maximized, setMaximized] = useState(false);
  const [layer, setLayer] = useState(40);
  const restoreRect = useRef<Rect | null>(null);
  const gesture = useRef<{ kind: "drag" | "resize"; x: number; y: number; rect: Rect; pointerId: number; target: HTMLElement } | null>(null);
  useEffect(() => {
    const stop = () => {
      const current = gesture.current;
      gesture.current = null;
      if (current?.target.hasPointerCapture?.(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
    };
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      if (current.kind === "drag") {
        setRect(constrain({ ...current.rect, x: current.rect.x + dx, y: current.rect.y + dy }));
      } else {
        const view = viewport();
        setRect(constrain({ ...current.rect, width: Math.min(current.rect.width + dx, view.width - current.rect.x - 8), height: Math.min(current.rect.height + dy, view.height - current.rect.y - 8) }));
      }
    };
    const resize = () => { stop(); setRect(current => restoreRect.current ? maximizedRect() : constrain(current)); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    window.addEventListener("resize", resize);
    return () => {
      stop();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      window.removeEventListener("resize", resize);
    };
  }, []);
  function start(event: ReactPointerEvent<HTMLElement>, kind: "drag" | "resize") {
    if (maximized || event.button !== 0) return;
    event.preventDefault();
    gesture.current = { kind, x: event.clientX, y: event.clientY, rect, pointerId: event.pointerId, target: event.currentTarget };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function toggleMaximize() {
    if (restoreRect.current) {
      setRect(constrain(restoreRect.current)); restoreRect.current = null; setMaximized(false);
    } else {
      restoreRect.current = rect; setRect(maximizedRect()); setMaximized(true);
    }
  }
  return <section role="dialog" aria-label={`${title} window`} aria-modal={false}
    className="fixed flex flex-col overflow-hidden rounded-md border border-[#0B2545] bg-white shadow-[0_18px_45px_rgba(15,23,42,.38)]"
    style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: layer }}
    onPointerDownCapture={() => {
      const next = Number(document.body.dataset.examWindowLayer ?? 40) + 1;
      document.body.dataset.examWindowLayer = String(next); setLayer(next);
    }}>
    <div className="flex h-10 shrink-0 touch-none select-none items-center justify-between gap-2 bg-[#0B2545] px-3 text-sm font-semibold text-white"
      style={{ cursor: maximized ? "default" : "move" }} onPointerDown={event => {
        if (!(event.target as HTMLElement).closest("button")) start(event, "drag");
      }}>
      <span className="truncate">{title}</span>
      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label={maximized ? "Restore reference window" : "Maximize reference window"} title={maximized ? "Restore window" : "Maximize window"} onClick={toggleMaximize} className="grid size-8 place-items-center rounded hover:bg-white/20">
          {maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="grid size-8 place-items-center rounded hover:bg-white/20"><X className="size-4" /></button>
      </div>
    </div>
    <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    <div className="flex h-8 shrink-0 items-center justify-between border-t border-slate-300 bg-slate-50 pl-3 text-[11px] text-slate-600">
      <span>{maximized ? "Restore the window to resize" : "Drag the corner to resize"}</span>
      <button type="button" aria-label="Resize reference window" title="Drag to resize, or use the arrow keys" disabled={maximized}
        className="grid size-8 touch-none select-none place-items-center text-[#0B2545] disabled:opacity-30" style={{ cursor: maximized ? "default" : "nwse-resize" }}
        onPointerDown={event => start(event, "resize")} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault(); const step = event.shiftKey ? 64 : 16;
          setRect(current => constrain({ ...current, width: current.width + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), height: current.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) }));
        }}><Grip className="size-5" /></button>
    </div>
  </section>;
}
