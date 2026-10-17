import type { z } from "zod";
import type { mockSchema } from "./validation";

export function mockQuestionRows(questions: z.infer<typeof mockSchema>["questions"]) {
  return questions.map((question, index) => ({
    question_id: `section-${index + 1}`, position: index + 1,
    duration_seconds: question.timeMinutes * 60,
    content: { ...question, section: index + 1, referenceDocTitle: question.subject,
      referenceDocColor: "text-[#133E68]", referenceParagraphs: [] },
  }));
}
