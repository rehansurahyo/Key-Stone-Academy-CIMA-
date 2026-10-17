"use client";
import { useEffect } from "react";
import { StudentSignIn } from "@/components/student-sign-in";
import { useStudentAuth } from "@/hooks/useStudentAuth";

export default function StudentLogin() {
  const auth = useStudentAuth();
  useEffect(() => {
    if (!auth.user || !auth.role || auth.loading) return;
    window.location.replace("/dashboard");
  }, [auth.user, auth.role, auth.loading]);
  return <StudentSignIn loading={auth.loading} error={auth.error} configured={auth.configured} onSignIn={auth.signIn} />;
}
