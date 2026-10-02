"use client";

import { useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { importBackup, regenerateApiToken } from "@/app/actions";
import { Button, inputClass } from "./ui";
import { useActionToast } from "./use-action-toast";

export function TokenCard({ token }: { token: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const { run, pending } = useActionToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the token and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={shown ? token : "•".repeat(24)}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Your Watchtrail token"
        className={`${inputClass} font-mono text-[13px]`}
      />
      <div className="flex gap-2">
        <Button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide token" : "Show token"}>
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button type="button" onClick={copy} className="h-11 flex-1 sm:flex-none">
          {copied ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="h-11"
          onClick={() => {
            if (confirm("Make a new token? The old one stops working everywhere.")) void run(() => regenerateApiToken());
          }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          New
        </Button>
      </div>
    </div>
  );
}

export function ImportForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const { run, pending } = useActionToast();

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void run(() => importBackup(data), {
          onSuccess: () => {
            setName("");
            if (fileRef.current) fileRef.current.value = "";
          },
        });
      }}
    >
      <input
        ref={fileRef}
        type="file"
        name="file"
        accept="application/json,.json"
        onChange={(e) => setName(e.target.files?.[0]?.name ?? "")}
        className="block h-11 flex-1 cursor-pointer rounded-xl border border-line bg-surface-2 px-2 py-2 text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-1 file:text-ink"
      />
      <Button type="submit" variant="primary" disabled={pending || !name} className="h-11">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        Import
      </Button>
    </form>
  );
}
