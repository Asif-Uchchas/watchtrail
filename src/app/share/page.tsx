import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { extractUrl } from "@/lib/parse";
import { AddLinkBar } from "@/components/add-link-bar";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Add from share" };

/**
 * Landing page for Android's share sheet (see share_target in manifest.ts).
 * Apps put the link in `url`, `text` or `title` depending on who shares it.
 */
export default async function SharePage(props: PageProps<"/share">) {
  const sp = await props.searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const raw = [pick(sp.url), pick(sp.text), pick(sp.title)].join(" ");
  const link = extractUrl(raw) ?? "";

  if (!(await getUser())) {
    // Keep the shared link through sign-in.
    const back = link ? `/share?url=${encodeURIComponent(link)}` : "/share";
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-8 sm:py-14">
      <Link href="/" aria-label="Watchtrail home" className="inline-block">
        <Logo />
      </Link>
      <div>
        <h1 className="font-display text-5xl leading-none tracking-tight">Shared link</h1>
        <p className="mt-2 text-muted">
          {link ? "Check what Watchtrail found, then save it." : "No link came through. Paste one below."}
        </p>
      </div>
      <AddLinkBar defaultValue={link} autoFocus={!link} goToResult />
      <Link href="/" className="inline-block text-sm text-muted hover:text-ink">
        ← Back to your shows
      </Link>
    </main>
  );
}
