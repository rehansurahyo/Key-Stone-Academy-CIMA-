"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { LEGACY_EXAM_ID } from "@/lib/exam-data";

type SessionState = {
  sessionId: string | null;
  activeQuestionId: string | null;
  timeRemainingSeconds: number;
  questionTimers: Record<
    string,
    { remainingSeconds: number; syncedAt: string }
  >;
  answers: Record<string, string>;
  loading: boolean;
  error: string | null;
  completed: boolean;
};

const DEFAULT_QUESTION_DURATION_SECONDS = 3_600;
const SESSION_COLUMNS = "id, status, active_question_id, question_timers";

function parseQuestionTimers(value: unknown): SessionState["questionTimers"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([questionId, rawTimer]) => {
      if (!rawTimer || typeof rawTimer !== "object" || Array.isArray(rawTimer)) {
        return [];
      }
      const timer = rawTimer as {
        remaining_seconds?: unknown;
        synced_at?: unknown;
      };
      if (
        typeof timer.remaining_seconds !== "number" ||
        typeof timer.synced_at !== "string"
      ) {
        return [];
      }
      return [
        [
          questionId,
          {
            remainingSeconds: Math.max(0, timer.remaining_seconds),
            syncedAt: timer.synced_at,
          },
        ],
      ];
    }),
  );
}

export function useStudentExamSession(active: boolean, examId = LEGACY_EXAM_ID, initialQuestionDuration = DEFAULT_QUESTION_DURATION_SECONDS, isTrial = false, startRequested = true) {
  const [state, setState] = useState<SessionState>({
    sessionId: null,
    activeQuestionId: null,
    timeRemainingSeconds: initialQuestionDuration,
    questionTimers: {},
    answers: {},
    loading: false,
    error: null,
    completed: false,
  });
  const initializedRef = useRef(false);

  const initialize = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setState((current) => ({ ...current, loading: false }));
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setState((current) => ({
        ...current,
        loading: false,
        error: "Sign in with your student account to persist this exam.",
      }));
      return;
    }

    // Preserve the name managed in profiles. Only create a missing legacy row.
    const { data: profile, error: profileLookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    const { error: profileInsertError } = profile
      ? { error: null }
      : await supabase.from("profiles").insert({
          id: user.id,
          full_name:
            user.user_metadata.full_name ?? user.user_metadata.name ?? null,
          email: user.email ?? null,
          role: "student",
        });
    const profileError = profileLookupError ?? profileInsertError;
    if (profileError) {
      setState((current) => ({
        ...current,
        loading: false,
        error: profileError.message,
      }));
      return;
    }

    const { data: existing, error: lookupError } = await supabase
      .from("exam_sessions")
      .select(SESSION_COLUMNS)
      .eq("user_id", user.id)
      .eq("exam_id", examId)
      .in("status", startRequested ? ["not_started", "in_progress"] : ["in_progress"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      setState((current) => ({
        ...current,
        loading: false,
        error: lookupError.message,
      }));
      return;
    }

    let session = existing;
    // Reopening the exam after submission should show the existing completion.
    if (!session && (isTrial || !startRequested)) {
      const { data, error } = await supabase.from("exam_sessions")
        .select(SESSION_COLUMNS)
        .eq("user_id", user.id).eq("exam_id", examId).eq("status", "completed")
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) {
        setState(current => ({ ...current, loading: false, error: error.message }));
        return;
      }
      session = data;
    }
    if (!startRequested && !session) {
      setState(current => ({ ...current, loading: false, error: "This attempt is no longer active. Return to the dashboard to check its status." }));
      return;
    }
    if (!session) {
      const { data, error } = await supabase
        .from("exam_sessions")
        .insert({
          user_id: user.id,
          exam_id: examId,
          status: "in_progress",
          duration_seconds: initialQuestionDuration,
          time_remaining_seconds: initialQuestionDuration,
          question_timers: {},
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select(SESSION_COLUMNS)
        .single();
      if (error) {
        // Two tabs can both see no attempt. The database lets only one insert;
        // the other tab resumes that row rather than starting a second timer.
        if (isTrial && error.code === "23505") {
          const retry = await supabase.from("exam_sessions")
            .select(SESSION_COLUMNS)
            .eq("user_id", user.id).eq("exam_id", examId)
            .order("updated_at", { ascending: false }).limit(1).maybeSingle();
          session = retry.error ? null : retry.data;
        }
        if (!session) {
          setState(current => ({ ...current, loading: false, error: error.message }));
          return;
        }
      } else {
        session = data;
      }
    } else if (session.status === "not_started") {
      const { data, error } = await supabase
        .from("exam_sessions")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .select(SESSION_COLUMNS)
        .single();
      if (error) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error.message,
        }));
        return;
      }
      session = data;
    }

    const { data: storedAnswers, error: answersError } = await supabase
      .from("exam_answers")
      .select("question_id, answer_text")
      .eq("session_id", session.id);

    if (answersError) {
      setState((current) => ({
        ...current,
        loading: false,
        error: answersError.message,
      }));
      return;
    }

    setState({
      sessionId: session.id,
      activeQuestionId: session.active_question_id ?? null,
      timeRemainingSeconds: DEFAULT_QUESTION_DURATION_SECONDS,
      questionTimers: parseQuestionTimers(session.question_timers),
      answers: Object.fromEntries(
        (storedAnswers ?? []).map((answer: { question_id: string; answer_text: string }) => [
          answer.question_id,
          answer.answer_text,
        ]),
      ),
      loading: false,
      error: null,
      completed: session.status === "completed",
    });
  }, [examId, initialQuestionDuration, isTrial, startRequested]);

  const loadAttempt = useCallback(async () => {
    try {
      await initialize();
    } catch (error) {
      setState(current => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Unable to restore your attempt. Please reconnect and try again." }));
    }
  }, [initialize]);

  useEffect(() => {
    if (!active || initializedRef.current) return;
    initializedRef.current = true;
    void loadAttempt();
  }, [active, loadAttempt]);

  const completeSession = useCallback(
    async (timeRemainingSeconds: number) => {
      if (!isSupabaseConfigured) {
        setState((current) => ({ ...current, completed: true }));
        return true;
      }
      if (!state.sessionId) {
        setState((current) => ({ ...current, error: "The exam session has not been saved. Please reconnect before submitting." }));
        return false;
      }
      try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("exam_sessions")
        .update({
          status: "completed",
          time_remaining_seconds: Math.max(0, timeRemainingSeconds),
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.sessionId)
        .eq("status", "in_progress")
        .select("id,status").maybeSingle();

      if (error) {
        setState((current) => ({ ...current, error: error.message }));
        return false;
      }
      if (!data) {
        // A zero-row update is not confirmation of submission. Another tab may
        // have completed it; verify that case before showing a success screen.
        const current = await supabase.from("exam_sessions").select("id,status").eq("id", state.sessionId).maybeSingle();
        if (current.error || current.data?.status !== "completed") throw new Error("Submission could not be confirmed. Your draft is retained; reconnect and retry.");
      } else if (data.status !== "completed") {
        throw new Error("Submission could not be confirmed. Please reconnect and retry.");
      }
      setState((current) => ({ ...current, completed: true, error: null }));
      return true;
      } catch (error) {
        setState(current => ({ ...current, error: error instanceof Error ? error.message : "Unable to submit your exam. Please reconnect and retry." }));
        return false;
      }
    },
    [state.sessionId],
  );

  const resetLocalSession = useCallback(() => {
    initializedRef.current = false;
    setState({
      sessionId: null,
      activeQuestionId: null,
      timeRemainingSeconds: initialQuestionDuration,
      questionTimers: {},
      answers: {},
      loading: false,
      error: null,
      completed: false,
    });
  }, [initialQuestionDuration]);

  return { ...state, initialize: loadAttempt, completeSession, resetLocalSession };
}
