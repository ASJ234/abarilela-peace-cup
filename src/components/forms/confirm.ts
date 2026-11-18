import type { ConfirmOptions } from "@/components/ui";

/** Standard "Delete X?" confirmation. A plain module so both server and client code can call it. */
export function deleteConfirm(what: string, detail?: React.ReactNode, verb = "Delete"): ConfirmOptions {
  return { title: `${verb} ${what}?`, message: detail ?? "This can't be undone.", confirmLabel: verb, tone: "danger" };
}
