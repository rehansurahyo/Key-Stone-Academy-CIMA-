"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, BookOpen, ClipboardCheck, LayoutDashboard, LogOut, ShieldCheck, Users, UserRoundPlus } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/dashboard/types";
import { LearnWorldsLink } from "@/components/learnworlds-link";
import styles from "./dashboard-theme.module.css";

export function DashboardShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const navigation = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/exams", label: "Mock exams", icon: BookOpen },
    { href: "/dashboard/submissions", label: "Answer grading", icon: ClipboardCheck },
    ...(profile.role === "admin" ? [{ href: "/dashboard/leads", label: "Leads", icon: UserRoundPlus }] : []),
    ...(profile.role === "admin" ? [{ href: "/dashboard/users", label: "People & access", icon: Users }] : []),
  ];
  const currentPage = navigation.find(item => pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)))?.label || "Workspace";
  return (
    <SidebarProvider style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties} className={`${styles.shell} h-dvh min-h-0 overflow-hidden bg-[#F4F6F9]`}>
      <Sidebar className={`${styles.sidebar} border-r border-[#24415e]`}>
        <SidebarHeader className="gap-0 px-5 pb-5 pt-6"><Link href="/dashboard" aria-label="Keystone Academia dashboard" className="block overflow-hidden rounded-lg border border-white/10 bg-white p-2.5"><Image src="/keystone-cima-logo.png" alt="Keystone Academia — CIMA Global Learning Provider" width={1470} height={500} className="h-auto w-full" priority /></Link><div className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-300"><ShieldCheck className="size-3.5 text-blue-300" />{profile.role} workspace</div></SidebarHeader>
        <SidebarContent className="gap-3 px-3 py-4"><p className="px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Workspace</p><SidebarMenu className="gap-1.5">{navigation.map(item => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          return <SidebarMenuItem key={item.href}><SidebarMenuButton asChild isActive={active} className="h-11 gap-3 rounded-lg px-3 text-[13px] font-medium text-slate-300 transition-colors hover:bg-[#163858] hover:text-white data-[active=true]:bg-[#163858] data-[active=true]:text-white data-[active=true]:shadow-[inset_3px_0_0_#60a5fa]"><Link href={item.href} aria-current={active ? "page" : undefined}><item.icon className={`size-4 ${active ? "text-blue-300" : "text-slate-400"}`} /><span>{item.label}</span></Link></SidebarMenuButton></SidebarMenuItem>;
        })}</SidebarMenu></SidebarContent>
        <SidebarFooter className="gap-2 border-t border-white/10 p-4"><Link href="/" className="flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium text-slate-300 hover:bg-[#163858] hover:text-white">Student exam portal<ArrowUpRight className="size-4 text-slate-400" /></Link><button disabled={signingOut} onClick={async () => {
          setSigningOut(true); setError("");
          const { error: authError } = await createClient().auth.signOut();
          if (authError) { setError(authError.message); setSigningOut(false); return; }
          router.replace("/staff/login"); router.refresh();
        }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-300 hover:bg-[#163858] hover:text-white disabled:opacity-50"><LogOut className="size-4 text-slate-400" />{signingOut ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-[#F4F6F9]">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <SidebarTrigger className="rounded-md text-slate-500 hover:bg-slate-100 hover:text-[#0B2545]" />
            <div className="flex min-w-0 items-center gap-2 text-xs"><span className="hidden text-slate-500 sm:inline">CIMA assessment</span><span className="hidden text-slate-300 sm:inline">/</span><span className="truncate font-semibold text-slate-700">{currentPage}</span></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <nav aria-label="Staff portal navigation"><LearnWorldsLink /></nav>
            <div className="flex items-center gap-3 border-l border-slate-200 pl-2 sm:pl-5"><div className="grid size-9 place-items-center rounded-full border border-blue-100 bg-blue-50 text-sm font-semibold text-blue-700">{(profile.full_name || profile.email || "K").slice(0, 1).toUpperCase()}</div><div className="hidden sm:block"><p className="text-xs font-semibold text-[#0B2545]">{profile.full_name || profile.email}</p><p className="mt-0.5 text-[11px] capitalize text-slate-500">{profile.role}</p></div></div>
          </div>
        </header>
        <div className={`${styles.scrollArea} min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 lg:p-8`}><div className="mx-auto max-w-7xl">{children}</div></div>
      </SidebarInset>
    </SidebarProvider>
  );
}
