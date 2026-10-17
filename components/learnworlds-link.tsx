import { ExternalLink } from "lucide-react";
import { LEARNWORLDS_SCHOOL_URL } from "@/lib/learnworlds";

export function LearnWorldsLink() {
  return (
    <a
      href={LEARNWORLDS_SCHOOL_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Keystone LearnWorlds learning portal (opens in a new tab)"
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-[#0B2545] transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:px-3"
    >
      Learning portal
      <ExternalLink aria-hidden="true" className="size-3.5" />
    </a>
  );
}
