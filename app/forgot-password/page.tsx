import { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password | Keystone Academia",
  description: "Request a password reset link for Keystone Academia mock portal.",
};

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-[#eef2f6] px-4 font-[Arial,'Segoe_UI',sans-serif]">
          <div className="h-64 w-full max-w-[430px] border border-[#aeb9c4] bg-white animate-pulse" />
        </main>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
