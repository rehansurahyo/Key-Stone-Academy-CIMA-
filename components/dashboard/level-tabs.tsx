import Link from "next/link";
import { EXAM_LEVELS, LEVEL_NAMES, type ExamLevel } from "@/lib/exam-levels";
import { primaryClass, secondaryClass } from "./shared";

export function LevelTabs({ path, level, query = {} }: { path: string; level?: ExamLevel; query?: Record<string, string> }) {
  return <nav aria-label="Case study levels" className="mb-6 flex flex-wrap gap-2">{["all", ...EXAM_LEVELS].map(value => {
    const params = new URLSearchParams(query);
    if (value !== "all") params.set("level", value);
    return <Link key={value} aria-current={(level ?? "all") === value ? "page" : undefined}
      title={value === "all" ? "All case study levels" : LEVEL_NAMES[value as ExamLevel]}
      href={`${path}${params.size ? `?${params}` : ""}`}
      className={(level ?? "all") === value ? primaryClass : secondaryClass}>{value === "all" ? "All levels" : value}</Link>;
  })}</nav>;
}
