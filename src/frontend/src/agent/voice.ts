// FabFlow AI Agent — voice modality (speech-to-text + text-to-speech).
//
// Deliberately built on the browser's own Web Speech API
// (SpeechRecognition + speechSynthesis) rather than a new server-side
// provider. This is the "smallest production-appropriate integration"
// for this feature, not a shortcut:
//   - It needs no new API key/secret and no new Supabase Edge Function —
//     see agent/llm/client.ts's own header for why a secret must never
//     live in frontend code; the browser APIs used here hold none.
//   - It is genuinely real-time/streaming (interim results as the user
//     speaks), which a record-a-blob-then-upload-to-a-relay design
//     cannot match for a "feels like a conversation" experience.
//   - Support is uneven by design (Chrome/Edge/Safari ship
//     SpeechRecognition; Firefox does not) — every caller MUST check
//     isSpeechRecognitionSupported()/isSpeechSynthesisSupported() first
//     and fall back to normal text chat, never pretend the capability
//     exists.
//
// Voice is purely an input/output modality for the EXISTING agent
// pipeline: recognized speech becomes plain instruction text handed to
// the same runAgentTurn()/handleAiSubmit() path a typed message uses
// (see AgentPage.tsx) — this file has no ERP knowledge, no tool calls,
// and no confirmation logic of its own.

/** Curated BCP-47 language list for the voice UI — not exhaustive, but
 * each entry is a language the underlying Web Speech Recognition/
 * Synthesis implementations broadly support. Recognition/synthesis
 * quality for any given language still depends on the user's browser
 * and OS voice packs — see isLanguageLikelySupported(). */
export const SUPPORTED_VOICE_LANGUAGES: Array<{
  code: string;
  label: string;
}> = [
  { code: "en-US", label: "English (US)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "te-IN", label: "Telugu" },
  { code: "ta-IN", label: "Tamil" },
  { code: "kn-IN", label: "Kannada" },
  { code: "mr-IN", label: "Marathi" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "bn-IN", label: "Bengali" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
  { code: "ar-SA", label: "Arabic" },
  { code: "ja-JP", label: "Japanese" },
];

export const DEFAULT_VOICE_LANGUAGE = "en-US";

// ── Minimal ambient typing for the Web Speech Recognition API. TypeScript's
// bundled lib.dom.d.ts ships the *result* types (SpeechRecognitionResult
// etc.) but not the recognizer interface/constructor itself, and Chrome
// still only exposes it under the `webkit` prefix — so both are declared
// here rather than reached for as `any` at every call site.
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export interface ListenHandlers {
  /** Fired repeatedly with the best-guess transcript so far, including
   * words the engine may still revise — render this live, never treat it
   * as final. */
  onInterim: (transcript: string) => void;
  /** Fired once recognition has committed to a finished transcript
   * segment. */
  onFinal: (transcript: string) => void;
  /** Recognition stopped — either the user/engine ended it naturally
   * (silence) or stop() was called. Always fires exactly once per
   * start(). */
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface VoiceController {
  stop: () => void;
}

/** Starts one listening turn. `continuous: true` + `interimResults: true`
 * so the composer can show live text while the user is still speaking —
 * this is what makes it feel like a conversation instead of
 * record-then-transcribe. Recognition ends naturally after the engine's
 * own silence detection, or immediately if stop() is called. */
export function startListening(
  lang: string,
  handlers: ListenHandlers,
): VoiceController | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    handlers.onError("Speech recognition is not supported in this browser.");
    return null;
  }
  const recognizer = new Ctor();
  recognizer.lang = lang || DEFAULT_VOICE_LANGUAGE;
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.maxAlternatives = 1;

  recognizer.onresult = (ev) => {
    let interim = "";
    let final = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      const transcript = result[0]?.transcript ?? "";
      if (result.isFinal) final += transcript;
      else interim += transcript;
    }
    if (final) handlers.onFinal(final.trim());
    else if (interim) handlers.onInterim(interim.trim());
  };
  recognizer.onerror = (ev) => {
    // "no-speech"/"aborted" are routine (user paused, or stop() was
    // called deliberately) — not real errors worth surfacing.
    if (ev.error === "no-speech" || ev.error === "aborted") return;
    handlers.onError(
      ev.error === "not-allowed" || ev.error === "permission-denied"
        ? "Microphone permission was denied."
        : `Speech recognition error: ${ev.error}`,
    );
  };
  recognizer.onend = handlers.onEnd;

  try {
    recognizer.start();
  } catch {
    handlers.onError("Could not start speech recognition.");
    return null;
  }
  return { stop: () => recognizer.stop() };
}

export interface SpeakHandlers {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

/** Stops any speech currently playing — called before starting a new
 * voice turn (requirement: a new turn must interrupt playback) and
 * whenever the user taps a stop control. Safe to call when nothing is
 * speaking. */
export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
  currentUtterance = null;
}

/** Speaks `text` aloud. Never call with raw markdown/JSON — pass text
 * through stripForSpeech() first (see below). Returns a controller with
 * stop(); pause/resume are exposed as plain window.speechSynthesis calls
 * by the caller since they operate on the single shared synthesis queue,
 * not per-utterance. */
export function speak(
  text: string,
  lang: string,
  handlers: SpeakHandlers = {},
): VoiceController | null {
  if (!isSpeechSynthesisSupported()) {
    handlers.onError?.("Speech playback is not supported in this browser.");
    return null;
  }
  if (!text.trim()) return null;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang || DEFAULT_VOICE_LANGUAGE;
  utterance.onstart = () => handlers.onStart?.();
  utterance.onend = () => {
    currentUtterance = null;
    handlers.onEnd?.();
  };
  utterance.onerror = (ev) => {
    currentUtterance = null;
    // "canceled"/"interrupted" happen every time stop()/a new utterance
    // pre-empts this one — routine, not a real failure.
    if (ev.error === "canceled" || ev.error === "interrupted") return;
    handlers.onError?.(`Speech playback error: ${ev.error}`);
  };
  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
  return { stop: stopSpeaking };
}

export function pauseSpeaking(): void {
  if (isSpeechSynthesisSupported() && currentUtterance)
    window.speechSynthesis.pause();
}

export function resumeSpeaking(): void {
  if (isSpeechSynthesisSupported() && currentUtterance)
    window.speechSynthesis.resume();
}

/** Converts an assistant markdown message into natural spoken text.
 * Strips syntax the model/AgentMarkdown produces (headings, bold/code
 * markers, table pipes, bullet markers, bare URLs) without altering the
 * actual words — so a real ERP identifier like "PROJ-2026-001" survives
 * completely untouched (it contains no markdown syntax characters), the
 * exact requirement that identifiers are never "translated" or mangled
 * for speech. */
export function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks — not useful spoken
    .replace(/^#{1,6}\s+/gm, "") // heading markers
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/https?:\/\/\S+/g, "a link") // bare URLs — read the address aloud is noise
    .replace(/^\s*\|.*\|\s*$/gm, (row) =>
      row
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(", "),
    ) // table rows -> comma-separated
    .replace(/^\s*[-*]\s+/gm, "") // bullet markers
    .replace(/^\s*\d+[.)]\s+/gm, "") // numbered-list markers
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}
