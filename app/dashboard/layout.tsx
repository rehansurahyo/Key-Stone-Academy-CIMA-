import type { Metadata } from "next";
import { requirePortalPage } from "@/lib/dashboard/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";

export const metadata: Metadata = { title: "CIMA Dashboard | Keystone Academia", robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await requirePortalPage();
  if (profile.role === "student") return <RoleGuard role={profile.role} userId={user.id} allowedRoles={["student"]}>{children}</RoleGuard>;
  return <RoleGuard role={profile.role} userId={user.id} allowedRoles={["admin", "tutor"]}><DashboardShell profile={profile}>{children}</DashboardShell></RoleGuard>;
}
