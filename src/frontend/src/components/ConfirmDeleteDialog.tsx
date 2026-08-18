import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What's being deleted, e.g. "delete project" or "delete this invoice". */
  title: string;
  /** What will be deleted, e.g. `Project "PROJ-2026-001"`. Rendered as the
   * description, followed by the standard "cannot be undone" line unless
   * `undoable` is set. */
  description: string;
  /** Set true for actions that ARE reversible (rare — most deletes in this
   * app aren't) to skip the "cannot be undone" line rather than lie about
   * it. */
  undoable?: boolean;
  onConfirm: () => void;
  confirmLabel?: string;
}

/** Shared destructive-action confirmation, replacing native
 * window.confirm()/confirm() across the app — same visual language as
 * every other dialog in FabFlow, unlike the browser's own unstyled prompt,
 * and (unlike window.confirm) doesn't block the JS event loop. */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  undoable,
  onConfirm,
  confirmLabel = "Delete",
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-ocid="confirm_delete.dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
            {!undoable && " This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-ocid="confirm_delete.cancel">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-ocid="confirm_delete.confirm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
