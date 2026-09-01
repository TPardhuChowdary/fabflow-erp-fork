// AI Agent redesign (see chat) — lightweight markdown rendering for
// assistant messages (requirement #2: "headings, paragraphs, bullet
// lists, numbered lists, tables, inline emphasis, code blocks"), plus
// inline ERP-aware reference linking (requirement #6, via
// erpReferences.ts). No markdown library added — the codebase has none
// installed, and the supported syntax here is deliberately small and
// deterministic (this only needs to render what an LLM naturally
// produces, not arbitrary markdown), so a hand-rolled ~200-line parser
// avoids a new dependency for what a bounded set of patterns can do.
//
// User messages are rendered as plain text (see AgentPage.tsx) — this
// component is for assistant messages only, where formatting actually
// originates from the model.
import type { Page } from "@/types";
import { type ErpReferenceStore, findErpReferences } from "./erpReferences";

interface Props {
  text: string;
  store: ErpReferenceStore;
  onNavigate?: (page: Page) => void;
  onNavigateToRecord?: (
    type: "project" | "customer" | "employee",
    id: string,
  ) => void;
}

// ── ERP reference linking only (no markdown) — the leaf-level pass,
// applied both to plain-text runs and to the inner content of **bold**
// spans (see renderInline below). Kept separate from markdown detection
// deliberately: an earlier version ran reference-splitting BEFORE
// markdown-splitting, which silently broke a real, observed case —
// "**PROJ-2026-001 — TEST PROJECT**" (a bold heading wrapping a real
// reference) split the "**" markers into different segments, so neither
// segment contained a complete "**...**" pair and the bold never
// rendered, leaving literal asterisks on screen. Markdown is now
// tokenized first (see renderInline), and reference-linking only runs
// inside each already-resolved text/bold token, so a reference fully
// nested inside bold renders correctly as bold text containing a link.
function renderTextWithRefs(
  text: string,
  keyPrefix: string,
  store: ErpReferenceStore,
  onNavigate?: (page: Page) => void,
  onNavigateToRecord?: (
    type: "project" | "customer" | "employee",
    id: string,
  ) => void,
): React.ReactNode[] {
  const refs = findErpReferences(text, store);
  if (refs.length === 0) return [text];

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let n = 0;
  for (const ref of refs) {
    if (ref.start > cursor) nodes.push(text.slice(cursor, ref.start));
    const action = ref.action;
    const onClick = () => {
      if (action.kind === "record")
        onNavigateToRecord?.(action.recordType, action.id);
      else onNavigate?.(action.page);
    };
    nodes.push(
      <button
        key={`${keyPrefix}-ref-${n++}`}
        type="button"
        onClick={onClick}
        disabled={!onNavigate && !onNavigateToRecord}
        className="inline-flex items-center rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[0.85em] font-medium hover:bg-primary/20 transition-colors align-baseline disabled:cursor-default disabled:hover:bg-primary/10"
      >
        {ref.label}
      </button>,
    );
    cursor = ref.end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

// ── Inline formatting: **bold**, `code`, bare URLs, tokenized from the
// FULL text first (fixing the nesting bug described above), then ERP
// reference-linking is applied within plain-text and bold tokens only —
// code/URL tokens stay literal (a reference-looking substring inside a
// code span should read as code, not become a link).
function renderInline(
  text: string,
  keyPrefix: string,
  store: ErpReferenceStore,
  onNavigate?: (page: Page) => void,
  onNavigateToRecord?: (
    type: "project" | "customer" | "employee",
    id: string,
  ) => void,
) {
  const withRefs = (t: string, kp: string) =>
    renderTextWithRefs(t, kp, store, onNavigate, onNavigateToRecord);

  const inlineRegex = /\*\*(.+?)\*\*|`([^`]+)`|(https?:\/\/\S+)/g;
  const nodes: React.ReactNode[] = [];
  let n = 0;
  let last = 0;
  let m: RegExpExecArray | null = inlineRegex.exec(text);
  while (m !== null) {
    if (m.index > last)
      nodes.push(...withRefs(text.slice(last, m.index), `${keyPrefix}-t${n}`));
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${n++}`} className="font-semibold">
          {withRefs(m[1], `${keyPrefix}-b${n}`)}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${n++}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {m[2]}
        </code>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <a
          key={`${keyPrefix}-u-${n++}`}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 break-all"
        >
          {m[3]}
        </a>,
      );
    }
    last = m.index + m[0].length;
    m = inlineRegex.exec(text);
  }
  if (last < text.length)
    nodes.push(...withRefs(text.slice(last), `${keyPrefix}-t${n}`));
  return nodes;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet-list"; items: string[] }
  | { type: "number-list"; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "code"; text: string };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep = (l: string) =>
    /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    if (isTableRow(line) && lines[i + 1] && isTableSep(lines[i + 1])) {
      const splitRow = (l: string) =>
        l
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "bullet-list", items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "number-list", items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !(isTableRow(lines[i]) && lines[i + 1] && isTableSep(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return blocks;
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-base font-semibold mt-3 first:mt-0",
  2: "text-sm font-semibold mt-3 first:mt-0",
  3: "text-sm font-medium mt-2 first:mt-0",
};

export function AgentMarkdown({
  text,
  store,
  onNavigate,
  onNavigateToRecord,
}: Props) {
  const blocks = parseBlocks(text);
  const inline = (t: string, key: string) =>
    renderInline(t, key, store, onNavigate, onNavigateToRecord);

  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((block, bi) => {
        const key = `b${bi}`;
        switch (block.type) {
          case "heading": {
            const Tag = `h${block.level + 3}` as unknown as "h4" | "h5" | "h6";
            return (
              <Tag key={key} className={HEADING_CLASS[block.level]}>
                {inline(block.text, key)}
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={key} className="whitespace-pre-wrap">
                {inline(block.text, key)}
              </p>
            );
          case "bullet-list": {
            const items = block.items.map((item, ii) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: items are re-parsed plain text with no stable identity of their own; position is the only real key available.
                key={`${key}-${ii}`}
              >
                {inline(item, `${key}-${ii}`)}
              </li>
            ));
            return (
              <ul key={key} className="list-disc pl-5 space-y-1">
                {items}
              </ul>
            );
          }
          case "number-list": {
            const items = block.items.map((item, ii) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: items are re-parsed plain text with no stable identity of their own; position is the only real key available.
                key={`${key}-${ii}`}
              >
                {inline(item, `${key}-${ii}`)}
              </li>
            ));
            return (
              <ol key={key} className="list-decimal pl-5 space-y-1">
                {items}
              </ol>
            );
          }
          case "table": {
            const headerCells = block.header.map((h, hi) => (
              <th
                // biome-ignore lint/suspicious/noArrayIndexKey: header cells are re-parsed plain text with no stable identity; column position is the only real key available.
                key={`${key}-h${hi}`}
                className="text-left font-semibold px-2.5 py-1.5 border-b border-border"
              >
                {inline(h, `${key}-h${hi}`)}
              </th>
            ));
            const bodyRows = block.rows.map((row, ri) => (
              <tr
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are re-parsed plain text with no stable identity; row position is the only real key available.
                key={`${key}-r${ri}`}
                className="border-b border-border last:border-0"
              >
                {row.map((cell, ci) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells are re-parsed plain text with no stable identity; column position is the only real key available.
                    key={`${key}-r${ri}-c${ci}`}
                    className="px-2.5 py-1.5"
                  >
                    {inline(cell, `${key}-r${ri}-c${ci}`)}
                  </td>
                ))}
              </tr>
            ));
            return (
              <div
                key={key}
                className="overflow-x-auto rounded-md border border-border"
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">{headerCells}</tr>
                  </thead>
                  <tbody>{bodyRows}</tbody>
                </table>
              </div>
            );
          }
          case "code":
            return (
              <pre
                key={key}
                className="rounded-md bg-muted px-3 py-2 font-mono text-xs overflow-x-auto"
              >
                <code>{block.text}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
