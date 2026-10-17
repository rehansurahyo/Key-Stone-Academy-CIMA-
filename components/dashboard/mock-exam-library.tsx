"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EXAM_LEVELS, LEVEL_NAMES, parseExamLevel, type ExamLevel } from "@/lib/exam-levels";
import { primaryClass, secondaryClass } from "./shared";
import { MockExamsTable, type MockExamListItem } from "./mock-exams-table";

const PAGE_SIZE = 20;

function readPage(value: string | null) {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

export function MockExamLibrary({
  exams,
  managementReady,
  initialLevel,
  initialPage,
  archived,
}: {
  exams: MockExamListItem[];
  managementReady: boolean;
  initialLevel?: ExamLevel;
  initialPage: number;
  archived: boolean;
}) {
  const [level, setLevel] = useState<ExamLevel | undefined>(initialLevel);
  const [page, setPage] = useState(initialPage);

  const filteredExams = useMemo(
    () => level ? exams.filter(exam => exam.level === level) : exams,
    [exams, level],
  );
  const pageCount = Math.max(1, Math.ceil(filteredExams.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleExams = filteredExams.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function updateUrl(nextLevel: ExamLevel | undefined, nextPage: number) {
    const url = new URL(window.location.href);
    if (nextLevel) url.searchParams.set("level", nextLevel);
    else url.searchParams.delete("level");
    if (nextPage > 1) url.searchParams.set("page", String(nextPage));
    else url.searchParams.delete("page");
    // Deliberately avoid Next navigation: the complete result set is already in memory.
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function selectLevel(nextLevel?: ExamLevel) {
    setLevel(nextLevel);
    setPage(1);
    updateUrl(nextLevel, 1);
  }

  function selectPage(nextPage: number) {
    const boundedPage = Math.max(1, Math.min(nextPage, pageCount));
    setPage(boundedPage);
    updateUrl(level, boundedPage);
  }

  useEffect(() => {
    const syncFromBrowserHistory = () => {
      const params = new URLSearchParams(window.location.search);
      setLevel(parseExamLevel(params.get("level") ?? undefined));
      setPage(readPage(params.get("page")));
    };
    window.addEventListener("popstate", syncFromBrowserHistory);
    return () => window.removeEventListener("popstate", syncFromBrowserHistory);
  }, []);

  return <>
    <nav aria-label="Case study levels" role="tablist" className="mb-6 flex flex-wrap gap-2">
      {["all", ...EXAM_LEVELS].map(value => {
        const active = (level ?? "all") === value;
        return <button
          key={value}
          type="button"
          role="tab"
          aria-selected={active}
          aria-current={active ? "page" : undefined}
          title={value === "all" ? "All case study levels" : LEVEL_NAMES[value as ExamLevel]}
          onClick={() => selectLevel(value === "all" ? undefined : value as ExamLevel)}
          className={active ? primaryClass : secondaryClass}
        >{value === "all" ? "All levels" : value}</button>;
      })}
    </nav>
    <nav aria-label="Mock exam views" className="mb-5 flex gap-2">
      <Link href={`/dashboard/exams${level ? `?level=${level}` : ""}`} className={archived ? secondaryClass : primaryClass}>Active mocks</Link>
      <Link href={`/dashboard/exams?view=archived${level ? `&level=${level}` : ""}`} className={archived ? primaryClass : secondaryClass}>Archived mocks</Link>
    </nav>
    <div aria-live="polite" aria-atomic="true" className="sr-only">Showing {filteredExams.length} {level ? `${level} ` : ""}mock exams.</div>
    <MockExamsTable exams={visibleExams} managementReady={managementReady} />
    <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
      <span>{filteredExams.length} mocks · Page {safePage} of {pageCount}</span>
      <div className="flex gap-2">
        {safePage > 1 && <button type="button" onClick={() => selectPage(safePage - 1)} className={secondaryClass}>Previous</button>}
        {safePage < pageCount && <button type="button" onClick={() => selectPage(safePage + 1)} className={secondaryClass}>Next</button>}
      </div>
    </div>
  </>;
}
