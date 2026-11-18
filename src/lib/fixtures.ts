/**
 * Round-robin fixture generation using the circle (Berger) method.
 *
 * Every team plays every other team once per leg. With `doubleRound` the
 * second leg repeats the first with home and away swapped, as in a football
 * league season. With an odd number of teams, one team sits out (a "bye")
 * each round.
 *
 * Home and away games are balanced: in a single leg each team's home count
 * differs by at most one, and with an odd number of teams it is exact.
 */
export type Pairing<T> = { home: T; away: T };

export function generateRoundRobin<T>(
  teamIds: T[],
  opts: { doubleRound?: boolean; shuffle?: boolean; random?: () => number } = {},
): Pairing<T>[][] {
  const { doubleRound = true, shuffle = true, random = Math.random } = opts;
  if (teamIds.length < 2) throw new Error("At least 2 teams are needed to generate fixtures.");

  // Work with indices into teamIds; -1 marks the bye.
  const BYE = -1;
  const slots = teamIds.map((_, i) => i);

  if (shuffle) {
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
  }

  // The bye takes the fixed slot so the rotating teams stay home/away balanced.
  if (slots.length % 2 === 1) slots.unshift(BYE);

  const n = slots.length;
  const firstLeg: Pairing<T>[][] = [];
  let arr = slots;

  for (let r = 0; r < n - 1; r++) {
    const round: Pairing<T>[] = [];
    for (let i = 0; i < n / 2; i++) {
      let home = arr[i];
      let away = arr[n - 1 - i];
      // The fixed team (slot 0) alternates home/away each round; the other
      // pairings alternate by slot.
      const swap = i === 0 ? r % 2 === 1 : i % 2 === 1;
      if (swap) [home, away] = [away, home];
      if (home !== BYE && away !== BYE) round.push({ home: teamIds[home], away: teamIds[away] });
    }
    firstLeg.push(round);
    // Rotate every slot except the first one position clockwise.
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  if (!doubleRound) return firstLeg;
  const secondLeg = firstLeg.map((round) => round.map(({ home, away }) => ({ home: away, away: home })));
  return [...firstLeg, ...secondLeg];
}

/** Number of rounds (matchdays) a league needs. */
export function roundsNeeded(teamCount: number, doubleRound: boolean): number {
  if (teamCount < 2) return 0;
  const perLeg = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  return doubleRound ? perLeg * 2 : perLeg;
}
