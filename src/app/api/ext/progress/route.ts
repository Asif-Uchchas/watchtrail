import { revalidatePath } from "next/cache";
import { userIdForToken } from "@/lib/ext";
import { reportProgress } from "@/lib/library";

export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** PC bridge: where VLC currently is in a file. Body: { url, seconds, length? } */
export async function POST(request: Request) {
  const userId = await userIdForToken(request.headers.get("authorization"));
  if (!userId) return Response.json({ ok: false, message: "Bad token" }, { status: 401, headers: CORS });
  const body = (await request.json().catch(() => null)) as { url?: unknown; seconds?: unknown; length?: unknown } | null;
  if (typeof body?.url !== "string" || typeof body.seconds !== "number" || !Number.isFinite(body.seconds)) {
    return Response.json({ ok: false, message: "Need url and seconds" }, { status: 400, headers: CORS });
  }
  const length = typeof body.length === "number" && body.length > 0 ? body.length : null;
  const hit = await reportProgress(userId, { url: body.url, seconds: Math.max(0, body.seconds), length });
  if (hit) revalidatePath("/", "layout");
  return Response.json({ ok: Boolean(hit), match: hit }, { headers: CORS });
}
