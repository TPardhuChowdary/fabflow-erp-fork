// Design Lab — per-concept login archetype + copy assignments.
// Keyed by each concept's own id (v1 style-01..06, v2 a1..a7/b1..b7).
// Archetype reuse is intentional and disclosed (see the final report) —
// it maps each concept to the login structure that matches its ALREADY
// established personality, not a random shuffle. Copy is written to
// sound like a real manufacturing ERP, not generic SaaS placeholder text.
import type { LoginAssignment } from "./loginTheme";

export const loginAssignments: Record<string, LoginAssignment> = {
  // ── v1 — the original 6 styles ──
  "style-01": {
    archetype: "split-panel",
    headline: "Good to see you again.",
    subhead: "Sign in to check today's production schedule.",
  },
  "style-02": {
    archetype: "centered-card-light",
    headline: "Sign in",
    subhead: "One accent, no noise — just get to work.",
  },
  "style-03": {
    archetype: "split-panel",
    headline: "Welcome back to the floor.",
    subhead: "Sign in to your FabFlow workspace.",
  },
  "style-04": {
    archetype: "minimal-huge-type",
    headline: "Sign in.",
    subhead: "",
  },
  "style-05": {
    archetype: "command-terminal",
    headline: "AUTHENTICATE",
    subhead: "FABFLOW_ERP // SECURE SHELL",
  },
  "style-06": {
    archetype: "sketchy-playful",
    headline: "Hey, welcome back!",
    subhead: "Let's get you into the shop.",
  },

  // ── v2 — SET A (practical) ──
  a1: {
    archetype: "centered-card-light",
    headline: "Welcome back.",
    subhead: "Sign in to continue where you left off.",
  },
  a2: {
    archetype: "command-terminal",
    headline: "SIGN IN",
    subhead: "fabflow@ops:~$ authenticate --user",
  },
  a3: {
    archetype: "centered-card-dark",
    headline: "Sign in",
    subhead: "⌘K works right after login, too.",
  },
  a4: {
    archetype: "hero-narrative",
    headline: "Eleven projects are waiting for you.",
    subhead: "Sign in to pick up the story where it left off.",
  },
  a5: {
    archetype: "conversational",
    headline: "Welcome back — I've been keeping an eye on things.",
    subhead: "Sign in and I'll tell you what needs attention.",
  },
  a6: {
    archetype: "factory-floor",
    headline: "SIGN IN",
    subhead: "Shop floor access",
  },
  a7: {
    archetype: "split-panel",
    headline: "Your workspace, remembered.",
    subhead: "Sign in to your personalized FabFlow.",
  },

  // ── v2 — SET B (radical) ──
  b1: {
    archetype: "centered-card-dark",
    headline: "Enter the workspace.",
    subhead: "Sign in to open your map of the business.",
  },
  b2: {
    archetype: "centered-card-light",
    headline: "All clear.",
    subhead: "Sign in — nothing urgent is waiting, but let's check.",
  },
  b3: {
    archetype: "conversational",
    headline: "Hi — who's this?",
    subhead: "Sign in and just tell me what you need.",
  },
  b4: {
    archetype: "split-panel",
    headline: "Pick up the thread.",
    subhead: "Sign in to your active project conversations.",
  },
  b5: {
    archetype: "hero-narrative",
    headline: "Now. And what's coming next.",
    subhead: "Sign in to see your timeline.",
  },
  b6: {
    archetype: "centered-card-light",
    headline: "3 decisions waiting.",
    subhead: "Sign in to clear your queue.",
  },
  b7: {
    archetype: "factory-floor",
    headline: "SIGN IN",
    subhead: "Live factory access",
  },
};
