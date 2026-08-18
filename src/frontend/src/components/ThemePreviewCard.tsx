// Phase — Multi-Theme Design System. Renders a live miniature of a theme
// (sidebar strip, card, primary button chip, secondary/accent chip, text
// lines) using ONLY that theme preset's own token values via inline
// `style={{...}}`, never semantic Tailwind classes. This is deliberate:
// semantic classes (bg-primary, etc.) always resolve against whichever
// theme is currently active on <html>, which would make every preview
// card in the grid show the SAME (active) theme instead of its own -
// exactly the "fake screenshot that drifts" failure mode the plan calls
// out. Reading tokens.ts directly also means these previews can never go
// stale relative to the real token definitions.

import type { ThemeModeTokens, ThemePreset } from "@/lib/themes/tokens";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

function oklch(token: string): string {
  return `oklch(${token})`;
}

interface ThemePreviewCardProps {
  preset: ThemePreset;
  /** Which of the preset's two token sets to render the preview with -
   * normally the app's current resolved light/dark mode, so previews
   * stay coherent with what the user is about to switch into. */
  mode: "light" | "dark";
  isSelected: boolean;
  onSelect: () => void;
}

export function ThemePreviewCard({
  preset,
  mode,
  isSelected,
  onSelect,
}: ThemePreviewCardProps) {
  const tokens: ThemeModeTokens = preset[mode];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      data-ocid="settings.appearance.theme-card"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border text-left transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        isSelected
          ? "border-primary shadow-md ring-2 ring-primary"
          : "border-border hover:shadow-sm",
      )}
    >
      {isSelected && (
        <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}

      {/* Miniature app chrome, entirely inline-styled from this preset's
          own tokens. */}
      <div
        className="flex h-24 w-full overflow-hidden"
        style={{ backgroundColor: oklch(tokens.background) }}
      >
        <div
          className="flex w-6 flex-shrink-0 flex-col items-center gap-1 py-2"
          style={{ backgroundColor: oklch(tokens.sidebar) }}
        >
          <span
            className="h-1.5 w-3 rounded-sm"
            style={{ backgroundColor: oklch(tokens.sidebarPrimary) }}
          />
          <span
            className="h-1.5 w-3 rounded-sm opacity-60"
            style={{ backgroundColor: oklch(tokens.sidebarForeground) }}
          />
          <span
            className="h-1.5 w-3 rounded-sm opacity-60"
            style={{ backgroundColor: oklch(tokens.sidebarForeground) }}
          />
        </div>
        <div className="flex flex-1 flex-col justify-between p-2">
          <div
            className="flex flex-col gap-1 rounded-sm border p-1.5"
            style={{
              backgroundColor: oklch(tokens.card),
              borderColor: oklch(tokens.border),
            }}
          >
            <span
              className="h-1 w-10 rounded-full"
              style={{ backgroundColor: oklch(tokens.foreground) }}
            />
            <span
              className="h-1 w-14 rounded-full opacity-70"
              style={{ backgroundColor: oklch(tokens.mutedForeground) }}
            />
          </div>
          <div className="flex items-center gap-1">
            <span
              className="flex h-3.5 w-8 items-center justify-center rounded-sm text-[6px] font-medium"
              style={{
                backgroundColor: oklch(tokens.primary),
                color: oklch(tokens.primaryForeground),
              }}
            >
              Save
            </span>
            <span
              className="h-3.5 w-3.5 rounded-sm"
              style={{ backgroundColor: oklch(tokens.accent) }}
            />
            <span
              className="h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: oklch(tokens.secondary) }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border px-3 py-2">
        <span className="text-sm font-medium text-foreground">
          {preset.name}
        </span>
        <span className="line-clamp-1 text-xs text-muted-foreground">
          {preset.description}
        </span>
      </div>
    </button>
  );
}
