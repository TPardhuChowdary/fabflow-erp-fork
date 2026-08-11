// Phase 17A — infrastructure only. This is the ONE centralized place a
// Supabase client is created for the whole frontend. Do not instantiate
// `createClient()` anywhere else — import `supabase` (or `getSupabase()`)
// from here instead.
//
// This module intentionally contains NO application-specific CRUD
// functions (no project/stage/inventory queries) — those belong to a
// later phase, once this module is proven to connect at all.
//
// Credentials: only the browser-safe project URL and anon/publishable
// key belong here, sourced from env vars exposed via vite.config.js's
// `environment(["SUPABASE_URL", "SUPABASE_ANON_KEY"])` plugin entry
// (mirrors the existing CANISTER_/DFX_/II_URL/STORAGE_GATEWAY_URL
// pattern already used elsewhere in this app). The anon key is meant to
// be public — it is safe by design as long as Supabase Row Level
// Security (RLS) is enabled on every table, which Phase 16 already does.
//
// NEVER import or reference, in this file or anywhere reachable from the
// frontend bundle: a database password, a full Postgres connection
// string, or a service_role key. Any of those would grant a website
// visitor superuser access to the database.

import { type SupabaseClient, createClient } from "@supabase/supabase-js";

// vite-plugin-environment replaces these at build time for any name
// listed in vite.config.js's `environment([...])` call. If the .env
// value is empty, the replaced literal is an empty string, not
// `undefined` — checked explicitly below rather than relying on falsy
// coercion, so a genuinely missing config fails loudly instead of
// silently constructing a client pointed at "".
declare const process: { env: Record<string, string | undefined> };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Returns the shared Supabase client, or throws a clear, specific error if
 * SUPABASE_URL / SUPABASE_ANON_KEY were not configured. Call this instead
 * of touching `client` directly, so every call site fails the same way
 * (a caught, readable error) rather than a null-reference crash deep in
 * some unrelated code path.
 *
 * Deliberately does NOT fall back to any default, dummy, or derived URL —
 * per this phase's explicit rule, nothing here is fabricated.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY " +
        "in src/frontend/.env (from the Supabase dashboard's Project " +
        "Settings > API page - the Project URL and anon/public key only) " +
        "and restart the dev server.",
    );
  }
  return client;
}

// Exported for call sites that want to check configuration before
// attempting a call (e.g. to show a UI state) without triggering the
// thrown error above.
export const supabase = client;
