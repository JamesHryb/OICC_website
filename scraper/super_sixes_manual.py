"""
Imperial Super Sixes - Manual Data Pipeline
Reads tournament data entered by scorers into a shared spreadsheet (published
to the web as CSV, one tab per data type) and builds data/super_sixes.json
for the website: group tables, knockout bracket, fixtures/results, scorecards
and stat leaderboards.

No PlayCricket dependency — this is the manual-entry pipeline described in
scraper/SUPER_SIXES_GUIDE.md.

Configure the four source CSV URLs via environment variables (see .env.example
in this folder), or via GitHub Actions repo variables of the same name. If
none are set, falls back to the local sample data in scraper/sample_data/ so
the page can be developed and previewed without a live spreadsheet.

Usage:
    python super_sixes_manual.py             # run once
    python super_sixes_manual.py --watch      # re-run every 60s (Ctrl+C to stop)
    python super_sixes_manual.py --watch --interval 30
"""

import csv
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SAMPLE_DIR = Path(__file__).resolve().parent / "sample_data"

# --- Tournament format — adjust to match the actual rules on the day ---
PLAYERS_PER_SIDE = 6
ALL_OUT_WICKETS = PLAYERS_PER_SIDE - 1
OVERS_PER_INNINGS = 5

POINTS_WIN = 2
POINTS_TIE = 1
POINTS_NO_RESULT = 1
POINTS_LOSS = 0

MIN_BALLS_FOR_STRIKE_RATE = 6
MIN_OVERS_FOR_ECONOMY = 2.0

GROUP_ROUNDS = {"Group A", "Group B"}
KNOCKOUT_ROUND_KEYS = {
    "Semi Final 1": "semiFinal1",
    "Semi Final 2": "semiFinal2",
    "Final": "final",
    "Wooden Spoon": "woodenSpoon",
}

SOURCES = {
    "teams": ("SUPER_SIXES_TEAMS_CSV_URL", "teams.csv"),
    "fixtures": ("SUPER_SIXES_FIXTURES_CSV_URL", "fixtures_results.csv"),
    "batting": ("SUPER_SIXES_BATTING_CSV_URL", "batting.csv"),
    "bowling": ("SUPER_SIXES_BOWLING_CSV_URL", "bowling.csv"),
}


# ── CSV loading ──────────────────────────────────────────────

def load_csv(key):
    """Fetch a published CSV tab, falling back to local sample data if unconfigured."""
    env_var, sample_file = SOURCES[key]
    url = os.getenv(env_var)
    if url:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        text = resp.content.decode("utf-8-sig")
        return list(csv.DictReader(io.StringIO(text)))

    sample_path = SAMPLE_DIR / sample_file
    print(f"  [{key}] {env_var} not set — using local sample data ({sample_path.name})")
    with open(sample_path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


# ── Small parsing helpers ────────────────────────────────────

def clean(val):
    return str(val).strip() if val is not None else ""


def safe_int(val, default=0):
    s = clean(val)
    if not s:
        return default
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return default


def overs_to_balls(overs_val):
    """Cricket overs notation (e.g. '7.4' = 7 overs, 4 balls) to total balls bowled."""
    s = clean(overs_val)
    if not s:
        return 0
    if "." in s:
        whole_s, ball_s = s.split(".", 1)
        whole = safe_int(whole_s)
        balls = safe_int(ball_s[:1]) if ball_s[:1].isdigit() else 0
        balls = min(max(balls, 0), 5)
    else:
        whole = safe_int(s)
        balls = 0
    return whole * 6 + balls


def balls_to_overs_str(balls):
    balls = max(balls, 0)
    return f"{balls // 6}.{balls % 6}"


def overs_to_decimal(overs_val):
    return overs_to_balls(overs_val) / 6.0


def clean_time(val):
    """Google Sheets exports time-formatted cells as HH:MM:SS — trim the seconds for display."""
    s = clean(val)
    if len(s) == 8 and s.count(":") == 2 and s.endswith(":00"):
        return s[:5]
    return s


# ── Teams ────────────────────────────────────────────────────

def load_teams():
    teams = []
    for r in load_csv("teams"):
        name = clean(r.get("Team"))
        group = clean(r.get("Group")).upper()
        if not name or not group:
            continue  # e.g. the "TBC" placeholder row (needed for the sheet's
            # Team1/Team2 dropdown) has no group and isn't a real competing team
        teams.append({"team": name, "group": group})
    return teams


# ── Matches (fixtures + results, one combined tab) ──────────

def compute_result(match):
    """Return {text, winner, type} for a match. type is one of:
    '' (not decided yet), 'win', 'tie', 'no_result', 'cancelled'.

    Team1/Team2 (match['teamA']/['teamB']) are the fixture's two fixed
    slots — which one actually batted first is a separate flag
    (match['battedFirst'], 1 or 2), since that's usually only decided by a
    toss on the day."""
    status = match["status"].lower()
    if status == "abandoned":
        return {"text": "Match Abandoned — No Result", "winner": None, "type": "no_result"}
    if status == "cancelled":
        return {"text": "Match Cancelled", "winner": None, "type": "cancelled"}
    if status != "complete":
        return {"text": "", "winner": None, "type": ""}

    a, b = match.get("teamAScore"), match.get("teamBScore")
    if not a or not b or a.get("runs") is None or b.get("runs") is None:
        return {"text": "", "winner": None, "type": ""}

    runs_a, runs_b = a["runs"], b["runs"]
    if runs_a == runs_b:
        return {"text": "Match Tied", "winner": None, "type": "tie"}

    a_won = runs_a > runs_b
    winner = match["teamA"] if a_won else match["teamB"]
    margin_runs = abs(runs_a - runs_b)

    batted_first = match.get("battedFirst")  # 1, 2, or None
    if batted_first not in (1, 2):
        return {"text": f"{winner} won", "winner": winner, "type": "win"}

    winner_batted_first = (batted_first == 1) == a_won
    if winner_batted_first:
        text = f"{winner} won by {margin_runs} run{'s' if margin_runs != 1 else ''}"
    else:
        winner_wkts = (a["wickets"] if a_won else b["wickets"]) or 0
        wkts_in_hand = max(ALL_OUT_WICKETS - winner_wkts, 0)
        text = f"{winner} won by {wkts_in_hand} wicket{'s' if wkts_in_hand != 1 else ''}"
    return {"text": text, "winner": winner, "type": "win"}


def load_matches():
    matches = []
    for r in load_csv("fixtures"):
        match_no = safe_int(r.get("MatchNo"))
        if not match_no:
            continue

        batted_first = safe_int(r.get("BattedFirst"), default=0)
        a_runs_s = clean(r.get("Team1_Runs"))
        b_runs_s = clean(r.get("Team2_Runs"))

        match = {
            "matchNo": match_no,
            "round": clean(r.get("Round")),
            "teamA": clean(r.get("Team1")) or "TBC",
            "teamB": clean(r.get("Team2")) or "TBC",
            "time": clean_time(r.get("Time")),
            "status": clean(r.get("Status")) or "Scheduled",
            "battedFirst": batted_first if batted_first in (1, 2) else None,
            "notes": clean(r.get("Notes")),
            "teamAScore": {
                "runs": safe_int(a_runs_s),
                "wickets": safe_int(r.get("Team1_Wickets")),
                "overs": clean(r.get("Team1_Overs")) or None,
            } if a_runs_s else None,
            "teamBScore": {
                "runs": safe_int(b_runs_s),
                "wickets": safe_int(r.get("Team2_Wickets")),
                "overs": clean(r.get("Team2_Overs")) or None,
            } if b_runs_s else None,
        }
        result = compute_result(match)
        match["resultText"] = result["text"]
        match["winner"] = result["winner"]
        match["resultType"] = result["type"]
        matches.append(match)

    matches.sort(key=lambda m: m["matchNo"])
    return matches


# ── Group tables ─────────────────────────────────────────────

def build_groups(teams, matches):
    stats = {
        t["team"]: {
            "team": t["team"], "group": t["group"],
            "played": 0, "won": 0, "lost": 0, "tied": 0, "noResult": 0,
            "points": 0, "runsFor": 0, "ballsFor": 0, "runsAgainst": 0, "ballsAgainst": 0,
        }
        for t in teams
    }

    for m in matches:
        if m["round"] not in GROUP_ROUNDS:
            continue
        status = m["status"].lower()
        if status not in ("complete", "abandoned"):
            continue
        team_a, team_b = m["teamA"], m["teamB"]
        if team_a not in stats or team_b not in stats:
            continue  # team not registered in the Teams tab — skip rather than crash

        sa, sb = stats[team_a], stats[team_b]
        sa["played"] += 1
        sb["played"] += 1

        if status == "abandoned" or m["resultType"] == "no_result":
            sa["noResult"] += 1
            sb["noResult"] += 1
            sa["points"] += POINTS_NO_RESULT
            sb["points"] += POINTS_NO_RESULT
            continue

        a, b = m["teamAScore"], m["teamBScore"]
        if not a or not b:
            continue

        # If a team was bowled out, their overs faced count as the full innings
        # allocation for run-rate purposes, not just the balls actually bowled.
        balls_a = OVERS_PER_INNINGS * 6 if (a["wickets"] or 0) >= ALL_OUT_WICKETS else overs_to_balls(a["overs"])
        balls_b = OVERS_PER_INNINGS * 6 if (b["wickets"] or 0) >= ALL_OUT_WICKETS else overs_to_balls(b["overs"])

        sa["runsFor"] += a["runs"]
        sa["ballsFor"] += balls_a
        sa["runsAgainst"] += b["runs"]
        sa["ballsAgainst"] += balls_b
        sb["runsFor"] += b["runs"]
        sb["ballsFor"] += balls_b
        sb["runsAgainst"] += a["runs"]
        sb["ballsAgainst"] += balls_a

        if m["resultType"] == "tie":
            sa["tied"] += 1
            sb["tied"] += 1
            sa["points"] += POINTS_TIE
            sb["points"] += POINTS_TIE
        elif m["winner"] == team_a:
            sa["won"] += 1
            sb["lost"] += 1
            sa["points"] += POINTS_WIN
        elif m["winner"] == team_b:
            sb["won"] += 1
            sa["lost"] += 1
            sb["points"] += POINTS_WIN

    for s in stats.values():
        rr_for = (s["runsFor"] / (s["ballsFor"] / 6.0)) if s["ballsFor"] else 0.0
        rr_against = (s["runsAgainst"] / (s["ballsAgainst"] / 6.0)) if s["ballsAgainst"] else 0.0
        s["nrr"] = round(rr_for - rr_against, 3)
        s["oversFor"] = balls_to_overs_str(s["ballsFor"])
        s["oversAgainst"] = balls_to_overs_str(s["ballsAgainst"])
        del s["ballsFor"]
        del s["ballsAgainst"]

    groups = {}
    for t in teams:
        groups.setdefault(t["group"], []).append(stats[t["team"]])
    for g in groups.values():
        g.sort(key=lambda s: (-s["points"], -s["nrr"], -s["runsFor"]))

    return groups


# ── Knockout bracket ─────────────────────────────────────────

def build_bracket(matches):
    bracket = {key: None for key in KNOCKOUT_ROUND_KEYS.values()}
    for m in matches:
        key = KNOCKOUT_ROUND_KEYS.get(m["round"])
        if key:
            bracket[key] = m
    return bracket


# ── Batting / bowling rows + scorecards ──────────────────────

def load_batting():
    rows = []
    for r in load_csv("batting"):
        match_no = safe_int(r.get("MatchNo"))
        player = clean(r.get("Player"))
        if not match_no or not player:
            continue
        balls_s = clean(r.get("Balls"))
        rows.append({
            "matchNo": match_no,
            "innings": safe_int(r.get("Innings")),
            "team": clean(r.get("Batting Team")),
            "player": player,
            "runs": safe_int(r.get("Runs")),
            "balls": safe_int(balls_s) if balls_s else None,
            "fours": safe_int(r.get("Fours")),
            "sixes": safe_int(r.get("Sixes")),
            "howOut": clean(r.get("HowOut")),
            "bowler": clean(r.get("Bowler")),
            "fielder": clean(r.get("Fielder")),
        })
    return rows


def is_out(how_out):
    return how_out.strip().lower() not in ("", "not out", "no", "n")


def format_how_out(b):
    how = b["howOut"].strip().lower()
    if not how or how in ("not out", "no", "n"):
        return "not out"
    if how in ("b", "bowled"):
        return f"b {b['bowler']}" if b["bowler"] else "bowled"
    if how in ("ct", "c", "caught"):
        if b["fielder"] and b["bowler"] and b["fielder"] == b["bowler"]:
            return f"c & b {b['bowler']}"
        if b["fielder"] and b["bowler"]:
            return f"c {b['fielder']} b {b['bowler']}"
        return "caught"
    if how == "lbw":
        return f"lbw b {b['bowler']}" if b["bowler"] else "lbw"
    if how in ("run out", "ro"):
        return f"run out ({b['fielder']})" if b["fielder"] else "run out"
    if how in ("st", "stumped"):
        return f"st {b['fielder']} b {b['bowler']}" if b["fielder"] and b["bowler"] else "stumped"
    if how in ("hw", "hit wicket"):
        return f"hit wicket b {b['bowler']}" if b["bowler"] else "hit wicket"
    return how


def load_bowling():
    rows = []
    for r in load_csv("bowling"):
        match_no = safe_int(r.get("MatchNo"))
        player = clean(r.get("Bowler"))
        if not match_no or not player:
            continue
        rows.append({
            "matchNo": match_no,
            "innings": safe_int(r.get("Innings")),
            "team": clean(r.get("Bowling Team")),
            "player": player,
            "overs": clean(r.get("Overs")) or "0.0",
            "maidens": safe_int(r.get("Maidens")),
            "runs": safe_int(r.get("Runs")),
            "wickets": safe_int(r.get("Wickets")),
        })
    return rows


def build_scorecards(matches, batting_rows, bowling_rows):
    # Keyed by (matchNo, innings) rather than team name — Innings 1/2 is an
    # explicit column on both tabs now, so this is immune to a team name typo
    # or a Batting-Team lookup formula returning something unexpected.
    bat_by_key, bowl_by_key = {}, {}
    for b in batting_rows:
        bat_by_key.setdefault((b["matchNo"], b["innings"]), []).append(b)
    for b in bowling_rows:
        bowl_by_key.setdefault((b["matchNo"], b["innings"]), []).append(b)

    for m in matches:
        # Team1/Team2 are fixed fixture slots; BattedFirst (1 or 2) says
        # which one's innings actually came first. Defaults to Team1 first
        # if BattedFirst hasn't been set yet (e.g. before the toss).
        if m.get("battedFirst") == 2:
            innings_map = [(1, m["teamB"], m["teamBScore"]), (2, m["teamA"], m["teamAScore"])]
        else:
            innings_map = [(1, m["teamA"], m["teamAScore"]), (2, m["teamB"], m["teamBScore"])]

        innings = []
        for inn_num, team, score in innings_map:
            inn_bat = bat_by_key.get((m["matchNo"], inn_num), [])
            inn_bowl = bowl_by_key.get((m["matchNo"], inn_num), [])
            if not inn_bat and not inn_bowl and not score:
                continue
            innings.append({
                "teamName": team,
                "runs": score["runs"] if score else None,
                "wickets": score["wickets"] if score else None,
                "overs": score["overs"] if score else None,
                "batting": [
                    {
                        "name": x["player"], "runs": x["runs"], "balls": x["balls"],
                        "fours": x["fours"], "sixes": x["sixes"],
                        "howOutText": format_how_out(x),
                    }
                    for x in inn_bat
                ],
                "bowling": [
                    {
                        "name": x["player"], "overs": x["overs"], "maidens": x["maidens"],
                        "runs": x["runs"], "wickets": x["wickets"],
                    }
                    for x in inn_bowl
                ],
            })
        m["scorecard"] = {"innings": innings} if innings else None


# ── Stat leaderboards ────────────────────────────────────────

def build_batting_leaders(batting_rows):
    agg = {}
    for b in batting_rows:
        p = agg.setdefault((b["player"], b["team"]), {
            "player": b["player"], "team": b["team"],
            "innings": 0, "runs": 0, "balls": 0, "dismissals": 0,
            "highScore": 0, "highScoreNotOut": False,
        })
        p["innings"] += 1
        p["runs"] += b["runs"]
        if b["balls"]:
            p["balls"] += b["balls"]
        out = is_out(b["howOut"])
        if out:
            p["dismissals"] += 1
        if b["runs"] >= p["highScore"]:
            p["highScore"] = b["runs"]
            p["highScoreNotOut"] = not out

    players = list(agg.values())
    for p in players:
        p["average"] = round(p["runs"] / p["dismissals"], 2) if p["dismissals"] else None
        p["strikeRate"] = round(p["runs"] / p["balls"] * 100, 1) if p["balls"] else None

    top_runs = sorted(players, key=lambda p: -p["runs"])[:5]
    top_avg = sorted(
        [p for p in players if p["average"] is not None],
        key=lambda p: -p["average"],
    )[:5]
    top_sr = sorted(
        [p for p in players if p["strikeRate"] is not None and p["balls"] >= MIN_BALLS_FOR_STRIKE_RATE],
        key=lambda p: -p["strikeRate"],
    )[:5]

    return {"topRunScorers": top_runs, "bestAverage": top_avg, "bestStrikeRate": top_sr}


def build_bowling_leaders(bowling_rows):
    agg = {}
    for b in bowling_rows:
        p = agg.setdefault((b["player"], b["team"]), {
            "player": b["player"], "team": b["team"],
            "innings": 0, "balls": 0, "runs": 0, "wickets": 0,
            "bestWickets": 0, "bestRuns": 0,
        })
        p["innings"] += 1
        p["balls"] += overs_to_balls(b["overs"])
        p["runs"] += b["runs"]
        p["wickets"] += b["wickets"]
        if (b["wickets"], -b["runs"]) > (p["bestWickets"], -p["bestRuns"]):
            p["bestWickets"] = b["wickets"]
            p["bestRuns"] = b["runs"]

    players = list(agg.values())
    for p in players:
        p["overs"] = balls_to_overs_str(p["balls"])
        p["average"] = round(p["runs"] / p["wickets"], 2) if p["wickets"] else None
        overs_dec = p["balls"] / 6.0
        p["economy"] = round(p["runs"] / overs_dec, 2) if overs_dec else None
        p["bestFigures"] = f"{p['bestWickets']}/{p['bestRuns']}" if p["innings"] else "-"
        del p["balls"]

    most_wkts = sorted(players, key=lambda p: -p["wickets"])[:5]
    best_avg = sorted(
        [p for p in players if p["wickets"] > 0],
        key=lambda p: p["average"],
    )[:5]
    best_econ = sorted(
        [p for p in players if p["economy"] is not None and overs_to_decimal(p["overs"]) >= MIN_OVERS_FOR_ECONOMY],
        key=lambda p: p["economy"],
    )[:5]

    return {"mostWickets": most_wkts, "bestAverage": best_avg, "bestEconomy": best_econ}


# ── Main ─────────────────────────────────────────────────────

def save_json(filename, data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    filepath = DATA_DIR / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved: {filepath}")


def main():
    print("=" * 60)
    print("  Imperial Super Sixes — Manual Data Pipeline")
    print("=" * 60)

    teams = load_teams()
    matches = load_matches()
    batting_rows = load_batting()
    bowling_rows = load_bowling()
    print(f"  Teams: {len(teams)}  Matches: {len(matches)}  "
          f"Batting rows: {len(batting_rows)}  Bowling rows: {len(bowling_rows)}")

    groups = build_groups(teams, matches)
    bracket = build_bracket(matches)
    build_scorecards(matches, batting_rows, bowling_rows)
    stats = {
        "batting": build_batting_leaders(batting_rows),
        "bowling": build_bowling_leaders(bowling_rows),
    }

    results = sorted(
        [m for m in matches if m["status"].lower() in ("complete", "abandoned", "cancelled")],
        key=lambda m: -m["matchNo"],
    )
    fixtures = sorted(
        [m for m in matches if m["status"].lower() == "scheduled"],
        key=lambda m: m["matchNo"],
    )
    live = [m for m in matches if m["status"].lower() == "live"]

    output = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "teams": teams,
        "groups": groups,
        "bracket": bracket,
        "matches": matches,
        "results": results,
        "fixtures": fixtures,
        "live": live,
        "stats": stats,
    }

    save_json("super_sixes.json", output)
    print("Done!")


def watch(interval):
    print(f"Watch mode: refreshing every {interval}s (Ctrl+C to stop)\n")
    try:
        while True:
            main()
            print(f"\n  Next refresh in {interval}s...\n")
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    if "--watch" in sys.argv:
        watch_interval = 60
        if "--interval" in sys.argv:
            idx = sys.argv.index("--interval")
            if idx + 1 < len(sys.argv):
                watch_interval = int(sys.argv[idx + 1])
        watch(watch_interval)
    else:
        main()
