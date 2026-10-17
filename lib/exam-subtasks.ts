export type WeightageUnit = "percent" | "marks";
export type ExamSubtask = { description: string; weightage: number };
type SubtaskSource = {
  subtasks?: ExamSubtask[]; weightageUnit?: WeightageUnit;
  partA?: string; partB?: string; weightA?: string; weightB?: string;
};

export function subtaskLabel(index: number): string {
  let label = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(97 + (n - 1) % 26) + label;
  return label;
}

export function getSubtasks(question: SubtaskSource): ExamSubtask[] {
  if (question.subtasks !== undefined) return question.subtasks;
  // Old mocks continue working before/after the additive migration.
  return [[question.partA, question.weightA], [question.partB, question.weightB]]
    .filter(([description]) => Boolean(description))
    .map(([description, weight]) => ({ description: description!, weightage: Number(weight?.replace(/%$/, "") ?? 0) }));
}

export function formatWeightage(weightage: number, unit: WeightageUnit = "percent") {
  return `${weightage}${unit === "marks" ? " marks" : "%"}`;
}
