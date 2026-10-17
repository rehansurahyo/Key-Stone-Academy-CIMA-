"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
export type ExamSaveState = "idle" | "saving" | "saved" | "error";
type UseExamAutosaveOptions = {
    sessionId: string | null;
    questionId: string;
    answerText: string;
    enabled?: boolean;
    debounceMs?: number;
};
export function useExamAutosave({ sessionId, questionId, answerText, enabled = true, debounceMs = 1800, }: UseExamAutosaveOptions) {
    const [saveState, setSaveState] = useState<ExamSaveState>("idle");
    const [saveError, setSaveError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestRef = useRef({ sessionId, questionId, answerText });
    // A restored browser draft is not evidence that the database saved it.
    const lastSavedRef = useRef(new Map<string, string>());
    const queueRef = useRef<Promise<boolean>>(Promise.resolve(true));
    useLayoutEffect(() => {
        latestRef.current = { sessionId, questionId, answerText };
    }, [sessionId, questionId, answerText]);
    const save = useCallback(async (payload = latestRef.current) => {
        if (!payload.sessionId || !isSupabaseConfigured) {
            setSaveState("idle");
            return true;
        }
        const key = JSON.stringify([payload.sessionId, payload.questionId]);
        // Serialize writes: a slower old request must never overwrite a newer draft.
        const operation = queueRef.current.then(async () => {
            if (lastSavedRef.current.get(key) === payload.answerText)
                return true;
            if (fadeTimerRef.current)
                clearTimeout(fadeTimerRef.current);
            setSaveState("saving");
            setSaveError(null);
            try {
                const supabase = createClient();
                const persist = async () => {
                    const response = await fetch("/api/exam/answers", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(payload),
                        credentials: "include",
                    });
                    const result = (await response.json().catch(() => ({}))) as {
                        error?: string;
                    };
                    return {
                        ok: response.ok,
                        status: response.status,
                        error: result.error ?? `Save request failed (${response.status}).`,
                    };
                };
                let result = await persist();
                // A long exam may outlive the initial access token. Refresh once and
                // retry the same idempotent upsert before reporting a save failure.
                if (!result.ok && result.status === 401) {
                    const { error: refreshError } = await supabase.auth.refreshSession();
                    if (!refreshError) {
                        result = await persist();
                    }
                }
                if (!result.ok) {
                    setSaveState("error");
                    setSaveError(result.error);
                    return false;
                }
                lastSavedRef.current.set(key, payload.answerText);
                if (latestRef.current.sessionId === payload.sessionId &&
                    latestRef.current.questionId === payload.questionId &&
                    latestRef.current.answerText === payload.answerText) {
                    setSaveError(null);
                    setSaveState("saved");
                    fadeTimerRef.current = setTimeout(() => setSaveState("idle"), 2000);
                }
                return true;
            }
            catch (error) {
                setSaveState("error");
                setSaveError(error instanceof Error ? error.message : "Unable to save. Please reconnect and retry.");
                return false;
            }
        });
        queueRef.current = operation;
        return operation;
    }, []);
    const flush = useCallback(async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        return save(latestRef.current);
    }, [save]);
    useEffect(() => {
        if (!enabled || !sessionId)
            return;
        if (lastSavedRef.current.get(JSON.stringify([sessionId, questionId])) === answerText) {
            return;
        }
        setSaveState("saving");
        setSaveError(null);
        if (fadeTimerRef.current)
            clearTimeout(fadeTimerRef.current);
        if (timerRef.current)
            clearTimeout(timerRef.current);
        const timer = setTimeout(() => {
            if (timerRef.current === timer)
                timerRef.current = null;
            void save({ sessionId, questionId, answerText });
        }, debounceMs);
        timerRef.current = timer;
        return () => {
            clearTimeout(timer);
            if (timerRef.current === timer)
                timerRef.current = null;
        };
    }, [answerText, debounceMs, enabled, questionId, save, sessionId]);
    useEffect(() => {
        const flushWithKeepalive = () => {
            const payload = latestRef.current;
            if (!payload.sessionId || !isSupabaseConfigured)
                return;
            if (lastSavedRef.current.get(JSON.stringify([payload.sessionId, payload.questionId])) === payload.answerText) {
                return;
            }
            void fetch("/api/exam/answers", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include",
                keepalive: true,
            }).catch(() => undefined); // The runtime retains the recovery draft locally.
        };
        const retryOnReconnect = () => { if (enabled)
            void flush(); };
        window.addEventListener("beforeunload", flushWithKeepalive);
        window.addEventListener("pagehide", flushWithKeepalive);
        window.addEventListener("online", retryOnReconnect);
        return () => {
            window.removeEventListener("beforeunload", flushWithKeepalive);
            window.removeEventListener("pagehide", flushWithKeepalive);
            window.removeEventListener("online", retryOnReconnect);
            if (fadeTimerRef.current)
                clearTimeout(fadeTimerRef.current);
        };
    }, [enabled, flush]);
    return { saveState, saveError, flush };
}
