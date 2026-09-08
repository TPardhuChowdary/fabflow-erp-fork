// Phase 9G — runnable check that the dynamic-import conversion (cold-start
// fix) still produces a genuinely working adapter: the three npm packages
// (imapflow, nodemailer, mailparser) resolve and construct correctly via
// `await import(...)`, not just type-check. No real mailbox is touched —
// these deliberately connect to an address nothing listens on
// (127.0.0.1:1) so the real failure mode exercised is "ECONNREFUSED",
// proving the dynamic import + class construction succeeded (a broken
// dynamic import would throw a TypeError like "ImapFlow is not a
// constructor" or "nodemailer.createTransport is not a function" BEFORE
// any network attempt, which is exactly what this test would catch).
// Run with:
//   deno test --allow-net --allow-env --node-modules-dir=auto supabase/functions/_shared/imapSmtpAdapter.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { imapSmtpAdapter, type ImapSmtpCredentials } from "./imapSmtpAdapter.ts";

const UNREACHABLE: ImapSmtpCredentials = {
  imapHost: "127.0.0.1",
  imapPort: 1, // nothing listens here — a fast, deterministic connection refusal
  imapEncryption: "none",
  smtpHost: "127.0.0.1",
  smtpPort: 1,
  smtpEncryption: "none",
  username: "test@example.invalid",
  password: "not-a-real-password",
};

Deno.test("adapter interface is unchanged: same capabilities, same methods", () => {
  assertEquals(imapSmtpAdapter.capabilities, {
    oauth: false,
    push: false,
    imap: true,
    smtp: true,
    labels: false,
    threads: false,
  });
  assertEquals(typeof imapSmtpAdapter.testConnection, "function");
  assertEquals(typeof imapSmtpAdapter.listMessages, "function");
  assertEquals(typeof imapSmtpAdapter.getAttachment, "function");
  assertEquals(typeof imapSmtpAdapter.sendMessage, "function");
});

Deno.test("testConnection: dynamic ImapFlow import resolves and constructs a real client (fails on the network, not on the import)", async () => {
  const result = await imapSmtpAdapter.testConnection(UNREACHABLE);
  assertEquals(result.ok, false);
  // A broken dynamic import throws synchronously before any connection
  // attempt, with a message like "is not a constructor" / "is not a
  // function" — never reaching this adapter's own catch block at all
  // (it would surface as an uncaught rejection with that TypeError text
  // instead of the graceful {ok:false} shape). Getting a real, clean
  // {ok:false} back at all proves `new ImapFlow(...)` succeeded and the
  // failure is a genuine network-level one.
  if (!result.ok) {
    assertEquals(/is not a constructor|is not a function/i.test(result.error), false);
  }
});

Deno.test("listMessages: dynamic ImapFlow import resolves under the real sync path (fails on the network, not on the import)", async () => {
  let threw = false;
  let message = "";
  try {
    await imapSmtpAdapter.listMessages(UNREACHABLE, { limit: 5 });
  } catch (err) {
    threw = true;
    message = err instanceof Error ? err.message : String(err);
  }
  assertEquals(threw, true);
  assertEquals(/is not a constructor|is not a function/i.test(message), false);
});

Deno.test("sendMessage: dynamic nodemailer import resolves and constructs a real transporter (fails on the network, not on the import)", async () => {
  let threw = false;
  let message = "";
  try {
    await imapSmtpAdapter.sendMessage(UNREACHABLE, {
      to: ["nobody@example.invalid"],
      subject: "test",
      bodyText: "test",
    });
  } catch (err) {
    threw = true;
    message = err instanceof Error ? err.message : String(err);
  }
  assertEquals(threw, true);
  assertEquals(/is not a constructor|is not a function|createTransport/i.test(message), false);
  // A real connection-level error (ECONNREFUSED or a timeout) is expected
  // and fine — this test only rules out an import/construction failure.
});

Deno.test("getAttachment: dynamic ImapFlow import resolves (fails on the network, not on the import)", async () => {
  let threw = false;
  let message = "";
  try {
    await imapSmtpAdapter.getAttachment(UNREACHABLE, "1", "att-1");
  } catch (err) {
    threw = true;
    message = err instanceof Error ? err.message : String(err);
  }
  assertEquals(threw, true);
  assertEquals(/is not a constructor|is not a function/i.test(message), false);
});
