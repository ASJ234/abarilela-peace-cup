# Abarilela Peace Cup

A league and tournament management platform in the style of a football league. Officials register
teams and squads, put teams in groups, enter playing dates and generate fixtures. They then record
results, goals, assists and cards. The site keeps the tables and player stats up to date.

Built with **Next.js 16** (App Router, Server Actions), **Tailwind CSS 4** and **SQLite** using Node's
built-in `node:sqlite`, so there is no database server to install and no native module to compile.

## Features

### Competition formats

Each season uses one of two formats, chosen when it's created (in **Settings**):

| Format          | Tables                    | Fixtures                                                     |
| --------------- | ------------------------- | ------------------------------------------------------------ |
| **League**      | All teams in one table    | Every team plays every other team **home and away**          |
| **Group stage** | One table per group       | Every team plays each team in its group **once**             |

Knockout or extra matches (e.g. "Semi-final", "Final") can be added to either format with a *stage*; they
don't count toward the tables. The format can't be changed while league/group fixtures exist.

### Home page

The home page shows:

- a welcome banner, and a spotlight on the next match with a live countdown;
- your favourite team (position, points, form, last result, next match), for signed-in fans;
- the season in numbers;
- latest results and upcoming fixtures;
- the top of the table, or the group leaders;
- the Golden Boot and playmaker races;
- the **Fair Play award** (fewest card points: yellow 1, red 3);
- season records (biggest win, most goals in a match);
- all competitions, with progress bars.

### Public site (anyone can view)

| Page        | What it shows                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| **Table**   | One league table, or one table per group. P, W, D, L, GF, GA, GD, Pts and last-5 form. Top N highlighted (default 4), optional bottom zone. |
| **Fixtures**| Upcoming matches by date with kick-off time, venue and group/stage.                                              |
| **Results** | Played matches, newest first.                                                                                    |
| **Stats**   | Top scorers, top assists, red cards, and a full discipline table (yellow and red cards).                         |
| **Teams**   | Every team (by group) → squad with shirt numbers, positions and each player's goals, assists and cards, plus the team's matches. |
| **Match**   | Score, date, venue, and a timeline of goals (with assists), own goals and cards.                                 |

### Official panel (`/official`, password protected)

- **Teams & groups:** add, rename and remove teams. Create groups (e.g. "4 groups" → Group A to D, or
  your own names), assign teams to groups one by one or with a **random draw**, and open each team's
  **squad**.
- **Squads:** paste players one per line as `10 John Okello FW` (shirt number and position are
  optional), then edit or remove them. Shirt numbers are unique within a team.
- **Schedule:**
  1. Playing dates: add them one at a time, or quick-fill a schedule such as "every 7 days, 10 dates".
  2. Generate fixtures. The format decides the structure: home and away in a league, a single meeting in groups. With groups, teams only play
     others in their group. **Any number of matches can be played on a day.** You can set a maximum
     per day, choose whether a team may play more than once a day, and list kick-off times
     (`10:00, 12:30, 15:00`) that are handed out in order each day.
- **Matches & results:** full create/read/update/delete for fixtures. Each match has **Edit** (a
  dialog to change teams, date, kick-off, venue or stage, before or after it's played),
  **Goals & cards**, and **Delete**. Add any match (including
  knockout matches such as "Semi-final" or "Final", which don't count toward the tables). Change
  teams, date, kick-off, venue or stage, delete matches, and enter scores quickly from the list.
  - On each match's **Details** page you can record goals (with an optional assist), own goals,
    and yellow and red cards, each with an optional minute. A warning appears if the goals
    recorded don't add up to the score.
- **Users & roles** (admin only): promote fans to officials or demote them.
- **Settings:** points for a win, draw and loss (default 3/1/0), how many top places to highlight,
  and how many bottom places to mark.

**Table rules:** points, then goal difference, then goals scored, then name. Only league/group matches
(no stage) count.

**Safeguards:** you can't remove a team that still has fixtures, or a player with recorded goals or
cards. Fixtures can't be regenerated once results exist unless you clear them, which asks for
confirmation first. A match's teams can't be changed once goals or cards are recorded, except to
swap home and away; the score swaps with them.

## Getting started

Requires **Node.js 22.13 or newer**.

```bash
npm install
cp .env.example .env.local     # then put your email in ADMIN_EMAIL
npm run dev                    # http://localhost:3000
```

Then click **Sign up** and create an account with the email you set as `ADMIN_EMAIL`. That account
becomes the **admin**. If the account already exists, it becomes admin the next time you sign in.

To explore with demo data (a home-and-away league and a group-stage cup with squads, results,
scorers and cards):

```bash
npm run seed
```

### Accounts and roles

| Role         | How you get it                                    | Can                                                            |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------- |
| **Fan**      | Anyone can sign up                                | Pick a favourite team (shown on the home page), manage account |
| **Official** | The admin promotes a user on **Users & roles**    | Everything a fan can, plus manage seasons, teams, fixtures, results |
| **Admin**    | Sign up or sign in with an `ADMIN_EMAIL` address  | Everything, plus promote or demote officials                   |

Passwords are hashed with scrypt, and sessions are stored in the database as hashes and last 30 days.
After 5 wrong passwords, an email is locked for 10 minutes. Demoting an official signs them out.

### Production

```bash
npm run build
ADMIN_EMAIL=you@example.com npm start
```

All data lives in one file, `data/league.db` (change it with `DB_FILE`). Back it up by copying that
file. The database upgrades itself automatically when a new version of the app starts. Host the app
on a server with a persistent disk (a VPS, Railway, Render with a disk, Fly.io with a volume).
Serverless hosts such as Vercel have no persistent filesystem.

## Scripts

| Command          | What it does                                                   |
| ---------------- | -------------------------------------------------------------- |
| `npm run dev`    | Start the development server                                   |
| `npm run build`  | Production build                                               |
| `npm start`      | Run the production build                                       |
| `npm test`       | Unit and integration tests (fixtures, scheduling, tables, groups, squads, events, stats, migrations) |
| `npm run seed`   | Add a demo season                                              |
| `npm run lint`   | ESLint                                                         |

## Project layout

The code is split into layers. Each layer only uses the ones above it in this list:

```
src/
  lib/                 business logic: no React, fully unit-tested
    fixtures.ts          round-robin generator (pure)
    scheduler.ts         places matches on dates: per-day cap, once-per-day rule, kick-off times (pure)
    standings.ts         points & table calculation (pure)
    league.ts            seasons, groups, teams, playing dates
    matches.ts           fixture CRUD, generation, results, match events, group tables
    players.ts           squads and player statistics
    schema.ts            versioned SQLite migrations
    validate.ts          input validation helpers, LeagueError
    users.ts             accounts, roles, password hashing, sessions
    insights.ts          home-page numbers: records, fair play, a team's snapshot, upcoming matches
    db.ts / auth.ts      database connection; sign-in cookies, current user, lock-out

  components/
    ui/                generic building blocks, no football knowledge (reuse anywhere)
                         Button/LinkButton, Card/Section, Field/Input/Select/Textarea/Checkbox,
                         Alert/Badge/EmptyState, PageHeader, Tabs, ConfirmDialog
    forms/             server-action helpers: ActionForm, SubmitButton (with `confirm`),
                         ActionButton, DeleteButton (built-in Cancel/Delete dialog), AutoSaveSelect
    league/            football display components shared by public and official pages:
                         StandingsTable, MatchList, MatchDayList, Scoreline, MatchTag, EventList, StatTable, SeasonNav
    official/          official-panel features: TeamList, GroupManager, SquadEditor, DateEditor,
                         FixtureGenerator, MatchFields, ResultForm, EventForm, SeasonForm, LoginForm
    home/              home page: Hero, Countdown, YourTeam, StatStrip, MiniTable, Podium, FairPlay, Records…
    auth/              SignInForm, SignUpForm, AuthShell, favourite-team options
    layout/            site header (with account menu) and footer

  app/                 routes only: fetch data, compose components
    actions.ts           server actions (every one checks the official is signed in)
    season/[id]/         public: table, fixtures, results, stats, teams, match pages
    signin/ signup/ account/   accounts
    official/            seasons, users & roles, per-season tabs (teams & groups, schedule, matches, settings)
test/                  node:test suite
scripts/seed.ts        demo data
```

**Conventions**

- Anything that deletes or overwrites data uses `DeleteButton`, or `SubmitButton` with `confirm={…}`.
  This opens a dialog with **Cancel** and **Confirm**. Esc or clicking outside cancels.
- Pages are built mobile-first. On phones, tables hide secondary columns, multi-field rows stack, and
  team names wrap instead of being cut off. Pages are checked at 360px width with no sideways scrolling.
- Import from the folder index, e.g. `import { Section, LinkButton } from "@/components/ui"`.
