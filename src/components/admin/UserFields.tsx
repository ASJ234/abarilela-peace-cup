import { TeamOptions, type TeamChoices } from "@/components/auth";
import { Field, Input, Select } from "@/components/ui";

export type ManagedUser = {
  id: number;
  username: string;
  name: string;
  role: "fan" | "official" | "admin";
  favouriteTeamId: number | null;
  createdAt: string;
};

/** Username, display name, role and favourite team: shared by "Add user" and "Edit user". */
export function UserFields({ user, teams }: { user?: ManagedUser; teams: TeamChoices }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Username" hint="3–30 letters, numbers, dots, dashes or underscores.">
        <Input
          name="username"
          required
          minLength={3}
          maxLength={30}
          pattern="[A-Za-z0-9._\-]{3,30}"
          defaultValue={user?.username ?? ""}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      <Field label="Display name" hint="Optional. Defaults to the username.">
        <Input name="name" maxLength={60} defaultValue={user && user.name !== user.username ? user.name : ""} autoComplete="off" />
      </Field>
      <Field label="Role">
        <Select name="role" defaultValue={user?.role ?? "fan"}>
          <option value="fan">Fan: follows a team</option>
          <option value="official">Official: manages the league</option>
        </Select>
      </Field>
      <Field label="Favourite team">
        <Select name="favouriteTeamId" defaultValue={user?.favouriteTeamId ?? ""}>
          <option value="">None</option>
          <TeamOptions teams={teams} />
        </Select>
      </Field>
    </div>
  );
}
