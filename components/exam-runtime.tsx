"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  Calculator as CalculatorIcon,
  ChevronDown,
  Clock,
  Clipboard as ClipboardIcon,
  Copy,
  FileText,
  HelpCircle,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Sigma,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentSignIn } from "@/components/student-sign-in";
import { useExamAutosave } from "@/hooks/useExamAutosave";
import { useExamTimer } from "@/hooks/useExamTimer";
import { useStudentAuth } from "@/hooks/useStudentAuth";
import { useStudentExamSession } from "@/hooks/useStudentExamSession";

import { LEGACY_EXAM_ID, questionsData, type Question } from "@/lib/exam-data";
import { LEVEL_NAMES, type ExamLevel } from "@/lib/exam-levels";
import { ExamTaskList } from "@/components/exam-task-list";
import { formatWeightage, getSubtasks, subtaskLabel } from "@/lib/exam-subtasks";
import type { ExamMaterial } from "@/lib/dashboard/types";
import { useExamMaterialUrl } from "@/hooks/useExamMaterialUrl";

type WebModelContext = {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: object;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const BASE_UI_STATE_KEY = "keystone-cima-exam-ui-v1";
const baseAnswerDraftsKey = (userId: string) =>
  `keystone-cima-answer-drafts-v1:${userId}`;

// Dynamic questions array: strictly matches Keystone Mock 3 SCS PDF (supports 3 or 4 sections dynamically)

const rates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30];
const periods = Array.from({ length: 20 }, (_, index) => index + 1);

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(safeSeconds % 60).toString().padStart(2, "0")}`;
}

function normalCdf(z: number) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    sign *
    (1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
        0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

// CIMA flower/globe logo matching PDF Page 2
function CimaGlobeLogo({ className = "size-20" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
        <circle cx="50" cy="50" r="46" fill="#8E24AA" />
        <circle cx="50" cy="50" r="46" fill="url(#cima-grad)" />
        <path
          d="M20 50 C 20 30, 40 18, 50 18 C 60 18, 80 30, 80 50 C 80 70, 60 82, 50 82 C 40 82, 20 70, 20 50 Z"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          fill="none"
        />
        <path d="M50 18 L 50 82" stroke="#FFFFFF" strokeWidth="3.5" />
        <path
          d="M25 35 Q 50 48 75 35"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          fill="none"
        />
        <path
          d="M25 65 Q 50 52 75 65"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          fill="none"
        />
        <defs>
          <linearGradient
            id="cima-grad"
            x1="10"
            y1="10"
            x2="90"
            y2="90"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#9C27B0" />
            <stop offset="1" stopColor="#5E1B75" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute bottom-0 right-0 text-[10px] font-bold text-slate-500">
        ®
      </span>
    </div>
  );
}

function KeystoneHeaderLogo() {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/keystone-cima-logo.png"
        alt="Keystone Academia"
        className="h-7 sm:h-9 object-contain bg-white rounded px-1"
      />
    </div>
  );
}

function FloatingWindow({
  title,
  onClose,
  initial,
  width,
  children,
}: {
  title: string;
  onClose: () => void;
  initial: { x: number; y: number };
  width: number;
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState(initial);
  const [layer, setLayer] = useState(40);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
    null,
  );
  const move = useCallback(
    (event: PointerEvent) => {
      if (!drag.current) return;
      setPosition({
        x: Math.min(
          Math.max(4, drag.current.left + event.clientX - drag.current.x),
          Math.max(4, window.innerWidth - width - 4),
        ),
        y: Math.min(
          Math.max(40, drag.current.top + event.clientY - drag.current.y),
          Math.max(40, window.innerHeight - 80),
        ),
      });
    },
    [width],
  );
  const stop = useCallback(() => {
    drag.current = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  }, [move]);
  useEffect(() => () => stop(), [stop]);
  return (
    <section
      className="fixed z-40 bg-transparent shadow-[0_18px_45px_rgba(15,23,42,.38)] max-w-[96vw]"
      style={{ left: position.x, top: position.y, width, zIndex: layer }}
      onPointerDownCapture={() => {
        const nextLayer = Number(document.body.dataset.examWindowLayer ?? 40) + 1;
        document.body.dataset.examWindowLayer = String(nextLayer);
        setLayer(nextLayer);
      }}
    >
      <div
        className="flex h-9 cursor-move select-none items-center justify-between rounded-t-md bg-[#0B2545] px-3 text-[13px] font-semibold text-white"
        onPointerDown={(event) => {
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: position.x,
            top: position.y,
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", stop);
        }}
      >
        <span className="flex items-center gap-2 truncate">
          <Maximize2 className="size-3.5 shrink-0" />
          {title}
        </span>
        <button
          aria-label={`Close ${title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          className="grid size-6 shrink-0 place-items-center hover:bg-white/20 rounded text-white"
        >
          <X className="size-4" />
        </button>
      </div>
      {children}
    </section>
  );
}

function Calculator({ onClose }: { onClose: () => void }) {
  const [expression, setExpression] = useState("");
  const [answer, setAnswer] = useState("0");
  const append = (value: string) =>
    setExpression((current) => current + value);
  const evaluate = () => {
    try {
      const safe = expression
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/−/g, "-");
      if (!safe || !/^[\d+\-*/().\s]+$/.test(safe)) throw new Error();
      const result = Function(`"use strict"; return (${safe})`)();
      if (!Number.isFinite(result)) throw new Error();
      setAnswer(String(Number(result.toFixed(10))));
    } catch {
      setAnswer("Error");
    }
  };
  const scientific = (operation: string) => {
    const input = Number(answer !== "0" && !expression ? answer : expression);
    const result =
      operation === "sin"
        ? Math.sin((input * Math.PI) / 180)
        : operation === "cos"
        ? Math.cos((input * Math.PI) / 180)
        : operation === "tan"
        ? Math.tan((input * Math.PI) / 180)
        : operation === "log"
        ? Math.log10(input)
        : operation === "ln"
        ? Math.log(input)
        : operation === "sqrt"
        ? Math.sqrt(input)
        : operation === "square"
        ? input * input
        : operation === "inverse"
        ? 1 / input
        : input;
    setAnswer(
      Number.isFinite(result) ? String(Number(result.toFixed(10))) : "Error",
    );
    setExpression("");
  };
  const keys = [
    ["2nd", "accent"],
    ["mode", "round"],
    ["del", "danger"],
    ["sin", "function"],
    ["cos", "function"],
    ["tan", "function"],
    ["log", "function"],
    ["ln", "function"],
    ["x²", "function"],
    ["x⁻¹", "function"],
    ["√", "function"],
    ["(", "light"],
    [")", "light"],
    ["÷", "operator"],
    ["clear", "danger"],
    ["7", "number"],
    ["8", "number"],
    ["9", "number"],
    ["×", "operator"],
    ["−", "operator"],
    ["4", "number"],
    ["5", "number"],
    ["6", "number"],
    ["+", "operator"],
    [".", "number"],
    ["1", "number"],
    ["2", "number"],
    ["3", "number"],
    ["0", "number"],
    ["enter", "enter"],
  ];
  const press = (key: string) => {
    if (key === "clear") {
      setExpression("");
      setAnswer("0");
    } else if (key === "del") setExpression((value) => value.slice(0, -1));
    else if (key === "enter") evaluate();
    else if (["sin", "cos", "tan", "log", "ln"].includes(key)) scientific(key);
    else if (key === "√") scientific("sqrt");
    else if (key === "x²") scientific("square");
    else if (key === "x⁻¹") scientific("inverse");
    else if (!["2nd", "mode"].includes(key)) append(key);
  };

  const initialPos =
    typeof window !== "undefined"
      ? { x: Math.max(8, Math.floor((window.innerWidth - 290) / 2)), y: 70 }
      : { x: 40, y: 70 };

  return (
    <FloatingWindow
      title="TI-30XS MultiView"
      onClose={onClose}
      initial={initialPos}
      width={290}
    >
      <div className="rounded-b-[28px] border-x-[4px] border-b-[5px] border-[#151a20] bg-gradient-to-b from-[#424a52] via-[#252b31] to-[#171b20] px-3 pb-3.5 pt-2.5 shadow-[inset_0_2px_1px_rgba(255,255,255,.18)]">
        <div className="mb-1.5 flex items-end justify-between px-1 text-white">
          <div>
            <span className="text-[16px] font-semibold italic tracking-tight">
              TI-30XS
            </span>
            <span className="ml-1 text-[9px] font-bold text-[#96c7e8]">
              MultiView™
            </span>
          </div>
          <span className="text-[8px] font-semibold tracking-wide text-slate-300">
            TEXAS INSTRUMENTS
          </span>
        </div>
        <div className="mb-2 rounded-[5px] border-[3px] border-[#0e1114] bg-[#c8d3bd] px-2.5 py-1.5 shadow-[inset_0_2px_4px_rgba(21,32,20,.4)]">
          <div className="min-h-4 truncate text-right font-mono text-[11px] tracking-wider text-[#263129]">
            {expression || "DEG"}
          </div>
          <div className="min-h-6 truncate text-right font-mono text-[17px] font-bold tracking-[0.06em] text-[#18231b]">
            {answer}
          </div>
        </div>
        <div className="mb-2 flex items-center justify-between px-0.5">
          <div className="grid grid-cols-2 gap-1">
            <button
              className="calc-pill bg-[#6da7cf] text-[#102c42]"
              onClick={() => undefined}
            >
              2nd
            </button>
            <button className="calc-pill bg-[#c1c8ce] text-[#17212a]">
              mode
            </button>
          </div>
          <div
            className="relative size-[54px] rounded-full border-[3.5px] border-[#0d1115] bg-[#353d44] shadow-[inset_0_1px_2px_rgba(255,255,255,.18)]"
            aria-label="Directional pad"
          >
            <button
              aria-label="Up"
              className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[9px] text-white"
            >
              ▲
            </button>
            <button
              aria-label="Left"
              className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[9px] text-white"
            >
              ◀
            </button>
            <button
              aria-label="Right"
              className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[9px] text-white"
            >
              ▶
            </button>
            <button
              aria-label="Down"
              className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] text-white"
            >
              ▼
            </button>
            <span className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#151b20] bg-[#22292f]" />
          </div>
          <button
            className="calc-pill bg-[#ce6a62] text-white"
            onClick={() => press("del")}
          >
            del
          </button>
        </div>
        <div className="grid grid-cols-5 gap-x-1.5 gap-y-1.5">
          {keys.slice(3).map(([key, style]) => (
            <button
              key={key}
              onClick={() => press(key)}
              className={`calc-key calc-${style}`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
    </FloatingWindow>
  );
}

function ScratchPad({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [redo, setRedo] = useState<string[]>([]);
  const area = useRef<HTMLTextAreaElement>(null);
  const update = (value: string) => {
    setHistory((values) => [...values.slice(-20), text]);
    setText(value);
    setRedo([]);
  };
  const copy = async () => {
    const selected =
      area.current?.value.substring(
        area.current.selectionStart,
        area.current.selectionEnd,
      ) || text;
    await navigator.clipboard?.writeText(selected);
  };

  const initialWidth =
    typeof window !== "undefined"
      ? Math.min(480, window.innerWidth - 16)
      : 480;
  const initialPos =
    typeof window !== "undefined"
      ? {
          x: Math.max(8, Math.floor((window.innerWidth - initialWidth) / 2)),
          y: 75,
        }
      : { x: 20, y: 75 };

  return (
    <FloatingWindow
      title="Scratch Pad"
      onClose={onClose}
      initial={initialPos}
      width={initialWidth}
    >
      <div className="flex border-x border-b border-[#aeb8c2] bg-[#e5e9ed] overflow-x-auto touch-scroll">
        <button
          onClick={() => {
            void copy();
            if (area.current)
              update(
                text.slice(0, area.current.selectionStart) +
                  text.slice(area.current.selectionEnd),
              );
          }}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border-r border-[#c5ced7] px-3 text-xs sm:text-[13px] font-semibold text-[#17324f] hover:bg-[#dfe8ef] active:bg-[#d3dfe8] whitespace-nowrap"
        >
          <Scissors className="size-3.5 shrink-0" />
          Cut
        </button>
        <button
          onClick={() => void copy()}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border-r border-[#c5ced7] px-3 text-xs sm:text-[13px] font-semibold text-[#17324f] hover:bg-[#dfe8ef] active:bg-[#d3dfe8] whitespace-nowrap"
        >
          <Copy className="size-3.5 shrink-0" />
          Copy
        </button>
        <button
          onClick={async () => update(text + (await navigator.clipboard.readText()))}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border-r border-[#c5ced7] px-3 text-xs sm:text-[13px] font-semibold text-[#17324f] hover:bg-[#dfe8ef] active:bg-[#d3dfe8] whitespace-nowrap"
        >
          <ClipboardIcon className="size-3.5 shrink-0" />
          Paste
        </button>
        <button
          disabled={!history.length}
          onClick={() => {
            const last = history.at(-1);
            if (last !== undefined) {
              setRedo((values) => [...values, text]);
              setText(last);
              setHistory((values) => values.slice(0, -1));
            }
          }}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border-r border-[#c5ced7] px-3 text-xs sm:text-[13px] font-semibold text-[#17324f] hover:bg-[#dfe8ef] active:bg-[#d3dfe8] disabled:opacity-40"
        >
          <Undo2 className="size-3.5 shrink-0" />
        </button>
        <button
          disabled={!redo.length}
          onClick={() => {
            const next = redo.at(-1);
            if (next !== undefined) {
              setHistory((values) => [...values, text]);
              setText(next);
              setRedo((values) => values.slice(0, -1));
            }
          }}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border-r border-[#c5ced7] px-3 text-xs sm:text-[13px] font-semibold text-[#17324f] hover:bg-[#dfe8ef] active:bg-[#d3dfe8] disabled:opacity-40"
        >
          <Redo2 className="size-3.5 shrink-0" />
        </button>
      </div>
      <textarea
        ref={area}
        value={text}
        onChange={(event) => update(event.target.value)}
        autoFocus
        placeholder="Type notes here. Scratch pad content is not submitted for marking."
        className="h-[280px] sm:h-[330px] w-full resize-none border-x border-b border-[#aeb8c2] bg-white p-3 sm:p-4 text-xs sm:text-[14px] leading-relaxed outline-none placeholder:text-slate-400"
      />
    </FloatingWindow>
  );
}

function ToolButton({
  active = false,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-7 sm:size-8 shrink-0 place-items-center border-r border-[#d2d8de] ${
        active
          ? "bg-[#d8e5f0] text-[#0B2545] shadow-inner"
          : "bg-[#f6f7f8] text-slate-700 hover:bg-[#e7edf2]"
      }`}
    >
      {children}
    </button>
  );
}

function ResponseEditor({
  initialContent,
  onChange,
  editable,
}: {
  initialContent: string;
  onChange: (html: string) => void;
  editable: boolean;
}) {
  const [gridOpen, setGridOpen] = useState(false);
  const [hoverCell, setHoverCell] = useState({ rows: 0, cols: 0 });
  const [tableMenuPosition, setTableMenuPosition] = useState({ top: 0, left: 0 });
  const tableButtonRef = useRef<HTMLButtonElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TableKit.configure({ table: { resizable: true } }),
    ],
    content: initialContent,
    editable,
    editorProps: {
      attributes: {
        class:
          "exam-editor min-h-full px-4 sm:px-6 py-3 sm:py-4 outline-none text-xs sm:text-[14px] leading-relaxed text-slate-900",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);
  useEffect(() => {
    if (!gridOpen) return;

    const positionMenu = () => {
      const rect = tableButtonRef.current?.getBoundingClientRect();
      if (rect) setTableMenuPosition({ top: rect.bottom + 4, left: rect.left });
    };
    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!tableButtonRef.current?.contains(target) && !tableMenuRef.current?.contains(target)) {
        setGridOpen(false);
      }
    };

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [gridOpen]);
  if (!editor) return <div className="min-h-0 flex-1 bg-white" />;
  const chooseTable = (rows: number, cols: number) => {
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();
    setGridOpen(false);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col border border-[#adb8c4] bg-white shadow-inner">
      <fieldset disabled={!editable} aria-label="Response formatting" className="relative flex min-w-0 min-h-8 sm:min-h-9 flex-shrink-0 items-center overflow-x-auto touch-scroll border-b border-[#adb8c4] bg-[#f4f6f8] px-1 disabled:opacity-60">
        <select
          aria-label="Paragraph style"
          defaultValue="paragraph"
          onChange={(event) =>
            event.target.value === "heading"
              ? editor.chain().focus().toggleHeading({ level: 2 }).run()
              : editor.chain().focus().setParagraph().run()
          }
          className="mx-1 h-6 sm:h-7 w-24 sm:w-28 shrink-0 border border-[#b5bec8] bg-white px-1 sm:px-2 text-[11px] sm:text-[12px] text-slate-700 outline-none"
        >
          <option value="paragraph">Paragraph</option>
          <option value="heading">Heading</option>
        </select>
        <ToolButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </ToolButton>
        <ToolButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </ToolButton>
        <ToolButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-3.5" />
        </ToolButton>
        <ToolButton
          label="Bulleted list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </ToolButton>
        <ToolButton
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-3.5" />
        </ToolButton>
        <ToolButton
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-3.5" />
        </ToolButton>
        <button
          ref={tableButtonRef}
          type="button"
          aria-label="Table"
          aria-haspopup="grid"
          aria-expanded={gridOpen}
          onClick={() => setGridOpen((value) => !value)}
          className="ml-1 inline-flex h-6 sm:h-7 shrink-0 items-center gap-1 border border-[#b5bec8] bg-white px-2 text-[11px] sm:text-[12px] font-semibold text-slate-700 hover:bg-[#e7edf2] whitespace-nowrap"
        >
          <Table2 className="size-3.5 shrink-0" />
          Table
          <ChevronDown className="size-3 shrink-0" />
        </button>
        {gridOpen && (
          <div
            ref={tableMenuRef}
            role="dialog"
            aria-label="Insert table"
            style={tableMenuPosition}
            className="fixed z-[100] border border-[#8795a5] bg-white p-2 shadow-xl"
          >
            <div className="mb-1 text-center text-[11px] font-semibold text-slate-600">
              {hoverCell.rows
                ? `${hoverCell.cols} × ${hoverCell.rows} table`
                : "Insert table"}
            </div>
            <div
              className="grid grid-cols-5 gap-1"
              onMouseLeave={() => setHoverCell({ rows: 0, cols: 0 })}
            >
              {Array.from({ length: 25 }).map((_, index) => {
                const row = Math.floor(index / 5) + 1;
                const col = (index % 5) + 1;
                const active = row <= hoverCell.rows && col <= hoverCell.cols;
                return (
                  <button
                    type="button"
                    aria-label={`${col} columns by ${row} rows`}
                    key={index}
                    onMouseEnter={() =>
                      setHoverCell({ rows: row, cols: col })
                    }
                    onClick={() => chooseTable(row, col)}
                    className={`size-5 border ${
                      active
                        ? "border-[#2d689e] bg-[#bcd5e9]"
                        : "border-slate-300 bg-white"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </fieldset>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="min-h-full" />
      </div>
    </div>
  );
}

// Reference Material Modal matching PDF Pages 5, 7, 9
function ReferenceMaterials({
  open,
  onOpenChange,
  currentSection,
  sections,
  materials = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSection: number;
  sections: Question[];
  materials?: ExamMaterial[];
}) {
  const currentDoc = sections[currentSection - 1] || sections[0];
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);
  const material = materials.find(m => m.id === selectedMaterial) ?? materials[0];
  const { url, error } = useExamMaterialUrl(material?.storage_path, open);

  if (!open) return null;

  return (
    <FloatingWindow title="Reference Material" onClose={() => onOpenChange(false)} initial={{ x: 24, y: 120 }} width={600}>
      <div className="h-[65vh] min-h-0 overflow-hidden border border-[#0B2545] flex flex-col bg-white">
        <div className="flex h-10 flex-shrink-0 items-center justify-between bg-[#0B2545] px-3 sm:px-4 text-white">
          <div className="flex items-center gap-2">
            <FileText className="size-4 shrink-0 text-white" />
            <span className="text-xs sm:text-[14px] font-bold">
              Reference Material
            </span>
          </div>
          <button
            aria-label="Close reference material"
            onClick={() => onOpenChange(false)}
            className="grid size-6 place-items-center rounded hover:bg-white/20 text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {materials.length > 0 && <div className="flex shrink-0 gap-2 overflow-x-auto border-b bg-slate-50 p-2">{materials.map(m => <button key={m.id} className={`whitespace-nowrap border px-3 py-1 text-xs ${m.id === material?.id ? "bg-[#133E68] text-white" : "bg-white text-slate-700"}`} onClick={() => setSelectedMaterial(m.id)}>{m.name}</button>)}</div>}
        {material ? (
          url ? <iframe title={material.name} src={`${url}#view=FitH`} className="min-h-0 w-full flex-1 border-0" />
          : <p role={error ? "alert" : "status"} className="p-5 text-sm">{error || "Loading reference PDF…"}</p>
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto select-text cursor-text p-4 sm:p-7">
          <div className="border border-slate-300 rounded-sm p-5 sm:p-8 bg-white min-h-full shadow-sm">
            <h2
              className={`text-lg sm:text-2xl font-bold tracking-tight mb-5 ${currentDoc.referenceDocColor}`}
            >
              {currentDoc.referenceDocTitle}
            </h2>
            <div className="space-y-4 text-xs sm:text-[14px] leading-relaxed text-slate-800">
              {currentDoc.referenceParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
        )}

        <div className="h-10 flex-shrink-0 flex items-center justify-end border-t border-[#0B2545] bg-[#0B2545] px-3">
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 border border-white bg-transparent px-3 py-1 text-xs font-bold text-white hover:bg-white/20 transition-colors"
          >
            <X className="size-3.5" /> Close
          </button>
        </div>
      </div>
    </FloatingWindow>
  );
}

// Pre-seen viewer
function DocumentViewer({
  open,
  onOpenChange,
  sections,
  material,
  examLevel,
  useSample = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: Question[];
  material?: ExamMaterial;
  examLevel?: ExamLevel;
  useSample?: boolean;
}) {
  const [zoom, setZoom] = useState(85);
  const signed = useExamMaterialUrl(material?.storage_path, open);
  const documentUrl = material ? signed.url : useSample ? process.env.NEXT_PUBLIC_PRESEEN_PDF_URL : null;
  const totalMinutes = sections.reduce((acc, s) => acc + s.timeMinutes, 0);
  const viewerTitle = examLevel
    ? `${LEVEL_NAMES[examLevel]} Examination`
    : material?.name?.trim() || "Pre-seen Material";

  const pages = [
    {
      title: "KWIRTMAK GROUP PLC — COMPANY PROFILE & STRATEGIC OVERVIEW",
      body: "Kwirtmak Group plc is a premier manufacturer of high-precision industrial printing machinery, smart-print software ecosystems, and specialty inks and consumables. Headquartered in Ennland with international manufacturing facilities across Europe and North America, Kwirtmak serves commercial packaging, label converters, and industrial publication houses.",
      bullets: [
        "Group Annual Revenue: £642.5 million",
        "Operating Profit (EBIT): £78.4 million (12.2% operating margin)",
        "Global Workforce: 4,120 employees across 8 primary facilities",
        "Net Debt: £165 million (Net debt / EBITDA 1.62x)",
        "Primary Listing: Ennland Stock Exchange (ESE Index constituent)",
      ],
    },
    {
      title: "OPERATING DIVISIONS & REVENUE MODEL",
      body: "Kwirtmak operates across three distinct yet interconnected operating divisions. The group is currently executing a strategic shift toward digital software-enabled telemetry and recurring revenue contracts.",
      bullets: [
        "Industrial Printing Machinery (52% of Revenue): Heavy sheet-fed offset, digital packaging presses, and precision assembly lines.",
        "Printing Materials & Consumables (33% of Revenue): Proprietary solvent and bio-based inks, chemical coatings, and specialized packaging substrates.",
        "Digital & Field Services (15% of Revenue): 24/7 technical field maintenance, spare parts replenishment, and newly launched IoT predictive diagnostics.",
      ],
    },
    {
      title: "INDUSTRY LANDSCAPE, COMPETITION & SUSTAINABILITY",
      body: "The global commercial print and packaging equipment sector is undergoing structural transformation driven by environmental sustainability mandates and client demand for just-in-time personalized packaging runs.",
      bullets: [
        "Stringent European Union and Ennland VOC (Volatile Organic Compound) emission caps requiring rapid phase-out of traditional solvent inks.",
        "Increasing competitive pressure from Asian equipment builders offering lower-priced hardware with subsidized state financing.",
        "Rapid adoption of industrial IoT and edge analytics enabling predictive breakdown avoidance and 25%+ reductions in substrate waste.",
      ],
    },
    {
      title: "STRATEGIC CASE STUDY EXAM STRUCTURE & TIME GUIDELINES",
      body: "This examination is structured as follows. An indication of how much of the time available for each section that you should allocate to planning and writing your answer is shown against each sub-task:",
      bullets: [
        ...sections.map(
          (s) =>
            `Section ${s.section}: ${s.timeMinutes} minutes | 1 task | ${getSubtasks(s).length} sub-tasks | ${getSubtasks(s).map((task, index) => `(${subtaskLabel(index)}) ${formatWeightage(task.weightage, s.weightageUnit)}`).join(" — ")}`,
        ),
        `Total Examination Time: ${totalMinutes} minutes (${Math.round(totalMinutes / 60)} hours). Each section is strictly timed.`,
      ],
    },
  ];

  if (!open) return null;
  return (
    <FloatingWindow title={viewerTitle} onClose={() => onOpenChange(false)} initial={{ x: Math.max(24, window.innerWidth - 680), y: 145 }} width={650}>
      <div className="h-[70vh] min-h-0 overflow-hidden border border-[#0B2545] bg-[#d9dfe5] flex flex-col">
        <div className="flex h-10 flex-shrink-0 flex-row items-center justify-between bg-[#0B2545] px-4 text-white">
          <div className="truncate pr-2">
            <h2 className="text-xs sm:text-[14px] font-bold truncate">
              {viewerTitle}
            </h2>
          </div>
          <button
            aria-label="Close pre-seen material"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-white hover:bg-white/20 shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex h-10 flex-shrink-0 items-center justify-center gap-1.5 sm:gap-2 border-b border-[#9aa7b4] bg-[#eef1f4] px-2 overflow-x-auto touch-scroll">
          <button
            onClick={() => setZoom((value) => Math.max(60, value - 10))}
            className="inline-flex h-7 items-center px-2 text-xs border border-slate-300 bg-white hover:bg-slate-50 shrink-0"
          >
            <ZoomOut className="size-3.5 sm:size-4" />
          </button>
          <span className="min-w-12 text-center text-xs font-semibold shrink-0">
            {zoom}%
          </span>
          <button
            onClick={() => setZoom((value) => Math.min(130, value + 10))}
            className="inline-flex h-7 items-center px-2 text-xs border border-slate-300 bg-white hover:bg-slate-50 shrink-0"
          >
            <ZoomIn className="size-3.5 sm:size-4" />
          </button>
          <span className="mx-1.5 sm:mx-3 h-5 border-l border-slate-400 shrink-0" />
          <span className="text-xs shrink-0 whitespace-nowrap">
            {documentUrl || material ? "Continuous scroll" : useSample ? `Continuous scroll · ${pages.length} pages` : "Pre-seen material"}
          </span>
        </div>
        {!material && !documentUrl && !useSample ? (
          <p className="p-5 text-sm text-slate-600">No pre-seen document has been attached to this mock exam.</p>
        ) : material && !documentUrl ? (
          <p role={signed.error ? "alert" : "status"} className="p-5 text-sm">{signed.error || "Loading pre-seen PDF…"}</p>
        ) : documentUrl ? (
          <iframe
            title="Complete pre-seen document"
            src={`${documentUrl.split("#")[0]}#view=FitH&zoom=${zoom}&page=1`}
            className="min-h-0 flex-1 w-full border-0"
          />
        ) : (
        <div className="min-h-0 flex-1 overflow-auto select-text cursor-text scroll-smooth overscroll-contain p-4 sm:p-7">
          {pages.map((current, index) => (
          <article
            key={current.title}
            aria-label={`Pre-seen page ${index + 1}`}
            className="mx-auto mb-6 min-h-[740px] bg-white p-6 sm:px-16 sm:py-14 shadow-md"
            style={{ width: `${zoom}%`, minWidth: 320, fontSize: `${zoom / 100}em` }}
          >
            <div className="mb-6 sm:mb-10 flex items-start justify-between border-b-2 border-[#0B2545] pb-3 sm:pb-5">
              <span className="text-sm font-bold text-[#0B2545]">KWIRTMAK GROUP PLC</span>
              <span className="text-xs font-bold text-slate-500">
                CIMA SCS PRE-SEEN
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0B2545]">
              {current.title}
            </h2>
            <p className="mt-4 sm:mt-8 text-xs sm:text-[15px] leading-relaxed sm:leading-7 text-slate-700">
              {current.body}
            </p>
            <ul className="mt-4 sm:mt-8 space-y-2 sm:space-y-3 text-xs sm:text-[15px] text-slate-700">
              {current.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 sm:gap-3">
                  <span className="mt-1.5 sm:mt-2 size-1.5 shrink-0 bg-[#0B2545]" />
                  {bullet}
                </li>
              ))}
            </ul>
            <p className="mt-12 border-t pt-3 text-right text-xs text-slate-500">Page {index + 1} of {pages.length}</p>
          </article>
          ))}
        </div>
        )}
      </div>
    </FloatingWindow>
  );
}

function FactorTable({ cumulative }: { cumulative: boolean }) {
  return (
    <div className="table-scroll min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded border border-slate-300 bg-white touch-scroll">
      <table className="w-full border-collapse text-xs min-w-[500px]">
        <thead>
          <tr className="sticky top-0 z-10 bg-[#0B2545] text-white shadow-sm">
            <th className="border border-slate-300 bg-[#0B2545] px-2 py-1 text-center font-bold whitespace-nowrap">
              Period
            </th>
            {rates.map((rate) => (
              <th
                key={rate}
                className="border border-slate-300 bg-[#0B2545] px-2 py-1 text-center font-bold whitespace-nowrap"
              >
                {rate}%
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period} className="odd:bg-[#f6f8fa] hover:bg-[#eef3f8]">
              <td className="border border-slate-300 bg-[#edf2f6] px-2 py-1 text-center font-bold text-slate-800">
                {period}
              </td>
              {rates.map((rate) => {
                const r = rate / 100;
                const value = cumulative
                  ? (1 - Math.pow(1 + r, -period)) / r
                  : Math.pow(1 + r, -period);
                return (
                  <td
                    key={rate}
                    className="border border-slate-300 px-2 py-1 text-center font-mono text-slate-700"
                  >
                    {value.toFixed(3)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NormalTable() {
  const rows = Array.from({ length: 31 }, (_, index) => index / 10);
  const columns = Array.from({ length: 10 }, (_, index) => index / 100);
  return (
    <div className="table-scroll min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded border border-slate-300 bg-white touch-scroll">
      <table className="w-full border-collapse text-xs min-w-[500px]">
        <thead>
          <tr className="sticky top-0 z-10 bg-[#0B2545] text-white shadow-sm">
            <th className="border border-slate-300 bg-[#0B2545] px-2 py-1 text-center font-bold whitespace-nowrap">
              z
            </th>
            {columns.map((column) => (
              <th
                key={column}
                className="border border-slate-300 bg-[#0B2545] px-2 py-1 text-center font-bold whitespace-nowrap"
              >
                {column.toFixed(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row} className="odd:bg-[#f6f8fa] hover:bg-[#eef3f8]">
              <td className="border border-slate-300 bg-[#edf2f6] px-2 py-1 text-center font-bold text-slate-800">
                {row.toFixed(1)}
              </td>
              {columns.map((column) => (
                <td
                  key={column}
                  className="border border-slate-300 px-2 py-1 text-center font-mono text-slate-700"
                >
                  {normalCdf(row + column).toFixed(4)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormulaTables({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[96vw] sm:max-w-4xl h-[85vh] max-h-[85vh] gap-0 overflow-hidden rounded-md border-2 border-[#0B2545] p-0 flex flex-col shadow-2xl"
      >
        <DialogHeader className="flex h-11 flex-shrink-0 flex-row items-center justify-between bg-[#0B2545] px-4 text-white">
          <DialogTitle className="text-xs sm:text-[15px] font-bold text-white truncate">
            Tables and Formulae
          </DialogTitle>
          <button
            aria-label="Close tables and formulae"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-white hover:bg-white/20 transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </DialogHeader>
        <Tabs
          defaultValue="cumulative"
          className="min-h-0 flex-1 flex flex-col gap-0 overflow-hidden"
        >
          <TabsList className="h-10 w-full justify-start rounded-none border-b border-[#aeb8c2] bg-[#e9edf1] p-0 flex-nowrap flex-shrink-0 overflow-x-auto touch-scroll">
            <TabsTrigger
              value="cumulative"
              className="h-10 flex-none rounded-none px-3 sm:px-4 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-[#0B2545] data-[state=active]:border-b-2 data-[state=active]:border-[#0B2545]"
            >
              Cumulative Present Value
            </TabsTrigger>
            <TabsTrigger
              value="present"
              className="h-10 flex-none rounded-none px-3 sm:px-4 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-[#0B2545] data-[state=active]:border-b-2 data-[state=active]:border-[#0B2545]"
            >
              Present Value
            </TabsTrigger>
            <TabsTrigger
              value="normal"
              className="h-10 flex-none rounded-none px-3 sm:px-4 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-[#0B2545] data-[state=active]:border-b-2 data-[state=active]:border-[#0B2545]"
            >
              Normal Distribution
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="cumulative"
            className="min-h-0 flex-1 flex flex-col p-3 sm:p-4 overflow-hidden"
          >
            <div className="mb-2.5 flex flex-shrink-0 items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545]">
                  Cumulative Present Value Table
                </h3>
                <p className="text-[11px] text-slate-600">
                  Present value of an annuity of 1 received for n periods.
                </p>
              </div>
              <code className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-mono font-semibold text-slate-800">
                (1 − (1 + r)<sup>−n</sup>) / r
              </code>
            </div>
            <FactorTable cumulative />
          </TabsContent>
          <TabsContent
            value="present"
            className="min-h-0 flex-1 flex flex-col p-3 sm:p-4 overflow-hidden"
          >
            <div className="mb-2.5 flex flex-shrink-0 items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545]">
                  Present Value Table
                </h3>
                <p className="text-[11px] text-slate-600">
                  Present value of 1 received after n periods.
                </p>
              </div>
              <code className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-mono font-semibold text-slate-800">
                (1 + r)<sup>−n</sup>
              </code>
            </div>
            <FactorTable cumulative={false} />
          </TabsContent>
          <TabsContent
            value="normal"
            className="min-h-0 flex-1 flex flex-col p-3 sm:p-4 overflow-hidden"
          >
            <div className="mb-2.5 flex flex-shrink-0 items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545]">
                  Normal Distribution Table
                </h3>
                <p className="text-[11px] text-slate-600">
                  Cumulative area under the standard normal curve to the left of
                  z: Φ(z).
                </p>
              </div>
            </div>
            <NormalTable />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Screen 0: Welcome Screen matching PDF Page 2
function WelcomeScreen({
  onNext,
  candidateName,
  examName,
  totalMinutes,
}: {
  onNext: () => void;
  candidateName: string;
  examName: string;
  totalMinutes: number;
}) {
  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-white">
      <header className="flex h-12 sm:h-14 flex-shrink-0 items-center justify-between gap-4 bg-[#0067A3] px-4 sm:px-6 shadow-sm">
        <span className="text-sm sm:text-base font-bold text-white tracking-wide">
          {examName} - {candidateName}
        </span>
        <a href="/dashboard" className="shrink-0 rounded-sm border border-white/60 px-2 py-1 text-xs font-semibold text-white hover:bg-white/15">Exit to Dashboard</a>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-[680px] flex flex-col items-center">
          <CimaGlobeLogo className="size-16 sm:size-20 mb-4" />

          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900 text-center mb-6">
            {examName}
          </h1>

          <div className="w-full text-left space-y-4 text-xs sm:text-[14px] text-slate-800 font-normal px-2 sm:px-0">
            <div>Maximum Time Allowed : {totalMinutes} minutes</div>
            <div className="pt-2">Welcome, {candidateName}</div>
            <div className="leading-snug">
              If this is not your name, please let your<br />
              administrator know
            </div>
            <div className="pt-2 font-medium">
              Click <strong>Next</strong> to start the test.
            </div>
          </div>
        </div>
      </div>

      <footer className="h-12 sm:h-14 flex-shrink-0 flex items-center justify-end bg-[#0067A3] px-4 sm:px-6">
        <button
          id="welcome-next-button"
          onClick={onNext}
          className="inline-flex h-8 sm:h-9 items-center gap-1 border border-white/80 bg-white/10 hover:bg-white/20 active:translate-y-px px-4 sm:px-5 text-xs sm:text-[13px] font-bold text-white transition-colors rounded-[2px]"
        >
          Next <span className="text-sm font-bold">➔</span>
        </button>
      </footer>
    </main>
  );
}

// Screen 1: Exam Structure Screen matching PDF Page 3 (dynamically renders sections count)
function ExamStructureScreen({
  onPrevious,
  onNext,
  sections,
  candidateName,
  examName,
}: {
  onPrevious: () => void;
  onNext: () => void;
  sections: Question[];
  candidateName: string;
  examName: string;
}) {
  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-white">
      <header className="flex h-12 sm:h-14 flex-shrink-0 items-center justify-between gap-4 bg-[#0067A3] px-4 sm:px-6 shadow-sm">
        <span className="text-sm sm:text-base font-bold text-white tracking-wide">
          {examName} - {candidateName}
        </span>
        <a href="/dashboard" className="shrink-0 rounded-sm border border-white/60 px-2 py-1 text-xs font-semibold text-white hover:bg-white/15">Exit to Dashboard</a>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 flex flex-col items-center">
        <div className="w-full max-w-[920px]">
          <p className="text-xs sm:text-sm font-semibold text-slate-800 mb-3">
            This examination is structured as follows:
          </p>

          <div className="overflow-x-auto touch-scroll border border-slate-700">
            <table className="w-full sm:min-w-full min-w-[480px] border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#d97d7d] text-slate-900 border-b border-slate-700">
                  <th className="border border-slate-700 p-2 sm:p-2.5 text-center font-bold">
                    Section Number
                  </th>
                  <th className="border border-slate-700 p-2 sm:p-2.5 text-center font-bold">
                    Time for Section<br />(minutes)
                  </th>
                  <th className="border border-slate-700 p-2 sm:p-2.5 text-center font-bold">
                    Number of tasks
                  </th>
                  <th className="border border-slate-700 p-2 sm:p-2.5 text-center font-bold">
                    Number of<br />Sub – Task/s
                  </th>
                  <th className="border border-slate-700 p-2 sm:p-2.5 text-center font-bold">
                    % Time To spend<br />on each sub - task
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700 bg-white">
                {sections.map((sec) => (
                  <tr key={sec.section}>
                    <td className="border border-slate-700 p-2 sm:p-3 text-center font-bold">
                      {sec.section}
                    </td>
                    <td className="border border-slate-700 p-2 sm:p-3 text-center">
                      {sec.timeMinutes}
                    </td>
                    <td className="border border-slate-700 p-2 sm:p-3 text-center">
                      1
                    </td>
                    <td className="border border-slate-700 p-2 sm:p-3 text-center">
                      {getSubtasks(sec).length}
                    </td>
                    <td className="border border-slate-700 p-2 sm:p-3 text-center leading-relaxed">
                      {getSubtasks(sec).map((task, index) => <div key={index}>({subtaskLabel(index)}) {formatWeightage(task.weightage, sec.weightageUnit)}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 space-y-3 text-xs sm:text-[13px] leading-relaxed text-slate-800">
            <p>
              Each section (task) has a number of sub-tasks. An indication of
              how much of the time available for the section that you should
              allocate to planning and writing your answer is shown against each
              sub-task in the text of the question (and summarised in the table
              above).
            </p>
            <p>
              This information will be available for you to access during the
              examination by clicking on the Pre-seen button.
            </p>
          </div>
        </div>
      </div>

      <footer className="h-12 sm:h-14 flex-shrink-0 flex items-center justify-between bg-[#0067A3] px-3 sm:px-6">
        <button
          id="structure-prev-button"
          onClick={onPrevious}
          className="inline-flex h-8 sm:h-9 items-center gap-1 border border-white/80 bg-white/10 hover:bg-white/20 active:translate-y-px px-3 sm:px-4 text-xs sm:text-[13px] font-bold text-white transition-colors rounded-[2px]"
        >
          <span className="text-sm">⬅</span> Previous
        </button>
        <button
          id="structure-next-button"
          onClick={onNext}
          className="inline-flex h-8 sm:h-9 items-center gap-1 border border-white/80 bg-white/10 hover:bg-white/20 active:translate-y-px px-4 sm:px-5 text-xs sm:text-[13px] font-bold text-white transition-colors rounded-[2px]"
        >
          Next <span className="text-sm font-bold">➔</span>
        </button>
      </footer>
    </main>
  );
}

// Thank You / Finished Screen matching PDF Page 10
function ThankYouScreen({
  candidateName,
  examName,
}: {
  candidateName: string;
  examName: string;
}) {
  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-white">
      <header className="flex h-12 sm:h-14 flex-shrink-0 items-center justify-between bg-[#0067A3] px-4 sm:px-6 shadow-sm">
        <span className="text-sm sm:text-base font-bold text-white">
          {examName} - {candidateName}
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-[#0067A3] mb-8">
          Mock Submitted Successfully
        </h1>

        <p className="mb-8 text-base text-slate-700">
          Your answer has been submitted for tutor review.
        </p>

        <div className="space-y-2 text-sm sm:text-base text-slate-800 mb-8 font-medium">
          <p className="text-slate-600 font-semibold">Contact Details</p>
          <p className="text-[#0067A3] font-bold">www.keystoneacademia.com</p>
          <p className="font-mono text-slate-700">+918904881069</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 mt-4 border-t border-slate-200 pt-6">
          <KeystoneHeaderLogo />
          <div className="flex items-center gap-2">
            <CimaGlobeLogo className="size-8" />
            <div className="text-left text-xs font-bold text-slate-700">
              CIMA<br />
              <span className="text-[10px] font-normal text-slate-500">
                Registered Tuition Provider
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <a
            href="/student/dashboard"
            className="inline-flex h-9 items-center gap-1.5 border border-[#0067A3] bg-[#0067A3] text-white px-5 text-xs font-bold hover:bg-[#005587] transition-colors rounded-[2px]"
          >
            <ArrowLeft className="size-3.5" /> Return to Student Dashboard
          </a>
        </div>
      </div>

      <footer className="h-10 flex-shrink-0 bg-[#0067A3]" />
    </main>
  );
}

export default function ExamRuntime({
  initialQuestions = questionsData,
  examId = LEGACY_EXAM_ID,
  examName = "Strategic Case Study Exam",
  examLevel,
  materials = [],
}: {
  initialQuestions?: Question[];
  examId?: string;
  examName?: string;
  examLevel?: ExamLevel;
  materials?: ExamMaterial[];
}) {
  // Configurable sections (supports 3 or 4 sections dynamically)
  const [sections] = useState<Question[]>(initialQuestions);
  // The bundled legacy paper is strategic; uploaded mocks pass their explicit level.
  // Leaving custom mocks without a level allows the document-name fallback in the viewer.
  const resolvedExamLevel = examLevel ?? (examId === LEGACY_EXAM_ID ? "SCS" : undefined);
  const [flow, setFlow] = useState<
    "welcome" | "structure" | "exam" | "thankyou"
  >("welcome");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [screen, setScreen] = useState<"prompt" | "answer">("prompt");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const [calculator, setCalculator] = useState(false);
  const [scratch, setScratch] = useState(false);
  const [references, setReferences] = useState(false);
  const [preseen, setPreseen] = useState(false);
  const [formulae, setFormulae] = useState(false);
  const [step1Warning, setStep1Warning] = useState(false);
  const [step2Warning, setStep2Warning] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [endExam, setEndExam] = useState(false);

  const question = sections[questionIndex] || sections[0];
  const questionId = `section-${question.section}`;
  const studentAuth = useStudentAuth();
  const EXAM_UI_STATE_KEY = `${BASE_UI_STATE_KEY}-${examId}-${studentAuth.user?.id ?? "anonymous"}`;
  const answerDraftsKey = useCallback((userId: string) => `${baseAnswerDraftsKey(userId)}-${examId}`, [examId]);
  const examSession = useStudentExamSession(
    flow === "exam" && Boolean(studentAuth.user),
    examId,
    sections[0].timeMinutes * 60,
  );

  useEffect(() => {
    if (studentAuth.loading) return;
    if (!studentAuth.user) {
      setUiStateHydrated(true);
      return;
    }

    try {
      const stored = window.localStorage.getItem(EXAM_UI_STATE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          flow?: unknown;
          questionIndex?: unknown;
          screen?: unknown;
        };
        if (
          parsed.flow === "welcome" ||
          parsed.flow === "structure" ||
          parsed.flow === "exam" ||
          parsed.flow === "thankyou"
        ) {
          setFlow(parsed.flow);
        }
        if (
          typeof parsed.questionIndex === "number" &&
          Number.isInteger(parsed.questionIndex) &&
          parsed.questionIndex >= 0 &&
          parsed.questionIndex < sections.length
        ) {
          setQuestionIndex(parsed.questionIndex);
        }
        if (parsed.screen === "prompt" || parsed.screen === "answer") {
          setScreen(parsed.screen);
        }
      }
    } catch {
      window.localStorage.removeItem(EXAM_UI_STATE_KEY);
    } finally {
      setUiStateHydrated(true);
    }
  }, [sections.length, studentAuth.loading, studentAuth.user]);

  useEffect(() => {
    if (!uiStateHydrated || !studentAuth.user) return;
    window.localStorage.setItem(
      EXAM_UI_STATE_KEY,
      JSON.stringify({ flow, questionIndex, screen }),
    );
  }, [flow, questionIndex, screen, studentAuth.user, uiStateHydrated]);

  useEffect(() => {
    if (!studentAuth.user) return;
    try {
      const stored = window.localStorage.getItem(
        answerDraftsKey(studentAuth.user.id),
      ) ?? (examId === LEGACY_EXAM_ID
        ? window.localStorage.getItem(baseAnswerDraftsKey(studentAuth.user.id))
        : null);
      if (!stored) return;
      const drafts = JSON.parse(stored) as Record<string, string>;
      setAnswers((current) => ({ ...drafts, ...current }));
    } catch {
      window.localStorage.removeItem(answerDraftsKey(studentAuth.user.id));
    }
  }, [studentAuth.user]);

  useEffect(() => {
    if (!studentAuth.user || Object.keys(answers).length === 0) return;
    window.localStorage.setItem(
      answerDraftsKey(studentAuth.user.id),
      JSON.stringify(answers),
    );
  }, [answers, studentAuth.user]);

  useEffect(() => {
    if (Object.keys(examSession.answers).length === 0) return;
    // A newer recovery draft must win over a slower server hydration response.
    setAnswers((current) => ({ ...examSession.answers, ...current }));
  }, [examSession.answers]);

  const initialContent = useMemo(() => {
    if (answers[questionId]) return answers[questionId];
    return `<p><strong>From:</strong> Senior Finance Manager</p><p><strong>To:</strong> ${question.from}</p><p><strong>Subject:</strong> ${question.subject}</p><p></p>`;
  }, [answers, question.from, question.subject, questionId]);

  const {
    saveState,
    saveError,
    flush: flushCurrentAnswer,
  } = useExamAutosave({
    sessionId: examSession.sessionId,
    questionId,
    answerText: initialContent,
    enabled:
      flow === "exam" &&
      screen === "answer" &&
      !submitting &&
      !examSession.completed,
  });

  const finalizeExam = useCallback(
    async (remainingSeconds: number) => {
      if (examSession.completed) return true;
      if (submitting) return false;
      setSubmitting(true);
      const answerSaved = await flushCurrentAnswer();
      if (!answerSaved) {
        setSubmitting(false);
        return false;
      }
      const completed = await examSession.completeSession(remainingSeconds);
      if (!completed) {
        setSubmitting(false);
        return false;
      }
      setEndExam(false);
      setTransitioning(true);
      window.setTimeout(() => {
        setFlow("thankyou");
        setTransitioning(false);
        setSubmitting(false);
      }, 800);
      return true;
    },
    [examSession, flushCurrentAnswer, submitting],
  );

  const initialQuestionSeconds = useMemo(() => {
    const savedTimer = examSession.questionTimers[questionId];
    if (!savedTimer) return question.timeMinutes * 60;
    return savedTimer.remainingSeconds;
  }, [examSession.questionTimers, question.timeMinutes, questionId]);

  const handleQuestionTimeUp = useCallback(async () => {
    if (examSession.completed) return true;
    if (submitting || transitioning) return false;
    const answerSaved = await flushCurrentAnswer();
    if (!answerSaved) return false;

    if (questionIndex >= sections.length - 1) {
      return finalizeExam(0);
    }

    setTransitioning(true);
    window.setTimeout(() => {
      setQuestionIndex((current) => current + 1);
      setScreen("prompt");
      setTransitioning(false);
    }, 800);
    return true;
  }, [
    examSession.completed,
    finalizeExam,
    flushCurrentAnswer,
    questionIndex,
    sections.length,
    submitting,
    transitioning,
  ]);

  const {
    timeRemainingSeconds: seconds,
    syncError: timerSyncError,
    syncNow: syncCurrentTimer,
  } = useExamTimer({
    initialTimeRemainingSeconds: initialQuestionSeconds,
    sessionId: examSession.sessionId,
    questionId,
    active:
      flow === "exam" &&
      !examSession.loading &&
      !examSession.completed &&
      !submitting &&
      !transitioning,
    onTimeUp: handleQuestionTimeUp,
  });

  const exitToDashboard = async () => {
    if (exiting || submitting || transitioning) return;
    setExiting(true);
    setExitError(null);
    try {
      if (!(await flushCurrentAnswer())) {
        setExitError("Your latest answer could not be saved. Please reconnect and try exiting again.");
        setExiting(false);
        return;
      }
      if (flow === "exam") await syncCurrentTimer();
      window.location.assign("/dashboard");
    } catch {
      setExitError("Unable to sync your exam progress. Please try again.");
      setExiting(false);
    }
  };

  const statusRef = useRef({
    flow,
    section: question?.section || 1,
    totalSections: sections.length,
    screen,
    timeRemainingSeconds: seconds,
    saveStatus: "idle",
  });

  statusRef.current = {
    flow,
    section: question?.section || 1,
    totalSections: sections.length,
    screen,
    timeRemainingSeconds: seconds,
    saveStatus: saveState,
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void context.registerTool(
      {
        name: "get_exam_status",
        title: "Get exam status",
        description:
          "Read visible mock exam flow, section, question, screen and autosave state.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({
          ...statusRef.current,
        }),
      },
      { signal: lifecycle.signal },
    );
    return () => lifecycle.abort();
  }, []);

  // Next handler: prompt -> answer. If at end of section, trigger Step 1 Modal ("End of Section")
  const next = () => {
    if (screen === "prompt") {
      setScreen("answer");
      return;
    }
    // At end of ANY section (Question 1 to 2, 2 to 3, etc.): Trigger Step 1 Modal
    setStep1Warning(true);
  };

  const previous = () => {
    if (screen === "answer") {
      setScreen("prompt");
    }
  };

  // Step 1 [Next] -> Closes Step 1 and immediately triggers Step 2 Modal
  const handleStep1Next = () => {
    setStep1Warning(false);
    setStep2Warning(true);
  };

  // Step 2 [Yes, End Section] -> Permanently locks current section, resets 60min timer, increments question, loads new section prompt
  const handleConfirmEndSection = async () => {
    setStep2Warning(false);
    const answerSaved = await flushCurrentAnswer();
    if (!answerSaved) return;
    await syncCurrentTimer(seconds).catch(() => undefined);
    if (questionIndex >= sections.length - 1) {
      await finalizeExam(seconds);
      return;
    }
    setTransitioning(true);
    setTimeout(() => {
      setQuestionIndex((prev) => prev + 1);
      setScreen("prompt");
      setTransitioning(false);
    }, 800);
  };

  const confirmEarlyEnd = () => void finalizeExam(seconds);

  if (!studentAuth.user) {
    return (
      <StudentSignIn
        loading={studentAuth.loading}
        error={studentAuth.error}
        configured={studentAuth.configured}
        onSignIn={async (email, password) => {
          const signedIn = await studentAuth.signIn(email, password);
          if (signedIn) window.location.replace("/dashboard");
          return signedIn;
        }}
      />
    );
  }

  if (!uiStateHydrated) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#eef2f6]">
        <div className="text-center text-[#0067A3]">
          <div className="mx-auto size-10 animate-spin rounded-full border-4 border-[#b9c9d7] border-t-[#0067A3]" />
          <p className="mt-3 text-[13px] font-semibold">Restoring exam screen...</p>
        </div>
      </main>
    );
  }

  if (flow === "welcome") {
    return (
      <WelcomeScreen
        onNext={() => setFlow("structure")}
        totalMinutes={sections.reduce((total, section) => total + section.timeMinutes, 0)}
        examName={examName}
        candidateName={studentAuth.candidateName}
      />
    );
  }

  if (flow === "structure") {
    return (
      <ExamStructureScreen
        onPrevious={() => setFlow("welcome")}
        onNext={() => {
          setFlow("exam");
          setQuestionIndex(0);
          setScreen("prompt");
        }}
        sections={sections}
        examName={examName}
        candidateName={studentAuth.candidateName}
      />
    );
  }

  if (flow === "thankyou") {
    return (
      <ThankYouScreen
        examName={examName}
        candidateName={studentAuth.candidateName}
      />
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-white text-slate-900">
      {/* Top Header Bar (Pearson VUE light blue #0067A3):
          Left: "TIME REMAINING 59:59"
          Center: "Strategic Case Study Exam - Candidate Name"
          Right: "Question X of Y" */}
      <header className="flex h-12 sm:h-14 flex-shrink-0 items-center justify-between bg-[#0067A3] px-3 sm:px-6 text-white shadow-sm gap-2">
        {/* Left: TIME REMAINING countdown */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Clock className="size-4 text-white/90 shrink-0 hidden sm:inline" />
          <span className="text-xs sm:text-[13px] font-bold text-white uppercase tracking-wider">
            TIME REMAINING
          </span>
          <span className="font-mono text-sm sm:text-base font-bold text-white tracking-wider ml-0.5">
            {formatTime(seconds)}
          </span>
        </div>

        {/* Center: Strategic Case Study Exam - Candidate Name */}
        <div className="text-center font-bold text-xs sm:text-sm md:text-[15px] text-white tracking-wide truncate px-2 max-w-[150px] xs:max-w-[240px] sm:max-w-none">
          {examName} - {studentAuth.candidateName}
        </div>

        {/* Right: persistence status and question progress */}
        <div className="flex items-center justify-end gap-3 shrink-0 text-right">
          <button type="button" onClick={() => void exitToDashboard()} disabled={exiting || submitting || transitioning} className="inline-flex items-center gap-1 rounded-sm border border-white/60 px-2 py-1 text-xs font-semibold hover:bg-white/15 disabled:opacity-50">
            <ArrowLeft className="size-3.5" />{exiting ? "Saving & exiting…" : "Exit to Dashboard"}
          </button>
          <div
            className="hidden min-w-[112px] items-center justify-end gap-1.5 text-[11px] font-semibold sm:flex"
            aria-live="polite"
          >
            {saveState === "saving" && (
              <><span className="size-2 animate-pulse rounded-full bg-amber-300" />Saving...</>
            )}
            {saveState === "saved" && (
              <><Save className="size-3" />All changes saved</>
            )}
            {(saveState === "error" || timerSyncError) && (
              <span className="text-amber-200">Save unavailable</span>
            )}
          </div>
          <span className="text-xs sm:text-sm font-bold text-white tracking-wide">
            Question {questionIndex + 1} of {sections.length}
          </span>
        </div>
      </header>

      {/* Secondary Tool Ribbon */}
      {exitError && <p role="alert" className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">{exitError}</p>}
      <nav
        className="flex min-h-10 flex-shrink-0 flex-wrap items-center border-b border-[#aeb9c4] bg-[#edf1f4] px-2 py-1 sm:px-4 gap-2"
        aria-label="Exam tools"
      >
        <button
          onClick={() => setScratch(true)}
          className="inline-flex h-7 sm:h-8 shrink-0 items-center justify-center gap-1 border border-slate-300 bg-white hover:bg-slate-50 px-2.5 sm:px-3 text-xs font-semibold text-slate-800 shadow-sm rounded-[2px]"
        >
          <FileText className="size-3.5 text-[#0B2545] shrink-0" />
          <span>Scratch Pad</span>
        </button>
        <button
          onClick={() => setCalculator(true)}
          className="inline-flex h-7 sm:h-8 shrink-0 items-center justify-center gap-1 border border-slate-300 bg-white hover:bg-slate-50 px-2.5 sm:px-3 text-xs font-semibold text-slate-800 shadow-sm rounded-[2px]"
        >
          <CalculatorIcon className="size-3.5 text-[#0B2545] shrink-0" />
          <span>Calculator</span>
        </button>
        <button
          onClick={() => setReferences(true)}
          className="inline-flex h-7 sm:h-8 shrink-0 items-center justify-center gap-1.5 border border-[#4a80b5] bg-[#7ba4d1] hover:bg-[#6c98ca] text-white px-3 sm:px-4 text-xs font-bold shadow-sm rounded-[2px]"
        >
          <FileText className="size-3.5 shrink-0 text-white" />
          <span>Reference Material</span>
        </button>
        <button
          onClick={() => setPreseen(true)}
          className="inline-flex h-7 sm:h-8 shrink-0 items-center justify-center gap-1.5 border border-[#4a80b5] bg-[#7ba4d1] hover:bg-[#6c98ca] text-white px-3 sm:px-4 text-xs font-bold shadow-sm rounded-[2px]"
        >
          <FileText className="size-3.5 shrink-0 text-white" />
          <span>Pre-seen</span>
        </button>
        {screen === "answer" && (
              <div
                aria-label={`Section ${question.section} task requirements`}
                className="max-h-24 min-w-0 flex-1 basis-full overflow-y-auto select-text border-t border-[#c5ced7] pt-2 text-[12px] leading-snug text-slate-800 lg:basis-0 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0"
              >
                <h2 className="mb-0.5 font-bold text-[#0B2545]">
                  Section {question.section} — Task requirement
                </h2>
                <p className="mb-1">{question.taskPrompt}</p>
                <ExamTaskList question={question} />
              </div>
        )}
      </nav>

      {examSession.error && (
        <div role="alert" className="flex h-8 flex-shrink-0 items-center justify-center border-b border-amber-300 bg-amber-50 px-4 text-center text-[12px] font-semibold text-amber-900">
          Exam persistence is unavailable: {examSession.error}
        </div>
      )}

      {/* 2. TASK BODY:
          - Harsh black outline removed (clean CIMA container)
          - Screen strictly within 100vh with inner scroll only on left email text pane and right answer text editor */}
      <section className="flex-1 min-h-0 flex overflow-hidden bg-white">
        {screen === "prompt" ? (
          /* Page 1 of 2: Full Email Scenario & Tasks prompt (inner scroll only) */
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-7">
            <div className="mx-auto w-full max-w-[960px] border border-slate-300 rounded-sm bg-white p-5 sm:p-8 shadow-sm">
              <div className="text-xs sm:text-[14px] leading-relaxed text-slate-800 space-y-4 font-normal">
                <div className="border-b border-slate-200 pb-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    You receive the following email :
                  </p>
                  <p><strong>From:</strong> {question.from}</p>
                  <p><strong>To:</strong> {question.to}</p>
                  <p className="font-semibold text-[#0B2545]">
                    <strong>Subject:</strong> {question.subject}
                  </p>
                </div>

                <p>Hi,</p>

                <p>{question.intro}</p>

                <p className="font-semibold text-[#0B2545]">
                  {question.taskPrompt}
                </p>

                <div className="space-y-2 border-l-2 border-[#0B2545] pl-3 py-1">
                  <ExamTaskList question={question} />
                </div>

                <p className="text-xs text-slate-600 pt-1">
                  The plan can be accessed by clicking on the <strong>Reference Material</strong> button above.
                </p>

                <div className="pt-2 text-slate-800">
                  <p>Regards,</p>
                  <p>Agata</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Dedicated response workspace; Previous returns to the full scenario. */
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#eef2f6]">

            {/* Right Answer Workspace Editor */}
            <div className="w-full h-full flex flex-col min-h-0 bg-white">
              <div className="flex h-9 flex-shrink-0 items-center justify-between border-b border-[#c5ced7] bg-[#f0f4f8] px-4">
                <span className="text-xs font-bold text-[#0B2545]">
                  Write your response to {question.from} in the box below:
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Word Processor
                </span>
              </div>
              <div className="flex-1 min-h-0 flex flex-col p-2 sm:p-3 overflow-hidden">
                <ResponseEditor
                  key={`${examSession.sessionId ?? "local"}-${questionId}`}
                  initialContent={initialContent}
                  onChange={(html) =>
                    setAnswers((values) => {
                      const nextAnswers = {
                        ...values,
                        [questionId]: html,
                      };
                      if (studentAuth.user) {
                        window.localStorage.setItem(
                          answerDraftsKey(studentAuth.user.id),
                          JSON.stringify(nextAnswers),
                        );
                      }
                      return nextAnswers;
                    })
                  }
                  editable={
                    seconds > 0 && !submitting && !exiting && !examSession.completed
                  }
                />
              </div>
              <div className="flex h-7 flex-shrink-0 items-center justify-between border-t border-[#adb8c4] bg-[#edf1f4] px-3 text-[11px] text-slate-500">
                <span>Response workspace autosave</span>
                <span
                  className={`flex items-center gap-1 font-semibold ${
                    saveState === "error"
                      ? "text-red-700"
                      : saveState === "saving"
                        ? "text-amber-700"
                        : "text-emerald-700"
                  }`}
                >
                  {saveState === "error" ? (
                    <span>
                      Save failed: {saveError ?? "Unable to save response"}
                    </span>
                  ) : saveState === "saving" ? (
                    <>
                      <span className="size-2 animate-pulse rounded-full bg-amber-500" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="size-3" />
                      {saveState === "saved" ? "All changes saved" : "Autosave ready"}
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Bottom Footer (single-row, official Pearson VUE light blue #0067A3) */}
      <footer className="h-12 sm:h-14 flex-shrink-0 flex items-center justify-between bg-[#0067A3] px-3 sm:px-6 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEndExam(true)}
            disabled={submitting || exiting}
            className="inline-flex h-8 sm:h-9 items-center border border-white/60 bg-transparent px-2.5 sm:px-3 text-xs sm:text-[13px] font-bold text-white hover:bg-white/10 active:translate-y-px whitespace-nowrap rounded-[2px] transition-colors"
          >
            Finish<span className="hidden sm:inline">&nbsp;Exam</span>
          </button>
          <button
            onClick={() => setFormulae(true)}
            className="inline-flex h-8 sm:h-9 items-center gap-1.5 border border-white/80 bg-white/10 hover:bg-white/20 active:translate-y-px px-2.5 sm:px-4 text-xs sm:text-[13px] font-bold text-white transition-colors rounded-[2px]"
          >
            <HelpCircle className="size-4 shrink-0 text-white" />
            <span>Tables and Formulae</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {screen === "answer" && (
            <button
              onClick={previous}
              disabled={submitting || exiting}
              className="inline-flex h-8 sm:h-9 items-center gap-1 border border-white/80 bg-white/10 hover:bg-white/20 active:translate-y-px px-3 sm:px-4 text-xs sm:text-[13px] font-bold text-white transition-colors rounded-[2px]"
            >
              <span className="text-sm">⬅</span> Previous
            </button>
          )}
          <button
            onClick={next}
            disabled={submitting || exiting}
            className="inline-flex h-8 sm:h-9 items-center gap-1 border border-white/80 bg-white/10 hover:bg-white/20 active:translate-y-px px-4 sm:px-5 text-xs sm:text-[13px] font-bold text-white transition-colors rounded-[2px]"
          >
            Next <span className="text-sm font-bold">➔</span>
          </button>
        </div>
      </footer>

      {calculator && <Calculator onClose={() => setCalculator(false)} />}
      {scratch && <ScratchPad onClose={() => setScratch(false)} />}
      <ReferenceMaterials
        open={references}
        onOpenChange={setReferences}
        materials={materials.filter(m => m.kind === "reference" && (!m.question_id || m.question_id === questionId))}
        currentSection={question.section}
        sections={sections}
      />
      <DocumentViewer
        open={preseen}
        onOpenChange={setPreseen}
        material={materials.find(m => m.kind === "preseen")}
        examLevel={resolvedExamLevel}
        useSample={examId === LEGACY_EXAM_ID}
        sections={sections}
      />
      <FormulaTables open={formulae} onOpenChange={setFormulae} />

      {/* 2. TWO-STEP SEQUENTIAL WARNING MODAL FLOW (Section Transitions) */}
      {/* Step 1 Modal ("End of Section") */}
      <AlertDialog
        open={step1Warning}
        onOpenChange={setStep1Warning}
      >
        <AlertDialogContent className="rounded-none border-2 border-[#0067A3] p-0 shadow-2xl max-w-[92vw] sm:max-w-lg bg-white">
          <AlertDialogHeader className="block bg-[#0067A3] px-4 sm:px-5 py-3 text-left">
            <AlertDialogTitle className="text-sm sm:text-[15px] font-bold text-white">
              End of Section
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription className="px-4 sm:px-5 pt-4 sm:pt-5 text-xs sm:text-[14px] leading-relaxed text-slate-800 font-normal">
            You have reached the end of this section. If you want to review your answers, click &apos;Return to Section&apos;. To proceed, click &apos;Next&apos;.
          </AlertDialogDescription>
          <AlertDialogFooter className="px-4 sm:px-5 pb-4 sm:pb-5 gap-2 pt-3">
            <AlertDialogCancel className="rounded-[2px] text-xs sm:text-sm font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-700">
              Return to Section
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStep1Next}
              className="rounded-[2px] !bg-[#0067A3] hover:!bg-[#0077b6] text-xs sm:text-sm font-bold !text-white px-5 shadow-sm border border-[#0067A3]"
            >
              Next
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2 Modal ("Confirm Section Submission") */}
      <AlertDialog
        open={step2Warning}
        onOpenChange={setStep2Warning}
      >
        <AlertDialogContent className="rounded-none border-2 border-[#0067A3] p-0 shadow-2xl max-w-[92vw] sm:max-w-lg bg-white">
          <AlertDialogHeader className="block bg-[#0067A3] px-4 sm:px-5 py-3 text-left">
            <AlertDialogTitle className="text-sm sm:text-[15px] font-bold text-white">
              Confirm Section Submission
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription className="px-4 sm:px-5 pt-4 sm:pt-5 text-xs sm:text-[14px] leading-relaxed text-slate-800 font-normal">
            Are you sure you want to leave this section? Once confirmed, your answers will be locked and you will NOT be able to return to this section during the exam.
          </AlertDialogDescription>
          <AlertDialogFooter className="px-4 sm:px-5 pb-4 sm:pb-5 gap-2 pt-3">
            <AlertDialogCancel className="rounded-[2px] text-xs sm:text-sm font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-700">
              No, Return
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmEndSection}
              className="rounded-[2px] !bg-[#0067A3] hover:!bg-[#0077b6] text-xs sm:text-sm font-bold !text-white px-5 shadow-sm border border-[#0067A3]"
            >
              Yes, End Section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Early End Exam Confirmation */}
      <AlertDialog open={endExam} onOpenChange={setEndExam}>
        <AlertDialogContent className="rounded-none border-2 border-[#0067A3] p-0 shadow-2xl max-w-[92vw] sm:max-w-lg bg-white">
          <AlertDialogHeader className="block bg-[#0067A3] px-4 sm:px-5 py-3 text-left">
            <AlertDialogTitle className="text-sm sm:text-[15px] font-bold text-white">
              Submit Exam
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription className="px-4 sm:px-5 pt-4 sm:pt-5 text-xs sm:text-[14px] leading-relaxed text-slate-800 font-normal">
            Are you sure you would like to submit and finalize this entire mock examination now? Your answers will be locked and cannot be edited after submission.
          </AlertDialogDescription>
          <AlertDialogFooter className="px-4 sm:px-5 pb-4 sm:pb-5 gap-2 pt-3">
            <AlertDialogCancel className="rounded-[2px] text-xs sm:text-sm font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-700">
              Cancel / Return
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEarlyEnd}
              className="rounded-[2px] !bg-[#0067A3] hover:!bg-[#0077b6] text-xs sm:text-sm font-bold !text-white px-5 shadow-sm border border-[#0067A3]"
            >
              Submit Exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {(transitioning || examSession.loading || submitting) && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-[#e7ebef]/90">
          <div className="text-center">
            <div className="mx-auto size-10 sm:size-12 animate-spin rounded-full border-[4px] sm:border-[5px] border-[#b9c9d7] border-t-[#0067A3]" />
            <p className="mt-3 sm:mt-4 text-xs sm:text-sm font-semibold text-[#0067A3]">
              {submitting ? "Submitting exam..." : examSession.loading ? "Restoring exam session..." : "Please wait..."}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
