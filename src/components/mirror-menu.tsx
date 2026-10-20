"use client";

import { PlayButton } from "./play";

/** Same file on another server of the same site, for when the current server will not open it. */
export function MirrorMenu({ url, title, hosts, start }: { url: string; title: string; hosts: string[]; start?: number }) {
  if (!hosts.length) return null;
  const swap = (host: string) => {
    const u = new URL(url);
    u.hostname = host;
    return u.toString();
  };
  return (
    <details className="mt-3 text-[13px] text-muted">
      <summary className="cursor-pointer select-none transition hover:text-ink">Won&apos;t open? Try another server</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hosts.map((host) => (
          <PlayButton key={host} url={swap(host)} title={title} start={start} label={host.split(".")[0]} variant="secondary" size="sm" />
        ))}
        <span className="text-faint">Same file path on a different server. It only works if that server has the file.</span>
      </div>
    </details>
  );
}