import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 font-display text-5xl">Lost the plot</h1>
      <p className="mt-3 max-w-sm text-muted">That page doesn&apos;t exist, or the show was deleted.</p>
      <Link href="/" className={buttonClass("primary", "lg", "mt-8")}>
        Back to your shows
      </Link>
    </main>
  );
}
