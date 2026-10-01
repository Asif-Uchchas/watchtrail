import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Laptop, Link2, Smartphone, Wifi } from "lucide-react";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section>
        <h1 className="font-display text-5xl leading-none tracking-tight">How it works</h1>
        <p className="mt-3 text-lg text-muted">
          Watchtrail remembers what you watched from FTP servers like Circle FTP. It stores links, never video, so
          your phone and PC always agree on where you are.
        </p>
      </section>

      <Card icon={<Link2 className="size-5" />} title="Log what you watch">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            On the FTP site, right-click an episode and choose <b>Copy link address</b> (long-press on a phone).
          </li>
          <li>
            Paste it into the box on the home screen. Watchtrail reads the show, season and episode from the link
            and shows a preview.
          </li>
          <li>
            Press <b>Mark watched</b>. Next time, the show has a <b>Play next</b> button that opens the following
            episode in VLC and logs it in one tap.
          </li>
        </ol>
        <p className="mt-3 text-muted">
          Movie links work the same way. Show folder links add the show without logging an episode.
        </p>
      </Card>

      <Card icon={<Smartphone className="size-5" />} title="On your Android phone">
        <ul className="list-disc space-y-2 pl-5">
          <li>Install VLC from the Play Store if you haven&apos;t.</li>
          <li>
            Open Watchtrail in Chrome, tap <b>⋮ → Add to Home screen → Install</b>. It then opens like an app.
          </li>
          <li>
            Once installed (on an https address), Watchtrail appears in Android&apos;s <b>Share</b> menu: share an
            episode link from Chrome straight to it.
          </li>
          <li>
            <b>Play</b> hands the link to VLC directly.
          </li>
        </ul>
      </Card>

      <Card icon={<Laptop className="size-5" />} title="On your PC">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Play</b> downloads a tiny <code className="rounded bg-surface-3 px-1 font-mono text-[13px]">.m3u</code>{" "}
            playlist. Open it and VLC starts streaming.
          </li>
          <li>
            In Chrome&apos;s downloads, click the arrow next to the file and choose <b>Always open files of this
            type</b>. After that, Play starts VLC on its own.
          </li>
          <li>
            Prefer pasting? The copy button puts the link on your clipboard for VLC&apos;s <b>Media → Open Network
            Stream</b> (Ctrl+N).
          </li>
        </ul>
      </Card>

      <Card icon={<Wifi className="size-5" />} title="Good to know">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            BDIX servers like Circle only stream on your ISP&apos;s network. Watchtrail itself works anywhere, so you can
            check your progress on mobile data and play once you&apos;re home.
          </li>
          <li>
            <b>Play next</b> is worked out from the last link (episode 5 → 6). At the end of a season that file
            won&apos;t exist; use the folder button and paste the first episode of the next season.
          </li>
          <li>
            Already halfway through a show? Open it and use <b>Set your place</b> to log the last episode you
            finished.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface/60 p-6 text-[15px] leading-relaxed sm:p-7">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">{icon}</span>
        <h2 className="font-display text-3xl leading-none">{title}</h2>
      </div>
      {children}
    </section>
  );
}
