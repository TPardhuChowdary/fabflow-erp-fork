import type { JobCard } from "@/types";
// Job Card live timer display — see chat, database/20260906050000.
//
// Computes "current active working duration" purely client-side from two
// authoritative, database-persisted anchors:
//   activeSeconds        — accumulated time from all CLOSED run segments
//   currentRunStartedAt  — when the currently-open run segment began
//                           (only set while status === "InProgress")
//
// current active duration = activeSeconds + (now() - currentRunStartedAt)
// while running, or just activeSeconds while paused/completed/not started.
//
// Ticks a local re-render every second while running so the displayed
// value advances smoothly, but never persists anything per-tick and
// never accumulates local drift — each tick recomputes fresh from the
// same two anchors, so a page refresh, a tab reopen, or another device
// looking at the same job card all land on the same value.
import { useEffect, useState } from "react";

export function formatJobCardDuration(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** "6 Sep 2026, 4:35 pm" — same en-IN/short-month convention as
 * lib/deadlinePriority.ts's formatDeadlineDate, extended with time. For a
 * Job Card's persisted, server-set startTime/endTime only — never a
 * substitute for the running-duration display above, and never derived
 * from a client clock. Undefined/missing (not started yet, or not
 * completed yet) renders as "—"; callers needing "Not started yet" /
 * "Not completed yet" copy supply that text themselves. */
export function formatJobCardTimestamp(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** The pure "current active duration" arithmetic, extracted so a one-off,
 * non-ticking snapshot (e.g. the printable Job Card, rendered once into a
 * print window) can reuse the exact same calculation the live-ticking
 * hook below uses, rather than a second, parallel copy of it. */
export function getJobCardActiveSeconds(
  jobCard: Pick<JobCard, "status" | "activeSeconds" | "currentRunStartedAt">,
  nowMs: number = Date.now(),
): number {
  const isRunning =
    jobCard.status === "InProgress" && !!jobCard.currentRunStartedAt;
  const runElapsed =
    isRunning && jobCard.currentRunStartedAt
      ? Math.max(
          0,
          Math.floor(
            (nowMs - new Date(jobCard.currentRunStartedAt).getTime()) / 1000,
          ),
        )
      : 0;
  return (jobCard.activeSeconds || 0) + runElapsed;
}

export function useJobCardTimer(
  jobCard: Pick<JobCard, "status" | "activeSeconds" | "currentRunStartedAt">,
): { seconds: number; formatted: string; isRunning: boolean } {
  const isRunning =
    jobCard.status === "InProgress" && !!jobCard.currentRunStartedAt;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const seconds = getJobCardActiveSeconds(jobCard, nowMs);

  return { seconds, formatted: formatJobCardDuration(seconds), isRunning };
}
