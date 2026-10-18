import type { ExamLevel } from "./exam-levels";

export type StudentAccess = {
  assigned_level: ExamLevel;
  access_type: "enrolled" | "trial";
  trial_exam_id: string | null;
};

// UI/page guard only. SQL RLS independently enforces the same entitlement.
export function canUseExam(access: StudentAccess, exam: { id: string; level: ExamLevel }) {
  return access.assigned_level === exam.level && (
    access.access_type === "enrolled" ||
    (access.access_type === "trial" && access.trial_exam_id === exam.id)
  );
}
