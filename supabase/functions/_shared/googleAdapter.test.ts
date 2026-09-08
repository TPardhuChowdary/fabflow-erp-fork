// Phase 9E — runnable check for extractGmailContent (googleAdapter.ts),
// the fix for the previously-disclosed gap where listMessages() never
// fetched a message body at all. Run with:
//   deno test supabase/functions/_shared/googleAdapter.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractGmailContent, type GmailPart } from "./googleAdapter.ts";

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_");
}

Deno.test("a simple non-multipart message has its body read directly off the root part", () => {
  const payload: GmailPart = {
    mimeType: "text/plain",
    body: { data: b64url("hello world") },
  };
  const { bodyText, bodyHtml, attachments } = extractGmailContent(payload);
  assertEquals(bodyText, "hello world");
  assertEquals(bodyHtml, undefined);
  assertEquals(attachments.length, 0);
});

Deno.test("a multipart/alternative message yields both text and html bodies", () => {
  const payload: GmailPart = {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: b64url("plain body") } },
      { mimeType: "text/html", body: { data: b64url("<p>html body</p>") } },
    ],
  };
  const { bodyText, bodyHtml } = extractGmailContent(payload);
  assertEquals(bodyText, "plain body");
  assertEquals(bodyHtml, "<p>html body</p>");
});

Deno.test("a real attachment (filename + attachmentId) is collected as metadata only, never inlined bytes", () => {
  const payload: GmailPart = {
    mimeType: "multipart/mixed",
    parts: [
      { mimeType: "text/plain", body: { data: b64url("see attached") } },
      {
        mimeType: "application/pdf",
        filename: "quote.pdf",
        body: { attachmentId: "att-123", size: 4096 },
      },
    ],
  };
  const { bodyText, attachments } = extractGmailContent(payload);
  assertEquals(bodyText, "see attached");
  assertEquals(attachments, [
    { id: "att-123", filename: "quote.pdf", mimeType: "application/pdf", sizeBytes: 4096 },
  ]);
});

Deno.test("a fully-inlined part with a filename but no attachmentId is skipped, not fabricated", () => {
  const payload: GmailPart = {
    mimeType: "multipart/mixed",
    parts: [
      { mimeType: "text/plain", body: { data: b64url("body") } },
      { mimeType: "image/png", filename: "inline.png", body: { data: b64url("fakebytes") } },
    ],
  };
  const { attachments } = extractGmailContent(payload);
  assertEquals(attachments.length, 0);
});

Deno.test("only the FIRST text/plain and first text/html parts are kept when nested deeply", () => {
  const payload: GmailPart = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64url("first plain") } },
          { mimeType: "text/html", body: { data: b64url("<p>first html</p>") } },
        ],
      },
      { mimeType: "text/plain", body: { data: b64url("second plain, ignored") } },
    ],
  };
  const { bodyText, bodyHtml } = extractGmailContent(payload);
  assertEquals(bodyText, "first plain");
  assertEquals(bodyHtml, "<p>first html</p>");
});

Deno.test("an undefined payload (malformed message) yields empty content, not a crash", () => {
  const { bodyText, bodyHtml, attachments } = extractGmailContent(undefined);
  assertEquals(bodyText, undefined);
  assertEquals(bodyHtml, undefined);
  assertEquals(attachments, []);
});
