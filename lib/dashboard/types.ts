import type { Question } from "@/lib/exam-data";
import type { ExamLevel } from "@/lib/exam-levels";
export type StaffRole = "admin" | "tutor";
export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "student" | StaffRole;
  is_active: boolean;
  assigned_level: ExamLevel;
  created_at: string;
};

export type ExamQuestionContent = Question;

export type MockExam = {
  level: ExamLevel;
  id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  revision: number;
  copied_from: string | null;
  created_by: string | null;
  created_at: string;
};
export type SubmissionReport = {
  evaluation_id?: string | null;
  id: string; submission_id: string; file_name: string; mime_type: string;
  byte_size: number; storage_path: string; uploaded_by: string; created_at: string;
};
export type ExamQuestion = {
  id: string;
  exam_id: string;
  question_id: string;
  position: number;
  duration_seconds: number;
  content: ExamQuestionContent;
};
export type ExamMaterial = {
  id: string;
  exam_id: string;
  name: string;
  kind: "reference" | "preseen" | "solution";
  question_id: string | null;
  storage_path: string;
};
export type Submission = {
  id: string;
  session_id: string;
  student_id: string;
  exam_id: string;
  status: "submitted" | "graded";
  score: number | null;
  feedback: string;
  submitted_at: string;
  graded_at: string | null;
  graded_by: string | null;
  revision: number;
  student: Pick<Profile, "full_name" | "email"> | null;
  exam: Pick<MockExam, "name"> | null;
};
