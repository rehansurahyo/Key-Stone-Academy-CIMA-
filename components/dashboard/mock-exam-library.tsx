"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EXAM_LEVELS, LEVEL_NAMES, parseExamLevel, type ExamLevel } from "@/lib/exam-levels";
import { Notice, primaryClass, secondaryClass, sendJson } from "./shared";
import { MockExamsTable, type MockExamListItem } from "./mock-exams-table";
import type { FreeMockIds } from "./set-free-mock-button";

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
  freeMockIds = {},
  canSetFreeMock = false,
  freeMockReady = true,
}: {
  exams: MockExamListItem[];
  managementReady: boolean;
  initialLevel?: ExamLevel;
  initialPage: number;
  archived: boolean;
  freeMockIds?: FreeMockIds;
  canSetFreeMock?: boolean;
  freeMockReady?: boolean;
}) {
  const [level, setLevel] = useState<ExamLevel | undefined>(initialLevel);
  const [page, setPage] = useState(initialPage);
  const [freeMockOverride, setFreeMockOverride] = useState<{ source: FreeMockIds; values: FreeMockIds } | null>(null);
  const [freeMockBusy, setFreeMockBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const selectingFreeMock = useRef(false);
  const selectedFreeMocks = freeMockOverride?.source === freeMockIds ? freeMockOverride.values : freeMockIds;

  async function selectFreeMock(exam: { id: string; name: string; level: ExamLevel; revision: number }) {
    if (selectingFreeMock.current || !canSetFreeMock || !freeMockReady) throw new Error("Please wait before changing the free mock.");
    selectingFreeMock.current = true; setFreeMockBusy(true);
    try {
      const result = await sendJson("/api/dashboard/free-mock", "PUT", {
        exam_id: exam.id, level: exam.level, revision: exam.revision,
        previous_exam_id: selectedFreeMocks[exam.level] ?? null,
      });
      if (result.id !== exam.id) throw new Error("Unexpected response. Reload to verify the free mock selection.");
      setFreeMockOverride({ source: freeMockIds, values: { ...selectedFreeMocks, [exam.level]: result.id } });
      setNotice(`${exam.name} is now the ${exam.level} free mock for new trial registrations. Existing students and attempts are unchanged.`);
    } finally { selectingFreeMock.current = false; setFreeMockBusy(false); }
  }

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
    {canSetFreeMock && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Choose one published free mock per level using “Set as Free Mock”. Changes apply to new trial registrations only. Existing students keep their assigned paper and attempts.</p>}
    {notice && <div className="mb-4"><Notice message={notice} /></div>}
    <MockExamsTable exams={visibleExams} managementReady={managementReady} freeMockControls={canSetFreeMock ? { ids: selectedFreeMocks, busy: freeMockBusy, ready: freeMockReady, select: selectFreeMock } : undefined} />
    <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
      <span>{filteredExams.length} mocks · Page {safePage} of {pageCount}</span>
      <div className="flex gap-2">
        {safePage > 1 && <button type="button" onClick={() => selectPage(safePage - 1)} className={secondaryClass}>Previous</button>}
        {safePage < pageCount && <button type="button" onClick={() => selectPage(safePage + 1)} className={secondaryClass}>Next</button>}
      </div>
    </div>
  </>;
}
