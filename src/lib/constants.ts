import type { ShowStatus } from "./schema";

export const APP_NAME = "Watchtrail";

export const STATUSES: { value: ShowStatus; label: string }[] = [
  { value: "watching", label: "Watching" },
  { value: "paused", label: "On hold" },
  { value: "completed", label: "Finished" },
  { value: "dropped", label: "Dropped" },
];

export function statusLabel(status: ShowStatus): string {
  return STATUSES.find((s) => s.value === status)?.label ?? status;
}
