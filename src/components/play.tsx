"use client";

import { Check, Copy, FolderOpen, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { markEpisode } from "@/app/actions";
import { detectPlatform, vlcLinkFor } from "@/lib/play";
import { Button, buttonClass, iconButtonClass } from "./ui";
import { useActionToast } from "./use-action-toast";

type Mark = { showId: string; season: number; episode: number };

/** Hand a link to VLC the right way for this device. */
export function openInVlc(url: string, title: string, startSeconds?: number) {
  const platform = detectPlatform(navigator.userAgent);
  const href = vlcLinkFor(platform, url, title, startSeconds);
  if (platform === "desktop") {
    const a = document.createElement("a");
    a.href = href;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Playlist downloaded — open it to start VLC.", {
      description: "Tip: tick “Always open files of this type” in your browser's downloads so it starts by itself next time.",
      duration: 6000,
    });
  } else {
    window.location.href = href;
  }
}

export function PlayButton({
  url,
  title,
  mark,
  start,
  label = "Play in VLC",
  size = "md",
  variant = "primary",
  className,
}: {
  url: string;
  title: string;
  /** If set, the episode is logged as watched when Play is pressed. */
  mark?: Mark;
  /** Start this many seconds in (the caller subtracts any rewind). */
  start?: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { run, pending } = useActionToast();
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={pending}
      className={className}
      onClick={() => {
        // Open first: mobile browsers only allow app hand-off inside the click itself.
        openInVlc(url, title, start);
        if (mark) void run(() => markEpisode(mark.showId, mark.season, mark.episode, url));
      }}
    >
      <Play className="size-4 fill-current" />
      {label}
    </Button>
  );
}

export function CopyLinkButton({
  url,
  size = "md",
  className,
}: {
  url: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy link"
      className={iconButtonClass("secondary", size, className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // Clipboard API needs https; fall back to a prompt the user can copy from.
          window.prompt("Copy this link:", url);
          return;
        }
        setCopied(true);
        toast("Link copied — paste it into VLC (Ctrl+N).");
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      <span className="sr-only">Copy link</span>
    </button>
  );
}

export function FolderButton({
  url,
  label,
  size = "md",
  className,
}: {
  url: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Open the folder on the server"
      className={label ? buttonClass("secondary", size, className) : iconButtonClass("secondary", size, className)}
    >
      <FolderOpen className="size-4" />
      {label ? label : <span className="sr-only">Open folder</span>}
    </a>
  );
}
