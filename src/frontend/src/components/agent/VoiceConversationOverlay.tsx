// FabFlow AI Agent — Voice Conversation mode (see chat, requirement #7).
//
// Purely presentational: all voice state (listening/processing/speaking),
// the actual SpeechRecognition/SpeechSynthesis calls, and the pending
// confirmation logic all live in AgentPage.tsx / agent/voice.ts — this
// component only renders what it's handed and reports taps back via
// props. It is the SAME conversation (same aiChat/aiMessages, same
// confirm/cancel state machine) shown with a larger, lower-distraction
// layout — never a second AI system.
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Bot, Mic, PhoneOff, Square } from "lucide-react";

export type VoiceState = "idle" | "listening" | "processing" | "speaking";

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Tap the microphone to talk",
  listening: "Listening…",
  processing: "Thinking…",
  speaking: "Speaking…",
};

interface Props {
  assistantName: string;
  voiceState: VoiceState;
  interimText: string;
  /** The most recent assistant reply's plain text, shown so the user can
   * read along with what's being spoken — never re-fetched or
   * re-generated here, just the same text already in aiChat. */
  lastAssistantText: string | null;
  error: string | null;
  micSupported: boolean;
  onMicToggle: () => void;
  onEnd: () => void;
  /** Set only when a write action is genuinely awaiting the user's
   * explicit confirmation — voice NEVER auto-confirms (safety
   * requirement #14); the user must tap Confirm/Cancel here exactly as
   * in normal chat, even mid voice-conversation. */
  pendingConfirm: {
    lines: string[];
    onConfirm: () => void;
    onCancel: () => void;
    busy: boolean;
    disabled: boolean;
  } | null;
}

export function VoiceConversationOverlay({
  assistantName,
  voiceState,
  interimText,
  lastAssistantText,
  error,
  micSupported,
  onMicToggle,
  onEnd,
  pendingConfirm,
}: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-6 py-10 px-4 text-center h-full"
      data-ocid="agent.voice_mode.overlay"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Bot className="w-4 h-4" />
        {assistantName} — Voice Conversation
      </div>

      {/* Orb — the animation is decorative; the state is always also
          conveyed as plain text below (never color/motion-only). */}
      <div className="relative flex items-center justify-center w-28 h-28">
        {(voiceState === "listening" || voiceState === "speaking") && (
          <span
            className={cn(
              "absolute inset-0 rounded-full animate-ping opacity-30",
              voiceState === "listening" ? "bg-primary" : "bg-success",
            )}
          />
        )}
        <div
          className={cn(
            "relative flex items-center justify-center w-20 h-20 rounded-full transition-colors",
            voiceState === "listening" && "bg-primary/20 text-primary",
            voiceState === "speaking" && "bg-success/20 text-success",
            voiceState === "processing" &&
              "bg-muted text-muted-foreground animate-pulse",
            voiceState === "idle" && "bg-primary/10 text-primary",
          )}
        >
          <Mic className="w-8 h-8" />
        </div>
      </div>

      <p
        className="text-sm font-medium"
        aria-live="polite"
        data-ocid="agent.voice_mode.state_label"
      >
        {STATE_LABEL[voiceState]}
      </p>

      <div className="max-w-md min-h-12 text-sm text-muted-foreground">
        {interimText
          ? `"${interimText}"`
          : lastAssistantText
            ? lastAssistantText
            : "Say something like “Show me the status of Project PROJ-2026-001.”"}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive max-w-md">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {pendingConfirm && (
        <div className="w-full max-w-md rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2 text-left">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
            <AlertTriangle className="w-3.5 h-3.5" />
            Confirmation needed — nothing has been done yet
          </div>
          <ul className="text-sm list-disc pl-4 space-y-1">
            {pendingConfirm.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={pendingConfirm.onConfirm}
              disabled={pendingConfirm.disabled || pendingConfirm.busy}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={pendingConfirm.onCancel}
              disabled={pendingConfirm.busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          className="w-14 h-14 rounded-full"
          variant={voiceState === "listening" ? "default" : "outline"}
          onClick={onMicToggle}
          disabled={!micSupported || voiceState === "processing"}
          aria-label={
            voiceState === "listening" ? "Stop listening" : "Start talking"
          }
          data-ocid="agent.voice_mode.mic_button"
        >
          {voiceState === "listening" ? (
            <Square className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onEnd}
          data-ocid="agent.voice_mode.end_button"
        >
          <PhoneOff className="w-4 h-4 mr-1.5" />
          End Voice Conversation
        </Button>
      </div>
      {!micSupported && (
        <p className="text-xs text-muted-foreground max-w-md">
          Speech input isn't supported in this browser — type your message below
          instead; responses can still be read aloud.
        </p>
      )}
    </div>
  );
}
