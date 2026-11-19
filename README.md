# Abarilela Peace Cup

A league and tournament management platform in the style of a football league. Officials register
teams and squads, put teams in groups, enter playing dates and generate fixtures. They then record
results, goals, assists and cards. The site keeps the tables and player stats up to date.

Built with **Next.js 16** (App Router, Server Actions), **Tailwind CSS 4** and **Postgres** hosted on
**Supabase** (through the `pg` driver; the app has its own sign-in and doesn't use Supabase Auth).

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

**Which season is featured:** the season the admin pins (Settings → *Home page* → *Pin to the
home page*). If none is pinned, the season with the **soonest upcoming match** is chosen. If no
matches are upcoming, it's the season with the most recent result, or else the newest season. So
creating next year's season early doesn't replace the one still being played. A signed-in user's ⭐
*Your team* card always uses their team's own season, and *All competitions* lists every season.

The home page shows:

- a welcome banner, and a spotlight on the next match with a live countdown;
- your favourite team (position, points, form, last result, next match), for signed-in users;
- the season in numbers;
- latest results and upcoming fixtures;
- the top of the table, or the group leaders;
- the Golden Boot and playmaker races;
- the **Fair Play award** (fewest card points: yellow 1, red 3);
- season records (biggest win, most goals in a match);
- all competitions, with progress bars.

### Public site (anyone can view, no account needed)

There's no sign-up: visitors just view the site. Only people the admin creates accounts for
(officials, and any fans the admin adds) can sign in.

| Page        | What it shows                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| **Table**   | One league table, or one table per group. P, W, D, L, GF, GA, GD, Pts and last-5 form. Top N highlighted (default 4), optional bottom zone. Every column is always shown: on phones the table scrolls sideways with the position and team pinned on the left. |
| **Fixtures**| Upcoming matches by date with kick-off time, venue and group/stage, plus a **PDF of every team's fixtures** (one team per page). |
| **Results** | Played matches, newest first.                                                                                    |
| **Stats**   | Top scorers (with penalties), top assists, red cards, a full discipline table (yellow and red cards), and coaches' cards. |
| **Teams**   | Every team (by group) → coach, squad with shirt numbers, positions and each player's goals, assists and cards, plus the team's matches and a **fixtures PDF** to download or print. |
| **Match**   | Score, date, venue, referee, and a timeline of goals (with assists, or marked *pen*), own goals and cards (players' and coaches'). |

### Official panel (`/official`, password protected)

- **Seasons** (admin only): only the admin can create or delete a season.
- **Season officials** (admin only): in each season's **Settings → Officials**, the admin adds the
  officials who run that season, or removes them. An official sees **only the seasons they've been
  added to** in the panel, and can only change things in those seasons (teams, groups, squads,
  schedule, matches, results, events and season settings). Every change is checked on the server,
  not just hidden in the page. An official who hasn't been added to any season sees an empty panel.

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
  - On each match's **Details** page you can record goals (with an optional assist, or ticked as a
    **penalty**, which has no assist), own goals, and yellow and red cards, each with an optional
    minute. A card can go to a player or to the team's **coach** (the coach's name is kept on the
    card). A warning appears if the goals recorded don't add up to the score.
  - Each match can have a **referee**. Unlike the other details, the referee can still be added or
    corrected after the match has a score.
  - Each team's squad page has its **head coach** and a link to the team's fixtures PDF.
- **Users & roles** (admin only): full user management for fans and officials.
  - **Create** an account (username, display name, password, role, favourite team).
  - **Search** and browse users grouped as Admin, Officials and Fans.
  - **Edit** username, display name, role or favourite team, and **set a new password** (the
    user is signed out everywhere).
  - **Delete** an account (with confirmation).
  - Each official's seasons are listed under their name.
  - Demoting or deleting an official ends their access at once and takes them off every season
    (promoting them again doesn't give the seasons back). The admin account itself can't
    be edited or deleted here; it's managed on the Account page and with `npm run admin`.
- **Settings:** points for a win, draw and loss (default 3/1/0), how many top places to highlight,
  and how many bottom places to mark.

**Table rules:** points, then goal difference, then goals scored, then name. Only league/group matches
(no stage) count.

**Safeguards:** you can't remove a team that still has fixtures, or a player with recorded goals or
cards. Fixtures can't be regenerated once results exist unless you clear them, which asks for
confirmation first. A played match (one with a score) is locked: its teams, date, kick-off, venue and
stage can't be changed until the score is cleared. On an unplayed match, the teams can't be changed
once goals or cards are recorded, except to swap home and away.

## Getting started

Requires **Node.js 22.13 or newer** and a **Supabase** project (the free plan is fine).

1. **Create the tables.** In the Supabase dashboard, open **SQL Editor** and run each file in
   [`supabase/migrations/`](supabase/migrations) in name order: paste the whole file, then **Run**.
   They're safe to run again.
2. **Connect the app.** Copy `.env.example` to `.env.local` and set `DATABASE_URL` to your
   project's **Transaction pooler** connection string (dashboard → **Connect** → **Connection
   String**, port 6543), with your database password filled in. Set the same value in your
   hosting service's environment variables. Avoid the session pooler (port 5432): it allows only
   about 15 connections in total and runs out once the deployed app and a dev server share it.
3. **Install and start:**

```bash
npm install
npm run admin -- <username> <password>   # create your admin account
npm run dev                              # http://localhost:3000
```

If the tables are missing, the app and the scripts stop with a message saying which ones, instead
of failing on the first page.

Then **Sign in** with that username and password. The site has **exactly one admin**:

- `npm run admin -- <admin's username> <new password>` resets the admin's password (e.g. if forgotten).
- `npm run admin -- <other username> <password> --replace` hands the admin role to another account;
  the previous admin becomes a fan and is signed out.
- Any other attempt to create a second admin is refused, and the database itself allows only one.

To explore with demo data (a home-and-away league and a group-stage cup with squads, results,
scorers and cards):

```bash
npm run seed
```

### Accounts and roles

| Role         | How you get it                                    | Can                                                            |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------- |
| *Visitor*    | No account                                        | View every public page                                         |
| **Fan**      | The admin creates the account on **Users & roles** (there's no public sign-up) | Pick a favourite team (shown on the home page), manage account |
| **Official** | The admin creates or promotes the account, then adds it to seasons | Manage the teams, fixtures, results and settings of **their** seasons only |
| **Admin**    | Exactly one, set on the server with `npm run admin` | Everything: create and delete seasons, add officials to seasons, manage users |

Accounts use a **username** (3–30 letters, numbers, dots, dashes or underscores; capitals don't
matter) and a password of at least 8 characters. No email is collected. Passwords are hashed with
scrypt, and sessions are stored in the database as hashes and last 30 days. After 5 wrong passwords,
that username is locked for 10 minutes. Demoting an official signs them out.

### The database

- **Schema changes** are SQL files in `supabase/migrations/`, named `<timestamp>_<what>.sql`. The app
  never changes the schema itself: when a new file arrives, run it in the SQL Editor. Never edit a
  file that has been run; add a new one with a later timestamp.
- **Row-level security** is on for every table with no policies. The app connects as the database
  owner, so it isn't affected, but Supabase's public API keys can't read or change anything (for
  example users' password hashes).
- **Starting over:** [`supabase/reset_data.sql`](supabase/reset_data.sql) deletes every season and
  everything in it, keeping user accounts. It has a commented-out line that also removes the
  accounts. There's no undo, so download a backup first (dashboard → **Database → Backups**).
- **Moving from the old SQLite version:** after creating the tables, run `npm run db:copy-sqlite`.
  It copies everything from `data/league.db` (or `DB_FILE`) into Supabase, keeping ids and
  password hashes, so everyone can still sign in. It only copies into empty tables and does it
  all in one transaction, so it never overwrites anything. The SQLite file is left as a backup.
- **Connections:** the connection is always encrypted. Set `DATABASE_SSL_CA` to Supabase's CA
  certificate to also verify the server (see `.env.example`).

### Production

```bash
npm run build
npm run admin -- <username> <password>   # once
npm start
```

The data lives in Supabase, so the app needs no disk of its own and can run on any Node host,
serverless ones such as Vercel included.

## Scripts

| Command          | What it does                                                   |
| ---------------- | -------------------------------------------------------------- |
| `npm run dev`    | Start the development server                                   |
| `npm run build`  | Production build                                               |
| `npm start`      | Run the production build                                       |
| `npm test`       | Unit and integration tests against an in-memory Postgres (PGlite) built from `supabase/migrations`, so no database server is needed |
| `npm run seed`   | Add demo seasons                                               |
| `npm run admin -- <user> <pass> [--replace]` | Create the one admin, reset its password, or hand the role over |
| `npm run db:copy-sqlite` | One-off: copy the old SQLite `data/league.db` into Supabase |
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
    schema.ts            reads supabase/migrations; checks the tables exist
    sql.ts / pg.ts       small async database interface (`?` placeholders, transactions); pg pool for Supabase
    validate.ts          input validation helpers, LeagueError
    users.ts             accounts, roles, password hashing, sessions
    officials.ts         which officials manage which season; finds the season a record belongs to
    insights.ts          home-page numbers: records, fair play, a team's snapshot, upcoming matches
    pdf.ts               a team's fixtures as a PDF (A4 landscape, built with pdf-lib)
    db.ts / auth.ts      the app's shared connection; sign-in cookies, current user, lock-out

  components/
    ui/                generic building blocks, no football knowledge (reuse anywhere)
                         Button/LinkButton, Card/Section, Field/Input/Select/Textarea/Checkbox,
                         Alert/Badge/EmptyState, PageHeader, Tabs, ConfirmDialog
    forms/             server-action helpers: ActionForm, SubmitButton (with `confirm`),
                         ActionButton, DeleteButton (built-in Cancel/Delete dialog), AutoSaveSelect
    league/            football display components shared by public and official pages:
                         StandingsTable, MatchList, MatchDayList, Scoreline, MatchTag, EventList, StatTable, SeasonNav
    admin/             admin-only user management: UserDirectory (search, edit dialog, delete), AddUserForm, UserFields
    official/          official-panel features: TeamList, GroupManager, SquadEditor, DateEditor,
                         FixtureGenerator, MatchFields, ResultForm, EventForm, SeasonForm, SeasonOfficials
    home/              home page: Hero, Countdown, YourTeam, StatStrip, MiniTable, Podium, FairPlay, Records…
    auth/              SignInForm, AuthShell, favourite-team options
    layout/            site header (with account menu) and footer

  app/                 routes only: fetch data, compose components
    actions.ts           server actions (each checks the user may manage that season, or is the admin)
    season/[id]/         public: table, fixtures, results, stats, teams, match pages;
                           fixtures.pdf and teams/[teamId]/fixtures.pdf download the fixture PDFs
    signin/ account/     accounts
    official/            seasons, users & roles, per-season tabs (teams & groups, schedule, matches, settings)
supabase/
  migrations/          the schema as SQL files, run in the Supabase SQL Editor in name order
  reset_data.sql       delete all league data, keeping accounts
test/                  node:test suite (pglite.ts: in-memory Postgres for the tests)
scripts/
  seed.ts admin.ts     demo data; the one admin account
  copy-sqlite-to-postgres.ts, sqlite/   one-off copy from the old SQLite database
```

**Conventions**

- Anything that deletes or overwrites data uses `DeleteButton`, or `SubmitButton` with `confirm={…}`.
  This opens a dialog with **Cancel** and **Confirm**. Esc or clicking outside cancels.
- Pages are built mobile-first. On phones, tables hide secondary columns, multi-field rows stack, and
  team names wrap instead of being cut off. Pages are checked at 360px width with no sideways scrolling.
- Import from the folder index, e.g. `import { Section, LinkButton } from "@/components/ui"`.
