// Deadline-priority rule — THE single reusable definition of "how urgent
// is this deadline" and "in what order should deadline-driven items sort",
// used by both the Production page (active queue + per-project cards) and
// the Projects list ("Deadline" sort option). Per explicit instruction:
// one rule, not duplicated slightly-differently in each component.
//
// The field this operates on is `Project.customerCommittedDeliveryDate`
// (see types.ts) — the customer's committed delivery date, distinct from
// `targetCompletionDate` (the internal working target). That distinction
// already exists in the codebase's own comments; this module does not
// change or merge those two concepts.

export type DeadlineCategory = "overdue" | "due_today" | "upcoming" | "none";

export interface DeadlineInfo {
  category: DeadlineCategory;
  /** Calendar-day offset from today: negative = days overdue, 0 = today,
   * positive = days until due. Undefined when there is no valid deadline -
   * callers must never fabricate one. */
  daysFromToday?: number;
  /** The original YYYY-MM-DD deadline string, echoed back unchanged for
   * display. Undefined when missing/invalid. */
  date?: string;
}

// This codebase's universal date-string convention (see types.ts's note
// on plannedStartDate/poDate/purchaseDate/etc.) is a YYYY-MM-DD string.
// Parsed as a LOCAL calendar day (not UTC) so "is this today" matches the
// day the user actually sees on their own clock. Missing or malformed
// input returns null rather than guessing - never fabricate a deadline.
function parseDeadlineDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(year, month - 1, day);
  // Reject e.g. "2026-02-31" silently rolling over into March.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Classifies one deadline relative to `today` (defaults to the real
 * current date). Pass an explicit `today` only for deterministic tests. */
export function getDeadlineInfo(
  deadline: string | null | undefined,
  today: Date = startOfToday(),
): DeadlineInfo {
  const parsed = parseDeadlineDate(deadline);
  if (!parsed) return { category: "none" };
  const daysFromToday = Math.round(
    (parsed.getTime() - today.getTime()) / MS_PER_DAY,
  );
  const date = deadline ?? undefined;
  if (daysFromToday < 0) return { category: "overdue", daysFromToday, date };
  if (daysFromToday === 0)
    return { category: "due_today", daysFromToday, date };
  return { category: "upcoming", daysFromToday, date };
}

const CATEGORY_RANK: Record<DeadlineCategory, number> = {
  overdue: 0,
  due_today: 1,
  upcoming: 2,
  none: 3,
};

/**
 * The one reusable deadline-priority comparator. Sorts ascending by:
 *   1. category (overdue, then due today, then upcoming, then no deadline)
 *   2. within overdue/upcoming, the deadline date itself, ascending — this
 *      naturally yields "oldest overdue first" (most negative days-from-
 *      today) and "nearest upcoming first" with the same one rule, since
 *      both categories already sit on opposite sides of the same ascending
 *      day-offset axis.
 *   3. a caller-supplied stable tiebreaker (e.g. createdAt) for exact ties
 *      (same-day deadlines, or two items with no deadline) — never random.
 */
export function compareByDeadlinePriority(
  a: { deadline: string | null | undefined; tiebreaker: number },
  b: { deadline: string | null | undefined; tiebreaker: number },
  today: Date = startOfToday(),
): number {
  const infoA = getDeadlineInfo(a.deadline, today);
  const infoB = getDeadlineInfo(b.deadline, today);
  const rankDiff =
    CATEGORY_RANK[infoA.category] - CATEGORY_RANK[infoB.category];
  if (rankDiff !== 0) return rankDiff;
  if (
    infoA.daysFromToday !== undefined &&
    infoB.daysFromToday !== undefined &&
    infoA.daysFromToday !== infoB.daysFromToday
  ) {
    return infoA.daysFromToday - infoB.daysFromToday;
  }
  return a.tiebreaker - b.tiebreaker;
}

/** "12 Sep 2026" — the exact date, always shown regardless of category
 * (relative text below is supplementary, never a replacement). */
export function formatDeadlineDate(deadline: string): string {
  const parsed = parseDeadlineDate(deadline);
  if (!parsed) return deadline;
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Short supplementary status text: "3 days overdue", "Due Today",
 * "Due in 4 days", or "No deadline set". */
export function formatDeadlineRelative(info: DeadlineInfo): string {
  if (info.category === "none" || info.daysFromToday === undefined) {
    return "No deadline set";
  }
  if (info.category === "due_today") return "Due Today";
  if (info.category === "overdue") {
    const days = -info.daysFromToday;
    return `${days} day${days === 1 ? "" : "s"} overdue`;
  }
  return `Due in ${info.daysFromToday} day${info.daysFromToday === 1 ? "" : "s"}`;
}
