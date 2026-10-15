import { revalidatePath } from "next/cache";
import { learnFromListing, userIdForToken } from "@/lib/ext";

export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Browser helper: the real file links on a folder page. Body: { urls: string[] } */
export async function POST(request: Request) {
  const userId = await userIdForToken(request.headers.get("authorization"));
  if (!userId) return Response.json({ ok: false, message: "Bad token" }, { status: 401, headers: CORS });
  const body = (await request.json().catch(() => null)) as { urls?: unknown } | null;
  if (!Array.isArray(body?.urls)) return Response.json({ ok: false, message: "Missing urls" }, { status: 400, headers: CORS });
  const urls = body.urls.filter((u): u is string => typeof u === "string").slice(0, 400);
  const learned = await learnFromListing(userId, urls);
  if (learned > 0) revalidatePath("/", "layout");
  return Response.json({ ok: true, learned }, { headers: CORS });
}
