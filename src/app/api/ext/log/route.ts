import { revalidatePath } from "next/cache";
import { logUrl, userIdForToken } from "@/lib/ext";

export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Browser helper: mark one file link as watched. */
export async function POST(request: Request) {
  const userId = await userIdForToken(request.headers.get("authorization"));
  if (!userId) return Response.json({ ok: false, message: "Bad token" }, { status: 401, headers: CORS });
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  if (typeof body?.url !== "string") return Response.json({ ok: false, message: "Missing url" }, { status: 400, headers: CORS });
  const result = await logUrl(userId, body.url);
  if (result.ok) revalidatePath("/", "layout");
  return Response.json(result, { status: result.ok ? 200 : 422, headers: CORS });
}
