"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import { undo, type ActionResult } from "@/app/actions";

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
