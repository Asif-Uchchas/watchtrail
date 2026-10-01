import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";

/**
 * Returns a one-item .m3u playlist for a media URL. On desktop, opening the
 * downloaded file launches VLC (it registers itself for .m3u on install).
 */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const media = request.nextUrl.searchParams.get("u") ?? "";
  const title = (request.nextUrl.searchParams.get("t") ?? "Watchtrail").slice(0, 120);

  let url: URL;
  try {
    url = new URL(media);
  } catch {
    return NextResponse.json({ error: "Invalid media link." }, { status: 400 });
  }
  if (!/^(https?|ftp):$/.test(url.protocol)) {
    return NextResponse.json({ error: "Only http, https and ftp links can be played." }, { status: 400 });
  }

  const safeTitle = title.replace(/[\r\n]+/g, " ");
  const fileName = safeTitle.replace(/[^a-z0-9 ._-]+/gi, "").trim().slice(0, 80) || "watchtrail";
  const body = `#EXTM3U\n#EXTINF:-1,${safeTitle}\n${url.toString()}\n`;

  return new NextResponse(body, {
    headers: {
      "content-type": "audio/x-mpegurl; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}.m3u"`,
      "cache-control": "no-store",
    },
  });
}
