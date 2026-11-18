/** Teams grouped by season, for "favourite team" pickers. */
export type TeamChoices = { season: string; teams: { id: number; name: string }[] }[];

export function TeamOptions({ teams }: { teams: TeamChoices }) {
  return (
    <>
      {teams.map((s) => (
        <optgroup key={s.season} label={s.season}>
          {s.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </optgroup>
      ))}
    </>
  );
}
