import { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password | Keystone Academia",
  description: "Set a new password for your Keystone Academia account.",
};

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-[#eef2f6] px-4 font-[Arial,'Segoe_UI',sans-serif]">
          <div className="h-64 w-full max-w-[430px] border border-[#aeb9c4] bg-white animate-pulse" />
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
