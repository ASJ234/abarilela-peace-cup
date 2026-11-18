"use client";

import { Button } from "./Button";
import { Modal } from "./Modal";

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  /** Label of the confirming button, e.g. "Delete". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" styles the confirm button red (for deletes). */
  tone?: "danger" | "primary";
};

/** Asks the user to confirm or cancel an action. Esc / backdrop click cancels. */
export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
}: ConfirmOptions & { open: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} description={message}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} autoFocus className="w-full sm:w-auto">
          {cancelLabel}
        </Button>
        <Button type="button" variant={tone === "danger" ? "dangerSolid" : "primary"} onClick={onConfirm} className="w-full sm:w-auto">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
