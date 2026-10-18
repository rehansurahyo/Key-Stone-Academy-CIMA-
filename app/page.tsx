import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const headersList = await headers();
  const host = (
    headersList.get("x-forwarded-host") ||
    headersList.get("host") ||
    ""
  ).toLowerCase().split(":")[0];

  if (host.startsWith("mocksadmin.") || host.includes("mocksadmin")) {
    redirect("/staff/login");
  }

  redirect("/student/login");
}

