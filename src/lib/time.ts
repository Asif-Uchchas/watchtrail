/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Start a little before where the user stopped, to catch up on context. */
export const REWIND_SECONDS = 5;
export const resumeStart = (seconds: number | null | undefined) =>
  seconds && seconds > 0 ? Math.max(0, seconds - REWIND_SECONDS) : undefined;
