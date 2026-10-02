import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Download, LifeBuoy, PlugZap } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getOrCreateToken } from "@/lib/ext";
import { ImportForm, TokenCard } from "@/components/settings-forms";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const token = await getOrCreateToken(user.id);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const scriptUrl = `${proto}://${host}/api/ext/watchtrail.user.js`;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <h1 className="font-display text-5xl leading-none tracking-tight">Settings</h1>
        <p className="mt-2 text-muted">
          Signed in as {user.name} · {user.email}
        </p>
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <PlugZap className="size-5 text-accent" /> Browser helper for FTP listings
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            A small userscript that puts a <b className="text-ink">✓ watched</b> tag next to every video you&apos;ve seen,
            and a <b className="text-ink">+ log</b> button on the rest, right inside the Circle FTP file listing. No more
            copy-paste to log what you just watched.
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted marker:text-faint">
          <li>
            Install <b className="text-ink">Tampermonkey</b> (or Violentmonkey) in your browser. On Android use Kiwi
            Browser or Firefox.
          </li>
          <li>
            <a href={scriptUrl} className="text-accent underline underline-offset-4">
              Open the helper script
            </a>{" "}
            and press Install.
          </li>
          <li>
            Open any Circle FTP folder. The little <b className="text-ink">Watchtrail</b> pill at the bottom asks for your
            token. Paste it from below.
          </li>
        </ol>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Your token</p>
          <TokenCard token={token} />
          <p className="mt-2 text-xs text-faint">
            Keep it private: anyone with this token can log watches on your account. Use New to replace it.
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <Download className="size-5 text-accent" /> Backup
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Download everything you&apos;ve tracked as one file. Importing a backup adds to your library and never deletes or
            overwrites anything.
          </p>
        </div>
        <a href="/api/export" className={buttonClass("secondary", "md")}>
          <Download className="size-4" /> Download backup
        </a>
        <ImportForm />
      </section>

      <Link href="/help" className={buttonClass("ghost", "md")}>
        <LifeBuoy className="size-4" /> Help &amp; how it works
      </Link>
    </div>
  );
}
