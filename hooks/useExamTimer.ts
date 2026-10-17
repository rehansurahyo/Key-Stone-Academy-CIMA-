"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
type UseExamTimerOptions = {
    initialTimeRemainingSeconds: number;
    sessionId: string | null;
    questionId: string;
    active?: boolean;
    onTimeUp: () => void | boolean | Promise<void | boolean>;
};
export function useExamTimer({ initialTimeRemainingSeconds, sessionId, questionId, active = true, onTimeUp, }: UseExamTimerOptions) {
    const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(initialTimeRemainingSeconds);
    const [syncError, setSyncError] = useState<string | null>(null);
    const anchorRef = useRef({
        remaining: initialTimeRemainingSeconds,
        recordedAt: 0,
    });
    const timeUpCalledRef = useRef(false);
    const timeUpPendingRef = useRef(false);
    const timeUpRetryAtRef = useRef(0);
    const onTimeUpRef = useRef(onTimeUp);
    const scopeRef = useRef({ key: "", generation: 0 });
    const readSequenceRef = useRef(0);
    const scopeKey = JSON.stringify([sessionId, questionId]);
    useLayoutEffect(() => {
        if (scopeRef.current.key !== scopeKey) {
            scopeRef.current = { key: scopeKey, generation: scopeRef.current.generation + 1 };
        }
    }, [scopeKey]);
    useEffect(() => {
        onTimeUpRef.current = onTimeUp;
    }, [onTimeUp]);
    const setAuthoritativeTime = useCallback((remaining: number) => {
        const safeRemaining = Math.max(0, Math.floor(remaining));
        anchorRef.current = { remaining: safeRemaining, recordedAt: Date.now() };
        setTimeRemainingSeconds(safeRemaining);
        if (safeRemaining > 0)
            timeUpCalledRef.current = false;
    }, []);
    const getLocalRemaining = useCallback(() => Math.max(0,
        anchorRef.current.remaining - Math.max(0, Math.floor((Date.now() - anchorRef.current.recordedAt) / 1000))), []);
    useEffect(() => {
        timeUpCalledRef.current = false;
        timeUpPendingRef.current = false;
        timeUpRetryAtRef.current = 0;
        // Reset this external wall-clock anchor before subscribing to tick events.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAuthoritativeTime(initialTimeRemainingSeconds);
    }, [initialTimeRemainingSeconds, questionId, sessionId, setAuthoritativeTime]);
    const syncToServer = useCallback(async (override?: number) => {
        if (!sessionId || !isSupabaseConfigured)
            return;
        const generation = scopeRef.current.generation;
        const remaining = Math.max(0, override ?? getLocalRemaining());
        const supabase = createClient();
        try {
            const { error } = await supabase.rpc("sync_question_timer", {
                p_session_id: sessionId,
                p_question_id: questionId,
                p_remaining_seconds: remaining,
            });
            if (error) {
                if (scopeRef.current.generation === generation)
                    setSyncError(error.message);
                throw error;
            }
            if (scopeRef.current.generation === generation)
                setSyncError(null);
        }
        catch (error) {
            if (scopeRef.current.generation === generation) {
                setSyncError(error instanceof Error ? error.message : "Unable to sync the exam timer.");
            }
            throw error;
        }
    }, [getLocalRemaining, questionId, sessionId]);
    const reconcileFromServer = useCallback(async () => {
        if (!sessionId || !isSupabaseConfigured)
            return;
        const generation = scopeRef.current.generation;
        const sequence = ++readSequenceRef.current;
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from("exam_sessions")
                .select("status, active_question_id, question_timers")
                .eq("id", sessionId)
                .single();
            if (scopeRef.current.generation !== generation || readSequenceRef.current !== sequence)
                return;
            if (error) {
                setSyncError(error.message);
                return;
            }
            if (data.status === "completed") {
                setAuthoritativeTime(0);
                return;
            }
            const timer = (data.question_timers as Record<string, {
                remaining_seconds?: number;
                synced_at?: string;
            }> | null)?.[questionId];
            if (!timer || typeof timer.remaining_seconds !== "number") {
                const remaining = Math.min(initialTimeRemainingSeconds, getLocalRemaining());
                setAuthoritativeTime(remaining);
                await syncToServer(remaining).catch(() => undefined);
                return;
            }
            const serverRecordedAt = new Date(timer.synced_at ?? "").getTime();
            const elapsedSinceSync = data.active_question_id === questionId && Number.isFinite(serverRecordedAt)
                ? Math.max(0, Math.floor((Date.now() - serverRecordedAt) / 1000))
                : 0;
            const reconciledRemaining = Math.min(getLocalRemaining(), Math.max(0, timer.remaining_seconds - elapsedSinceSync));
            setAuthoritativeTime(reconciledRemaining);
            if (data.active_question_id !== questionId) {
                await syncToServer(reconciledRemaining).catch(() => undefined);
            }
            else {
                setSyncError(null);
            }
        }
        catch (error) {
            if (scopeRef.current.generation === generation && readSequenceRef.current === sequence) {
                setSyncError(error instanceof Error ? error.message : "Unable to reconnect the exam timer.");
            }
        }
    }, [
        getLocalRemaining,
        initialTimeRemainingSeconds,
        questionId,
        sessionId,
        setAuthoritativeTime,
        syncToServer,
    ]);
    useEffect(() => {
        if (!active || !sessionId)
            return;
        void Promise.resolve().then(reconcileFromServer);
    }, [active, reconcileFromServer, sessionId]);
    useEffect(() => {
        if (!active)
            return;
        const updateClock = () => {
            const elapsed = Math.floor((Date.now() - anchorRef.current.recordedAt) / 1000);
            const next = Math.max(0, anchorRef.current.remaining - elapsed);
            setTimeRemainingSeconds(next);
            if (next === 0 && !timeUpCalledRef.current && !timeUpPendingRef.current && Date.now() >= timeUpRetryAtRef.current) {
                const generation = scopeRef.current.generation;
                timeUpPendingRef.current = true;
                timeUpRetryAtRef.current = Date.now() + 30000;
                void syncToServer(0).catch(() => undefined);
                void Promise.resolve().then(() => onTimeUpRef.current()).then(result => {
                    if (scopeRef.current.generation === generation) {
                        timeUpCalledRef.current = result !== false;
                    }
                }).catch(() => {
                    // Keep zero-time inputs locked; retry without claiming submission succeeded.
                    if (scopeRef.current.generation === generation)
                        timeUpCalledRef.current = false;
                }).finally(() => {
                    if (scopeRef.current.generation === generation)
                        timeUpPendingRef.current = false;
                });
            }
        };
        updateClock();
        const interval = window.setInterval(updateClock, 1000);
        return () => window.clearInterval(interval);
    }, [active, syncToServer]);
    useEffect(() => {
        if (!active || !sessionId)
            return;
        const interval = window.setInterval(() => {
            void syncToServer().catch(() => undefined);
        }, 30000);
        return () => window.clearInterval(interval);
    }, [active, sessionId, syncToServer]);
    useEffect(() => {
        if (!active)
            return;
        const handleOnline = () => {
            timeUpRetryAtRef.current = 0;
            void reconcileFromServer();
        };
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                void reconcileFromServer();
            }
            else {
                void syncToServer().catch(() => undefined);
            }
        };
        window.addEventListener("online", handleOnline);
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            window.removeEventListener("online", handleOnline);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [active, reconcileFromServer, syncToServer]);
    return {
        timeRemainingSeconds,
        syncError,
        syncNow: syncToServer,
        reconcile: reconcileFromServer,
    };
}
