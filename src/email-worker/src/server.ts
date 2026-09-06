// Phase 1 Option B experimental worker — HTTP server.
//
// A narrowly-scoped internal API, not a public IMAP proxy: every route
// except /health requires a valid shared-secret bearer token. The worker
// has no database access, no encryption key, and never persists anything
// it's handed — see imapCore.ts's own header for the experiment this
// exists to run.
//
// Deliberately built on Node's built-in `http` module rather than a
// framework (Express, Fastify, ...) — three routes and one auth check
// don't need one, and this keeps the dependency surface to exactly what
// the actual IMAP work requires (imapflow, mailparser).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { testConnection, listMessages, getAttachment } from "./imapCore.js";
import type { ImapSmtpCredentials, ListMessagesOptions } from "./types.js";

const PORT = Number(process.env.PORT ?? 8787);
const SHARED_SECRET = process.env.IMAP_WORKER_SHARED_SECRET;

if (!SHARED_SECRET) {
  // Fail loudly at startup rather than silently running unauthenticated —
  // never worth the trade of "the worker starts" over "the worker is
  // actually protected."
  console.error(
    "FATAL: IMAP_WORKER_SHARED_SECRET is not set. Refusing to start an unauthenticated IMAP worker.",
  );
  process.exit(1);
}

const MAX_JSON_BODY_BYTES = 64 * 1024; // credentials + options are a few KB at most
const REQUEST_TIMEOUT_MS = 30_000; // server-level backstop on top of imapCore's own 25s timeouts

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

// Hardening fix (see the Phase 1 review report): client-input errors
// (malformed JSON, oversized body) previously fell through to the
// catch-all handler below, which always answered 502 — correct for a
// genuine upstream/IMAP failure, wrong HTTP semantics for "you sent bad
// input." Tagging the error with its intended status lets the one
// catch-all still handle every error path (no duplicated response logic)
// while answering with the right code.
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function isAuthorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(SHARED_SECRET as string);
  // Constant-time comparison — a plain === leaks timing information about
  // how many leading characters matched, which matters for a bearer token
  // check even on an internal API.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return; // already rejected; draining below, don't re-reject
      total += chunk.length;
      if (total > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        // Stop growing `chunks` — this is what keeps memory bounded, not
        // destroying the connection. Bytes already read for THIS chunk
        // are simply not pushed; anything still arriving after is drained
        // (below) rather than buffered, so a large upload can't build up
        // unbounded memory here either.
        chunks.length = 0;
        reject(new HttpError(413, "Request body too large."));
        // Drain (not destroy) the rest of the incoming body — lets the
        // client finish sending without the socket resetting mid-stream,
        // which is what let a proper HTTP response reach the client
        // instead of an abrupt connection close.
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return; // already settled via reject() above
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new HttpError(400, "Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

interface CredentialedBody {
  credentials?: ImapSmtpCredentials;
}

function isImapSmtpCredentials(v: unknown): v is ImapSmtpCredentials {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return typeof c.imapHost === "string" && typeof c.password === "string";
}

const server = createServer((req, res) => {
  // Never log request bodies (credentials live there) — method, path, and
  // outcome only, exactly the same discipline the Supabase Edge Functions
  // already follow (zero sensitive console.log calls anywhere in this
  // codebase's email integration).
  const start = Date.now();
  const finish = (status: number) => {
    console.log(`${req.method} ${req.url} -> ${status} (${Date.now() - start}ms)`);
  };

  void (async () => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        json(res, 200, { ok: true });
        finish(200);
        return;
      }

      if (!isAuthorized(req)) {
        json(res, 401, { error: "Unauthorized." });
        finish(401);
        return;
      }

      if (req.method !== "POST") {
        json(res, 405, { error: "Method not allowed." });
        finish(405);
        return;
      }

      const body = (await readJsonBody(req)) as CredentialedBody & {
        options?: ListMessagesOptions;
        providerMessageId?: string;
        attachmentId?: string;
      };

      if (!isImapSmtpCredentials(body.credentials)) {
        json(res, 400, { error: "Missing or invalid IMAP credentials." });
        finish(400);
        return;
      }
      const creds = body.credentials;

      if (req.url === "/test-connection") {
        const result = await withTimeout(testConnection(creds), REQUEST_TIMEOUT_MS);
        json(res, 200, result);
        finish(200);
        return;
      }

      if (req.url === "/list-messages") {
        const result = await withTimeout(
          listMessages(creds, body.options ?? {}),
          REQUEST_TIMEOUT_MS,
        );
        json(res, 200, result);
        finish(200);
        return;
      }

      if (req.url === "/get-attachment") {
        if (!body.providerMessageId || !body.attachmentId) {
          json(res, 400, { error: "providerMessageId and attachmentId are required." });
          finish(400);
          return;
        }
        const bytes = await withTimeout(
          getAttachment(creds, body.providerMessageId, body.attachmentId),
          REQUEST_TIMEOUT_MS,
        );
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": bytes.byteLength,
        });
        res.end(Buffer.from(bytes));
        finish(200);
        return;
      }

      json(res, 404, { error: "Not found." });
      finish(404);
    } catch (err) {
      if (err instanceof HttpError) {
        json(res, err.status, { error: err.message });
        finish(err.status);
        return;
      }
      const message = err instanceof Error ? err.message : "Unexpected worker error.";
      json(res, 502, { error: message });
      finish(502);
    }
  })();
});

// Loopback-only by default — this experimental worker should never be
// reachable beyond the machine running it unless something deliberately
// puts it behind a real, approved public endpoint (a proper hosting
// platform, not an ad hoc tunnel). Override via HOST only when that real
// deployment decision has actually been made.
const HOST = process.env.HOST ?? "127.0.0.1";
server.listen(PORT, HOST, () => {
  console.log(`email-worker listening on ${HOST}:${PORT}`);
});
