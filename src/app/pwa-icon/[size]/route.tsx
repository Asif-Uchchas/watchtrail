import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** PNG app icons for the PWA manifest and iOS home screen, drawn on demand. */
export async function GET(_request: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size: raw } = await ctx.params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });

  const s = size / 64; // the artwork is designed on a 64px grid
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          background: "#111114",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", left: 10 * s, top: 41 * s, width: 6 * s, height: 6 * s, borderRadius: 999, background: "rgba(245,181,68,0.35)" }} />
        <div style={{ position: "absolute", left: 17.6 * s, top: 36.6 * s, width: 6.8 * s, height: 6.8 * s, borderRadius: 999, background: "rgba(245,181,68,0.6)" }} />
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          <path d="M28 18.5v27a2 2 0 0 0 3 1.7l22-13.5a2 2 0 0 0 0-3.4L31 16.8a2 2 0 0 0-3 1.7Z" fill="#f5b544" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=604800, immutable" } },
  );
}
