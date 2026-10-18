import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const text = z.string().trim().min(1).max(20_000);
export const subtaskSchema = z.object({
  description: text,
  weightage: z.number().finite().positive().max(100_000)
    .refine(value => Number(value.toFixed(2)) === value, "Use at most two decimal places for weightage."),
});
export const questionSchema = z.object({
  from: text.max(200),
  to: text.max(200),
  subject: text.max(300),
  intro: text,
  taskPrompt: text,
  weightageUnit: z.enum(["percent", "marks"]).default("percent"),
  subtasks: z.array(subtaskSchema).min(1, "Add at least one subtask.").max(100),
  timeMinutes: z.coerce.number().int().min(1).max(180).default(60),
}).superRefine((question, ctx) => {
  if (question.weightageUnit === "percent" && Math.abs(question.subtasks.reduce((sum, task) => sum + task.weightage, 0) - 100) > 0.000001) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subtasks"], message: "Percentage weightages for each question must total 100%." });
  }
});
export const mockSchema = z.object({
  level: z.enum(["OCS", "MCS", "SCS"]).default("SCS"),
  name: text.max(200),
  description: z.string().trim().max(5000).default(""),
  status: z.enum(["draft", "published"]),
  questions: z.array(questionSchema).min(1).max(12),
  materials: z.array(z.object({
    name: text.max(255),
    storage_path: text.max(600),
    kind: z.enum(["reference", "preseen", "solution"]),
    question_id: z.string().regex(/^section-\d+$/).nullable(),
  })).max(30).default([]),
});
export const editMockSchema = mockSchema.extend({ status: z.literal("draft"), revision: z.number().int().min(0) });
export const mockStatusSchema = z.union([
  z.object({ status: z.enum(["draft", "published"]), revision: z.number().int().min(0).default(0) }).strict(),
  z.object({ action: z.literal("restore"), revision: z.number().int().min(0) }).strict(),
]);
export const removeMockSchema = z.object({ revision: z.number().int().min(0) }).strict();
export const gradeSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string().trim().min(1).max(20_000),
  status: z.enum(["draft", "published"]),
  revision: z.number().int().min(0),
});
export const newUserSchema = z.object({
  email: z.string().email().max(254),
  full_name: z.string().trim().min(1).max(150),
  password: z.string()
    .min(PASSWORD_MIN_LENGTH, `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(PASSWORD_MAX_LENGTH, `Password must contain no more than ${PASSWORD_MAX_LENGTH} characters.`),
  role: z.enum(["student", "tutor"]),
  assigned_level: z.enum(["OCS", "MCS", "SCS"]).default("SCS"),
});
export const updateUserSchema = z.object({
  full_name: z.string().trim().min(1).max(150),
  role: z.enum(["student", "tutor"]),
  is_active: z.boolean(),
  assigned_level: z.enum(["OCS", "MCS", "SCS"]),
});
