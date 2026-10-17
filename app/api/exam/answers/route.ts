import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AnswerPayload = {
  sessionId?: unknown;
  questionId?: unknown;
  answerText?: unknown;
};

export async function POST(request: Request) {
  let payload: AnswerPayload;
  try {
    payload = (await request.json()) as AnswerPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof payload.sessionId !== "string" ||
    typeof payload.questionId !== "string" ||
    typeof payload.answerText !== "string" ||
    payload.answerText.length > 2_000_000
  ) {
    return NextResponse.json({ error: "Invalid answer payload." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { error } = await supabase.from("exam_answers").upsert(
    {
      session_id: payload.sessionId,
      question_id: payload.questionId,
      answer_text: payload.answerText,
      last_saved_at: new Date().toISOString(),
    },
    { onConflict: "session_id,question_id" },
  );

  if (error) {
    return NextResponse.json(
      { error: `Unable to save answer: ${error.message}` },
      { status: 403 },
    );
  }
  return NextResponse.json({ saved: true });
}
