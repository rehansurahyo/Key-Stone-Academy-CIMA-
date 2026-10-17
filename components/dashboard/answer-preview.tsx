"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";

export function AnswerPreview({ html }: { html: string }) {
  // Tiptap parses only its supported schema. No raw student HTML is injected.
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), TableKit],
    content: html, editable: false, immediatelyRender: false,
    editorProps: { attributes: { class: "min-h-24 p-5 text-sm leading-7 text-slate-800 outline-none [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:p-2" } },
  });
  if (!html.trim()) return <p className="p-5 text-sm italic text-slate-400">No response provided.</p>;
  return <EditorContent editor={editor} />;
}
