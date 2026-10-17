import { requireStaffPage } from "@/lib/dashboard/auth";
import { PageHeading } from "@/components/dashboard/shared";
import { MockUploadForm } from "@/components/dashboard/mock-upload-form";

export default async function NewMock() {
  await requireStaffPage();
  return <><PageHeading title="Upload a mock exam" description="Add question requirements, independent timers and reference PDFs." /><MockUploadForm /></>;
}
