import Link from "next/link";
import { requireStaffPage } from "@/lib/dashboard/auth";
import { PageHeading, secondaryClass } from "@/components/dashboard/shared";
import { UserManagement } from "@/components/dashboard/user-management";
import type { Profile } from "@/lib/dashboard/types";

export default async function Users({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase } = await requireStaffPage("admin");
  const params = await searchParams;
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const { data, count, error } = await supabase.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * 30, page * 30 - 1);
  if (error) throw error;
  return <><PageHeading title="People & access" description="Manage tutor and student accounts. Administrator access is protected." /><UserManagement users={(data ?? []) as Profile[]} /><div className="mt-5 flex items-center justify-between text-sm text-slate-500"><span>{count ?? 0} accounts · Page {page}</span><div className="flex gap-2">{page > 1 && <Link href={`?page=${page - 1}`} className={secondaryClass}>Previous</Link>}{page * 30 < (count ?? 0) && <Link href={`?page=${page + 1}`} className={secondaryClass}>Next</Link>}</div></div></>;
}
