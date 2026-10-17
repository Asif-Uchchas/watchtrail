import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getQueue } from "@/lib/library";
import { formatEpisode } from "@/lib/parse";

/**
 * The next few episodes of a show as one .m3u playlist, so VLC plays them back
 * to back without going back to the browser between episodes.
 */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const showId = request.nextUrl.searchParams.get("show") ?? "";
  const count = Math.min(Math.max(Number(request.nextUrl.searchParams.get("n")) || 5, 1), 300);
  const queue = await getQueue(user.id, showId, count);
  if (!queue) return NextResponse.json({ error: "Show not found." }, { status: 404 });
  if (!queue.items.length) {
    const why = queue.show.nextSeason === null
      ? "Watchtrail doesn't know the next episode yet (no episode list from TMDB). Log an episode or use Set your place first."
      : "Watchtrail has no link for the next episode. Open that season's folder on the FTP site with the browser helper on, or paste an episode link from it.";
    return NextResponse.json({ error: `Nothing to queue. ${why}` }, { status: 404 });
  }

  const lines = ["#EXTM3U"];
  queue.items.forEach((it, i) => {
    const label = `${queue.show.title} ${formatEpisode(it.season, it.episode)}${it.title ? ` - ${it.title}` : ""}`.replace(/[\r\n]+/g, " ");
    lines.push(`#EXTINF:-1,${label}`);
    const start = i === 0 && queue.show.resumeSeconds ? Math.max(0, queue.show.resumeSeconds - 5) : 0;
    if (start > 0) lines.push(`#EXTVLCOPT:start-time=${start}`);
    lines.push(it.url);
  });
  const fileName = queue.show.title.replace(/[^a-z0-9 ._-]+/gi, "").trim().slice(0, 60) || "queue";
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "content-type": "audio/x-mpegurl; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName} queue.m3u"`,
      "cache-control": "no-store",
    },
  });
}
