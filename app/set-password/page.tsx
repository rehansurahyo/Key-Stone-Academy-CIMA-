import type { Metadata } from "next";
import { EnrolledPasswordForm } from "@/components/enrolled-password-form";

export const metadata: Metadata = { title: "Set your student password | Keystone Academia", referrer: "no-referrer", robots: { index: false, follow: false } };
export default function SetPassword() { return <EnrolledPasswordForm />; }
