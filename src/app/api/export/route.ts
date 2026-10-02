import { getUser } from "@/lib/auth";
import { exportLibrary } from "@/lib/backup";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const data = await exportLibrary(user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="watchtrail-backup-${stamp}.json"`,
    },
  });
}
