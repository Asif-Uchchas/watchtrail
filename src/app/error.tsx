"use client";

import { buttonClass } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const config = /AUTH_SECRET/.test(error.message);
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-mono text-sm text-danger">Error</p>
      <h1 className="mt-2 font-display text-5xl">Something broke</h1>
      <p className="mt-3 max-w-md text-muted">
        {config
          ? "The server isn't configured yet: AUTH_SECRET is missing. See the README."
          : "That didn't work. It's probably temporary, so give it another go."}
      </p>
      <button type="button" onClick={reset} className={buttonClass("primary", "lg", "mt-8")}>
        Try again
      </button>
    </main>
  );
}
