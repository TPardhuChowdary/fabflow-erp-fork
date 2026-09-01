import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
// Phase 6 — Shared component system (FINAL_UX_IMPLEMENTATION_BLUEPRINT.md
// §11 component I). Production's real gap, confirmed live in Phase 2's own
// grounding pass and re-confirmed here (Quotations' row actions run up to 7
// unlabeled icons wide, and `DropdownMenu` — the exact primitive an
// overflow menu needs — was in `components/ui/` but adopted in zero real
// pages before this). This is the reusable primitive the rule needs;
// composed entirely from two already-existing shadcn primitives (Button,
// DropdownMenu), nothing new built from scratch.
//
// This phase builds the primitive only — it does NOT retrofit any of the
// 31 real module tables (that's Phase 9+'s module-by-module migration,
// per §18; each module's row actions have their own real handlers/guards
// that must be carried over individually, not something a shared-
// component phase should touch).
import { MoreHorizontal } from "lucide-react";

export interface RowAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Styles the action as destructive (delete, etc.) — both as a primary
   * button and inside the overflow menu. */
  destructive?: boolean;
  disabled?: boolean;
  /** Real `data-ocid` hook, matching this app's existing convention. */
  "data-ocid"?: string;
}

interface RowActionsProps {
  /** The 1-2 highest-frequency actions for this row — rendered as
   * explicit icon+label buttons, never bare icons (component I's rule:
   * "never bare unlabeled icons"). More than 2 defeats the rule's purpose
   * (the row gets wide again) — pass the rest via `overflow`. */
  primary: RowAction[];
  /** Everything else — collapses into a single labeled "More" button, one
   * accessible menu, arrow-key navigable (inherited from Radix
   * DropdownMenu). Omit or pass an empty array when there's nothing past
   * the primary 1-2 actions. */
  overflow?: RowAction[];
  className?: string;
}

/** Row-level actions for a table (component I) — 1-2 explicit primary
 * actions plus one labeled overflow menu for everything else. Never bare,
 * unlabeled icon clusters. */
export function RowActions({
  primary,
  overflow = [],
  className,
}: RowActionsProps) {
  return (
    <div className={cn("flex items-center justify-end gap-1", className)}>
      {primary.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 gap-1 text-xs",
            action.destructive &&
              "text-destructive hover:text-destructive hover:bg-destructive/10",
          )}
          onClick={action.onClick}
          disabled={action.disabled}
          data-ocid={action["data-ocid"]}
        >
          {action.icon && <action.icon className="w-3.5 h-3.5" />}
          {action.label}
        </Button>
      ))}
      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="More actions"
              data-ocid="row_actions.overflow.trigger"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflow.map((action, i) => {
              const prevDestructive = i > 0 && overflow[i - 1].destructive;
              return (
                <RowActionsMenuItem
                  key={action.label}
                  action={action}
                  separatorBefore={!prevDestructive && !!action.destructive}
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function RowActionsMenuItem({
  action,
  separatorBefore,
}: { action: RowAction; separatorBefore: boolean }) {
  return (
    <>
      {separatorBefore && <DropdownMenuSeparator />}
      <DropdownMenuItem
        onClick={action.onClick}
        disabled={action.disabled}
        variant={action.destructive ? "destructive" : "default"}
        data-ocid={action["data-ocid"]}
      >
        {action.icon && <action.icon className="w-3.5 h-3.5" />}
        {action.label}
      </DropdownMenuItem>
    </>
  );
}
