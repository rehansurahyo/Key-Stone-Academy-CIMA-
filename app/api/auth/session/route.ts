import { apiError, requirePortalUser } from "@/lib/dashboard/auth";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { profile } = await requirePortalUser();
    return Response.json({ role: profile.role, userId: profile.id }, { headers });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
}
