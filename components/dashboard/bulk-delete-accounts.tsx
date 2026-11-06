"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Profile } from "@/lib/dashboard/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function canRemoveAccount(account: Pick<Profile, "id" | "role">, currentUserId?: string) {
  return account.id !== currentUserId && (account.role === "student" || account.role === "tutor");
}

export async function deleteAccount(id: string) {
  const response = await fetch(`/api/dashboard/users/${encodeURIComponent(id)}`, {
    method: "DELETE", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: "DELETE" }), signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json().catch(() => null) as { deleted?: unknown; error?: unknown } | null;
  if (!response.ok || result?.deleted !== true) throw new Error(typeof result?.error === "string" ? result.error : "Account removal was not confirmed. Refresh the list before retrying.");
}

export function BulkDeleteAccounts({ users, currentUserId, disabled = false, onDeleted, onBusyChange }: {
  users: Profile[]; currentUserId?: string; disabled?: boolean; onDeleted: (ids: string[]) => void; onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter(), inputId = useId();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""), [progress, setProgress] = useState(0);
  const pending = useRef(false);
  const protectedSelection = users.some(user => !canRemoveAccount(user, currentUserId));
  return <>
    <button type="button" disabled={disabled || busy || !users.length || protectedSelection} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50" onClick={() => { setConfirmation(""); setError(""); setOpen(true); }}>Delete selected accounts ({users.length})</button>
    <AlertDialog open={open} onOpenChange={next => { if (!pending.current) setOpen(next); }}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto [overflow-wrap:anywhere]" onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }}>
        <AlertDialogHeader><AlertDialogTitle>Delete {users.length} selected accounts?</AlertDialogTitle><AlertDialogDescription>This permanently removes the selected logins and their exam sessions, answers, submissions and grades. Download any records you need first. Suspend access instead if you want to keep a student’s history. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
        <ul aria-label="Accounts selected for deletion" className="max-h-40 list-inside list-disc overflow-y-auto text-sm text-slate-600">{users.map(user => <li key={user.id}>{user.full_name || user.email || "Unnamed account"}{user.full_name && user.email ? ` — ${user.email}` : ""}</li>)}</ul>
        <div><label htmlFor={inputId} className="mb-2 block text-sm font-medium">Type DELETE to confirm account deletion</label><input id={inputId} disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-base" /></div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={disabled || busy || confirmation !== "DELETE" || !users.length || protectedSelection} className="min-h-9 min-w-0 bg-red-700 py-2 text-white hover:bg-red-800" style={{ whiteSpace: "normal", height: "auto" }} onClick={async event => {
          event.preventDefault();
          if (pending.current || disabled || confirmation !== "DELETE" || !users.length || protectedSelection) return;
          pending.current = true; setBusy(true); onBusyChange(true); setError(""); setProgress(0);
          const snapshot = [...users], removed: string[] = [];
          try {
            for (const user of snapshot) { await deleteAccount(user.id); removed.push(user.id); setProgress(removed.length); }
            setOpen(false); toast.success(`${removed.length} account(s) deleted.`);
          } catch (reason) {
            const message = `${removed.length} of ${snapshot.length} accounts confirmed deleted. ${reason instanceof Error ? reason.message : "Deletion stopped. Refresh before retrying."}`;
            setError(message); toast.error(message);
          } finally {
            onDeleted(removed);
            // Also reconcile a response lost after a successful Auth deletion.
            router.refresh();
            pending.current = false; setBusy(false); onBusyChange(false);
          }
        }}>{busy ? `Deleting ${progress}/${users.length}…` : "Delete selected accounts permanently"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
