import type { Profile } from "@/lib/dashboard/types";

export function TrialBadge({ accessType }: { accessType?: Profile["access_type"] | null }) {
  if (accessType !== "trial") return null;
  return <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-red-700" title="Free-trial student account">Free Trial</span>;
}
