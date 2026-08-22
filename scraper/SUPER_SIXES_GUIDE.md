# Imperial Super Sixes — Setup & Scoring Guide

How the live tournament page at `pages/super-sixes.html` gets its data, how to
set it up before the day, and how scorers enter results on the day itself.

## How it works, in one sentence

Scorers fill in a shared Google Sheet (on their phone or a laptop) → a
GitHub Action reads it automatically every few minutes → it rebuilds
`data/super_sixes.json` → the website reads that file. Nobody needs to touch
code or Git on the day.

## Why a spreadsheet, and why not live ball-by-ball scoring

You asked about scoring matches natively in the browser. It's possible in
principle, but it needs real infrastructure to do properly — a live database
for scorers to write to reliably, offline handling for patchy signal at the
ground, and a scoring UI that's been tested under real match conditions.
Building and trusting all of that for the first time, for one event, eight
days out, is a real risk of something breaking *during* the tournament with
no fallback.

The spreadsheet approach instead builds on what you're already going to have
regardless: a paper scoresheet. Someone transcribes the final numbers after
each match — not every ball, just the abbreviated scorecard
(each batter's runs/balls/how out, each bowler's figures, and the two team
totals). That's a couple of minutes of typing per match, it works from a
phone with patchy signal (the sheet syncs when it can), and if a phone dies
or someone makes a typo, the paper scoresheet is still the source of truth
and it's a one-line fix in the sheet. If there's appetite for building a real
live-scoring tool, that's a good project for a future season with more lead
time — not this one.

## One-time setup (before 23 August)

1. **Create the Google Sheet.** In Google Drive: `New → File upload`, upload
   `scraper/templates/super_sixes_template.xlsx`, then double-click it and
   choose `Open with → Google Sheets`. This gives you a Sheet with 6 tabs:
   `Instructions`, `Teams`, `Players`, `Fixtures_Results`, `Batting`,
   `Bowling` — with the column layout and a starter fixture list already
   filled in.
2. **Fill in `Teams`** with the real team names and their group (A/B).
3. **Fill in `Players`** with every player and which team they're on. Once
   both `Teams` and `Players` are filled in, the Team/Player columns on the
   other tabs become dropdowns automatically (they're wired up to read from
   these two tabs) — scorers pick from a list instead of typing names,
   which avoids the typos that would otherwise fork someone's stats into two
   separate entries.
4. **Fill in `Fixtures_Results`** — replace the placeholder team names for
   the group matches with real ones (pick from the dropdown). Whichever team
   you put in **Team1** is the one that batted first (or will) — there's no
   separate "who batted first" field, that's the convention now. Leave the
   semi-final/final/3rd-place/wooden-spoon rows as `TBC` for now; you'll
   fill those in once the group stage tells you who's playing who.
5. **Share it** so the scorers can edit it: `Share` → anyone with the link
   set to **Editor** (or share directly with named scorers — either works).
6. **Publish each tab as CSV** (this is what the website actually reads —
   it's separate from the "Share" step above):
   - `File → Share → Publish to web`
   - In the dropdown, select the sheet tab (e.g. `Teams`) — not "Entire
     Document"
   - Set format to **Comma-separated values (.csv)**
   - Click **Publish**, confirm, and copy the URL it gives you
   - Repeat for `Fixtures_Results`, `Batting`, and `Bowling` (4 URLs total —
     you don't need to publish `Instructions`)
   - These URLs are not secret (anyone with the link can view, not edit) —
     that's fine, it's the same data the public website shows anyway
7. **Configure the 4 URLs** so the GitHub Action can find them. In the
   `OICC_website` GitHub repo: `Settings → Secrets and variables → Actions →
   Variables tab → New repository variable`, and add each of:
   - `SUPER_SIXES_TEAMS_CSV_URL`
   - `SUPER_SIXES_FIXTURES_CSV_URL`
   - `SUPER_SIXES_BATTING_CSV_URL`
   - `SUPER_SIXES_BOWLING_CSV_URL`

   (Use *Variables*, not *Secrets* — these aren't sensitive, and Variables
   are easier to read back and edit if a URL needs fixing.)
8. **Test it**: go to the **Actions** tab → **Update Super Sixes Data** →
   **Run workflow**. After it finishes, check that `data/super_sixes.json`
   updated with your real team names.

## On the day

**Scorer's job, once a match finishes:**

1. Open the Google Sheet — the Sheets **mobile app** (iOS/Android) works
   fine for this, or a laptop if one's around. No special app or login
   beyond a Google account with edit access.
2. Find that match's row in `Fixtures_Results` and set **Status** to
   `Complete`, then fill in both teams' runs/wickets/overs. This is what
   lets the site correctly say "won by 3 wickets" vs "won by 12 runs" —
   Team1 (whichever team you entered first) is always treated as having
   batted first.
3. Add one row per batter to `Batting` and one row per bowler to `Bowling`,
   using the same `MatchNo` as the fixture row plus **Innings** (`1` or `2`
   — which of the two innings this entry belongs to). You don't need to pick
   the team separately — it's worked out automatically from the fixture, and
   the Player/Bowler/Fielder dropdowns are already filtered to the right
   squad once you've set Innings. Use the dropdowns rather than typing names
   — a typo'd name will fork the stats and table for that "new" entry.
4. If it's a **knockout match still marked TBC**, fill in the real team
   names in `Fixtures_Results` as soon as they're known (as soon as the
   group stage / previous round decides them) — the bracket and semi-final
   info picks this up on the next refresh.

A `Live` status is also supported — set it while a match is in progress
(with partial score/overs filled in) and the site shows a "LIVE NOW" banner
at the top. Optional, but nice if someone has a spare minute mid-innings.

**Standings and the knockout matchups are not auto-decided by the site** —
group tie-breaks and "who plays who" in the semis are for a human to
resolve and type in. This is deliberate: cricket has enough edge cases
(rain, ties, forfeits) that a person's judgement on the day is more
trustworthy than logic no one has stress-tested.

## Optional: the Scorer App and direct submission

`pages/super-sixes-scorer.html` (linked from nowhere public — open it directly,
e.g. `https://oldimperials.cc/pages/super-sixes-scorer.html`) is a ball-by-ball
scoring tool a scorer can run on their own phone. It's an aid for arriving at
accurate numbers faster than paper, not a replacement for this spreadsheet —
everything below assumes you're still using `Fixtures_Results`/`Batting`/
`Bowling` as the source of truth; the app just gets data into them two ways:

1. **Copy-paste** (always available, no setup): its Export screen generates
   paste-ready blocks matching this sheet's exact columns — works with zero
   configuration, same reliability as typing the numbers in by hand.
2. **Direct submission** (optional, one-time setup below): a "Submit to
   Sheet" button that writes the scorecard straight into this sheet over the
   network, skipping the copy-paste step. It's genuinely optional — if you
   don't set this up, or a submission fails for any reason (patchy signal,
   typo'd URL), the copy-paste blocks are still right there on the same
   screen as a fallback. Nothing about the manual pipeline changes either
   way.

**Setting up direct submission** (do this once, in the actual Google Sheet):

1. Open the tournament Google Sheet → **Extensions → Apps Script**.
2. Delete any starter code in `Code.gs`, and paste in the full contents of
   `scraper/apps-script/Code.gs` from this repo instead.
3. **Deploy → New deployment** → gear icon → type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, authorize when Google prompts (it'll warn the app is
   unverified — expected for a script you wrote yourself, not a real risk
   here), then copy the **Web app URL** (ends in `/exec`).
5. In the scorer app, open a match → **Export for the Sheet** → paste that
   URL into **Apps Script URL** → **Save URL** → **Test Connection** to
   confirm it's wired up correctly before relying on it.
6. If you edit `Code.gs` later: **Deploy → Manage deployments** → pencil icon
   → **New version** → Deploy. Saving alone does *not* update the live
   `/exec` URL's behaviour.

The script writes into `Fixtures_Results`/`Batting`/`Bowling` by matching
column headers (not fixed positions), so it never touches the
`Batting Team`/`Bowling Team` formula columns, and it upserts batting/bowling
rows by MatchNo + Innings + Player — resubmitting after a correction updates
the existing row rather than duplicating it. It never deletes rows.

## Abandoned matches

If a match gets abandoned (rain, etc.), the scorer app has a **"Mark as
Abandoned"** button (Scorecard screen, or Match Settings) as an alternative
to the normal "Mark Match as Finished" — it sets `Status` to `Abandoned`
instead of `Complete`. If you're entering results by hand instead, just set
**Status** to `Abandoned` directly in `Fixtures_Results` — same effect.

Either way, `super_sixes_manual.py` already treats `Abandoned` as a no-result:
both teams get 1 point each (the same as a tie), tracked separately from wins/
ties/losses in the group table, and no winner is declared. No further setup
needed for this — it's been supported since the pipeline was first built.

## Update frequency

- **Automatic:** every 5 minutes between 08:00–19:55 UTC (09:00–20:55 BST)
  on 23 August only — the site itself also silently re-fetches the data
  every 60 seconds while a browser tab is open, so anyone watching the page
  sees each new automatic scrape shortly after it lands.
- **Manual:** anyone with repo access can trigger an immediate update from
  **Actions → Update Super Sixes Data → Run workflow** — useful right after
  a result goes in rather than waiting for the next 5-minute tick.
- GitHub's schedule is best-effort — under load it can occasionally run a
  few minutes late. That's what the manual trigger is for.
- If you want faster-than-5-minutes updates on the day, a Google Apps
  Script trigger on the sheet (`onEdit`) can call the GitHub Actions API to
  fire the workflow immediately on every edit, instead of waiting for the
  cron tick. Not set up by default since it needs a GitHub personal access
  token stored in Apps Script — ask if you want this wired up.

## Testing locally, without a live spreadsheet

The pipeline falls back to sample data in `scraper/sample_data/` if the 4
CSV URLs aren't configured, so you can preview the whole page before the
real sheet exists. Run these from the `OICC` project folder:

```bash
cd scraper
pip install -r requirements.txt
python super_sixes_manual.py
cd ..
python -m http.server 8000
```

Then open `http://localhost:8000/pages/super-sixes.html` in a browser —
`http.server` doesn't open one for you, and it needs to be started from the
`OICC` folder itself (not from inside `scraper/`) or the page's paths won't
resolve.

## Running a live rehearsal (people entering scores as if it's the day)

This exercises the exact same path real scoring will use — spreadsheet →
CSV → pipeline → JSON → page — just pointed at a real (test) sheet instead
of the sample data, and refreshed on a timer instead of once.

1. Do the **one-time setup** above for real (or use a scratch copy of the
   template so you don't have to clear test data out of the real sheet
   afterwards) — you need actual published CSV URLs for this to work, the
   local sample data doesn't update when you edit a sheet.
2. Point your local pipeline at those URLs: copy `scraper/.env.example` to
   `scraper/.env` and paste the 4 CSV URLs in.
3. Run the pipeline in **watch mode** so it keeps re-fetching without you
   re-running it by hand:
   ```bash
   cd scraper
   python super_sixes_manual.py --watch
   # or: python super_sixes_manual.py --watch --interval 30
   ```
   Leave this running — it re-pulls the sheet and rewrites
   `data/super_sixes.json` every 60 seconds (or whatever `--interval` you
   set) until you press Ctrl+C.
4. In another terminal, from the `OICC` folder: `python -m http.server
   8000`, then open `http://localhost:8000/pages/super-sixes.html`. The
   page itself re-fetches every 60 seconds too, so once watch mode has
   picked up an edit, an open browser tab reflects it shortly after —
   exactly like it will on the day.
5. Have your test scorers open the Google Sheet on their phones and start
   editing rows. Watch the page update on its own.

**If you want other people to view the page on their own phones/laptops**
during the rehearsal (not just on your machine), run the server bound to
your network instead of just localhost:
```bash
python -m http.server 8000 --bind 0.0.0.0
```
Then anyone on the same Wi-Fi can visit `http://<your-computer's-IP>:8000/pages/super-sixes.html`
(find your IP with `ipconfig` on Windows, look for "IPv4 Address"). This
doesn't touch the real live site or GitHub at all — it's purely local.

**If you specifically want to test the real GitHub Actions + Pages path**
(rather than just the data pipeline logic), you can — but note the
scheduled cron only fires on 23 August, so on any other date you'd need to
trigger it manually each time: **Actions → Update Super Sixes Data → Run
workflow**, after each edit, instead of it firing automatically every 5
minutes. The local watch-mode rehearsal above is the faster way to test
everything except that specific scheduling detail.

## Column reference

**Teams**: `Team, Group`

**Players**: `Player, Team` — reference list, feeds the dependent Player
dropdown on Batting/Bowling (each team's players are a named block on this
tab). Not cross-checked against Teams, so it's fine even if squads change
slightly on the day.

**Fixtures_Results**: `MatchNo, Round, Team1, Team2, Time, Status,
TeamA_Runs, TeamA_Wickets, TeamA_Overs, TeamB_Runs, TeamB_Wickets,
TeamB_Overs, Notes`
- `Round` must exactly match one of: `Group A`, `Group B`, `Semi Final 1`,
  `Semi Final 2`, `3rd Place Playoff`, `Final`, `Wooden Spoon`
- `Status`: `Scheduled` / `Live` / `Complete` / `Abandoned` / `Cancelled`
- **Team1 is always the team that batted first** — there's no separate flag
  for it, so get the order right when you fill this in
- `Overs`: cricket notation, e.g. `4.4` = 4 overs and 4 balls

**Batting**: `MatchNo, Innings, Batting Team, Bowling Team, Player, Runs,
Balls, Fours, Sixes, HowOut, Bowler, Fielder`
- `Innings`: `1` or `2` — which of the match's two innings this row is from
- `Batting Team` / `Bowling Team` are computed automatically from MatchNo +
  Innings (looked up against Fixtures_Results) — you don't fill these in,
  and the Player/Bowler/Fielder dropdowns are filtered from them
- `HowOut`: `not out` / `b` / `ct` / `lbw` / `run out` / `st` / `hw`
  (`Bowler`/`Fielder` only needed where relevant, e.g. blank for `run out`
  with no fielder noted)

**Bowling**: `MatchNo, Innings, Bowling Team, Bowler, Overs, Maidens, Runs,
Wickets`
- Same `MatchNo`/`Innings` idea as Batting; `Bowling Team` is computed the
  same way, and `Bowler` (the player name) is dropdown-filtered from it

## Tournament format assumptions

`scraper/super_sixes_manual.py` assumes 6-a-side (all out = 5 wickets) and
**5-over innings**, used for the Net Run Rate calculation (a team bowled out
before using all their overs is credited with the full 5 overs for NRR
purposes, per standard cricket convention). If the actual format changes,
adjust `PLAYERS_PER_SIDE` / `OVERS_PER_INNINGS` near the top of that file
before the day.
