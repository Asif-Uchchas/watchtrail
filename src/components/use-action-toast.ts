"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import { markThrough, undo, type ActionResult } from "@/app/actions";

/**
 * Runs a server action and reports the result as a toast, with an Undo button
 * when the action returned one.
 */
export function useActionToast() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (fn: () => Promise<ActionResult>, opts?: { onSuccess?: (r: Extract<ActionResult, { ok: true }>) => void }) =>
      new Promise<ActionResult | null>((resolve) => {
        startTransition(async () => {
          try {
            const result = await fn();
            if (result.ok) {
              const undoInfo = result.undo;
              toast.success(result.message, {
                action: undoInfo
                  ? {
                      label: "Undo",
                      onClick: () => {
                        void undo(undoInfo.kind, undoInfo.id).then((r) => {
                          if (r.ok) toast("Undone.");
                          router.refresh();
                        });
                      },
                    }
                  : undefined,
              });
              opts?.onSuccess?.(result);
              const offer = result.offer;
              if (offer) {
                // Started a show midway: offer to fill in everything before in one tap.
                toast(offer.label, {
                  description: "Marks all earlier episodes as watched (uses TMDB's episode counts).",
                  duration: 12000,
                  action: {
                    label: "Mark them",
                    onClick: () => {
                      void markThrough(offer.showId, offer.season, offer.episode).then((r) => {
                        if (r.ok) toast.success(r.message);
                        else toast.error(r.error);
                        router.refresh();
                      });
                    },
                  },
                });
              }
            } else {
              toast.error(result.error);
            }
            resolve(result);
          } catch (err) {
            // redirect() inside an action throws on purpose; let Next handle it.
            if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
              throw err;
            }
            toast.error("Something went wrong. Check your connection and try again.");
            resolve(null);
          }
        });
      }),
    [router],
  );

  return { run, pending };
}
