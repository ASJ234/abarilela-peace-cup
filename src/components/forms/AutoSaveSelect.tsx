"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui";
import { HiddenFields, type ServerAction } from "./ActionForm";

/** A <select> that saves as soon as it changes (e.g. a team's group). */
export function AutoSaveSelect({
  action,
  fields,
  name,
  defaultValue,
  options,
  label,
}: {
  action: ServerAction;
  fields?: HiddenFields;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex min-w-0 flex-col gap-1">
      <HiddenFields fields={fields} />
      <Select
        key={defaultValue} // remount when the saved value changes
        name={name}
        defaultValue={defaultValue}
        aria-label={label}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      {state?.error && <span role="alert" className="text-xs text-rel">{state.error}</span>}
    </form>
  );
}
