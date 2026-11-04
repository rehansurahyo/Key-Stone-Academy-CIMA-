// Missing scales belong to historical /100 grades, never silently relabel them.
export function gradingScale(record: { score_max?: number }): 100 | 150 {
  return record.score_max === 150 ? 150 : 100;
}
