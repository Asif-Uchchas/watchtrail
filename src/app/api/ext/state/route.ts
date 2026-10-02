import { userIdForToken, watchedAmong } from "@/lib/ext";

export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Browser helper: given file links on a page, return the ones already watched. */
export async function POST(request: Request) {
  const userId = await userIdForToken(request.headers.get("authorization"));
  if (!userId) return Response.json({ error: "Bad token" }, { status: 401, headers: CORS });
  const body = (await request.json().catch(() => null)) as { urls?: unknown } | null;
  const urls = Array.isArray(body?.urls) ? body.urls.filter((u): u is string => typeof u === "string").slice(0, 1000) : [];
  return Response.json({ watched: await watchedAmong(userId, urls) }, { headers: CORS });
}
