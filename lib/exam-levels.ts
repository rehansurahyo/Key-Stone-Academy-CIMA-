export const EXAM_LEVELS = ["OCS", "MCS", "SCS"] as const;
export type ExamLevel = typeof EXAM_LEVELS[number];
export const LEVEL_NAMES: Record<ExamLevel, string> = {
  OCS: "Operational Case Study", MCS: "Management Case Study", SCS: "Strategic Case Study",
};
export function parseExamLevel(value: unknown): ExamLevel | undefined {
  return EXAM_LEVELS.includes(value as ExamLevel) ? value as ExamLevel : undefined;
}
