"""
OICC PlayCricket Integration
Fetches fixtures, results, scorecards, and player stats from the official
PlayCricket API using pyplaycricket, then exports to JSON for the website.

Usage:
    python oicc_playcricket.py                  # Fetch current season
    python oicc_playcricket.py --season 2025    # Fetch specific season
    python oicc_playcricket.py --all            # Fetch all data inc. players
"""

import json
import math
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv
from playcric.playcricket import pc

# Load environment variables
load_dotenv(Path(__file__).parent / ".env")

API_KEY = os.getenv("PLAY_CRICKET_API_KEY")
SITE_ID = int(os.getenv("OICC_SITE_ID", 0))
OUTPUT_DIR = Path(__file__).parent.parent / "data"
CURRENT_YEAR = datetime.now().year
CLUB_NAME = "Old Imperials CC"


def get_client():
    """Create and return a PlayCricket API client."""
    if not API_KEY or not SITE_ID:
        print("ERROR: Missing PLAY_CRICKET_API_KEY or OICC_SITE_ID in .env")
        sys.exit(1)
    return pc(api_key=API_KEY, site_id=SITE_ID)


def is_oicc(name):
    """Check if a team/club name belongs to Old Imperials."""
    return "old imperials" in str(name).lower()


def sanitise_value(val):
    """Replace NaN/Infinity with None for JSON compatibility."""
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def df_to_dict(df):
    """Safely convert a pandas DataFrame to a list of JSON-safe dicts."""
    if df is None:
        return []
    try:
        records = df.to_dict(orient="records")
        return [{k: sanitise_value(v) for k, v in row.items()} for row in records]
    except Exception:
        return []


def determine_match_type(match):
    """Determine match type from competition/match data."""
    comp = str(match.get("competition_name", "")).lower()
    mtype = str(match.get("match_type", "")).lower()
    home = str(match.get("home_team_name", "")).lower()
    away = str(match.get("away_team_name", "")).lower()

    if "t20" in comp or "twenty" in mtype or "twenty20" in home or "twenty20" in away:
        return "T20"
    if "cup" in comp or "trophy" in comp:
        return "Cup"
    if "friendly" in comp or "friendly" in home or "friendly" in away:
        return "Friendly"
    return "League"


def is_victoria_park(ground):
    """Return True if the ground is a Victoria Park pitch (8-a-side league)."""
    return "victoria park" in str(ground).lower()


def fetch_innings_scores(client, match_id, max_wickets=10):
    """Fetch innings scores and compute win/loss margin from batting order.

    max_wickets should be 8 for Victoria Park (8-a-side) games, 10 otherwise.
    """
    oicc_score = ""
    opp_score = ""
    result_margin = ""
    try:
        innings_df = client.get_innings_total_scores(match_id=int(match_id))
        if innings_df is None or innings_df.empty:
            return oicc_score, opp_score, result_margin

        # Sort by innings number if the column exists so first innings is first
        if "innings_number" in innings_df.columns:
            innings_df = innings_df.sort_values("innings_number")

        innings = []
        for _, inn in innings_df.iterrows():
            team = str(inn.get("team_batting_name", ""))
            runs = int(inn.get("runs", 0) or 0)
            wickets = int(inn.get("wickets", 0) or 0)
            overs = inn.get("overs", "")

            score = f"{runs}/{wickets}"
            if overs:
                score += f" ({overs} ov)"

            innings.append({"runs": runs, "wickets": wickets, "is_oicc": is_oicc(team)})

            if is_oicc(team):
                oicc_score = score
            else:
                opp_score = score

        # Compute margin from batting order (innings[0] batted first)
        if len(innings) == 2:
            first, second = innings[0], innings[1]
            if first["is_oicc"]:
                # OICC batted first
                diff = first["runs"] - second["runs"]
                if diff > 0:
                    result_margin = f"Won by {diff} run{'s' if diff != 1 else ''}"
                elif diff < 0:
                    wkts = max_wickets - second["wickets"]
                    result_margin = f"Lost by {wkts} wicket{'s' if wkts != 1 else ''}"
            else:
                # OICC batted second
                diff = second["runs"] - first["runs"]
                if diff > 0:
                    wkts = max_wickets - second["wickets"]
                    result_margin = f"Won by {wkts} wicket{'s' if wkts != 1 else ''}"
                elif diff < 0:
                    result_margin = f"Lost by {abs(diff)} run{'s' if abs(diff) != 1 else ''}"

    except Exception as e:
        print(f"    Could not fetch innings for match {match_id}: {e}")

    return oicc_score, opp_score, result_margin


def fetch_match_result(match_id):
    """Fetch match result directly from the PlayCricket API."""
    result_text = ""
    result_status = ""
    try:
        url = (
            f"https://www.play-cricket.com/api/v2/match_detail.json"
            f"?match_id={int(match_id)}&api_token={API_KEY}"
        )
        resp = requests.get(url, timeout=15)
        data = resp.json()
        details = data.get("match_details", [])
        if isinstance(details, list) and len(details) > 0:
            d = details[0]
            result_letter = str(d.get("result", "")).strip()
            result_desc = str(d.get("result_description", "")).strip()
            result_applied = str(d.get("result_applied_to", "")).strip()

            result_text = result_desc if result_desc else ""

            # Determine status from result letter
            if result_letter == "A":
                result_status = "abandoned"
            elif result_letter == "C":
                result_status = "cancelled"
            elif result_letter in ("D",):
                result_status = "tie"
            elif result_letter == "T":
                result_status = "tie"
            elif result_letter == "W" and result_applied:
                # Check if our team won by comparing result_applied_to with OICC team IDs
                # result_applied_to is the team_id of the winner
                result_status = "won"  # Will be refined below
            elif result_letter == "":
                result_status = ""

            # Check for "Trophy Shared" via description (covers any result letter)
            if "trophy shared" in result_desc.lower():
                result_status = "shared"

            # For wins, check if the winning team is OICC
            if result_letter == "W" and result_applied:
                home_team = str(d.get("home_team_id", ""))
                away_team = str(d.get("away_team_id", ""))
                home_club = str(d.get("home_club_name", ""))

                oicc_team_id = home_team if is_oicc(home_club) else away_team
                if result_applied == oicc_team_id:
                    result_status = "won"
                else:
                    result_status = "lost"
    except Exception as e:
        print(f"    Could not fetch result for match {match_id}: {e}")

    return result_text, result_status


def process_matches(client, matches_df):
    """Process matches into fixtures and results."""
    fixtures = []
    results = []

    if matches_df is None or matches_df.empty:
        return fixtures, results

    for _, match in matches_df.iterrows():
        match_id = match.get("id")
        match_date_raw = match.get("match_date")
        match_time = str(match.get("match_time", "")) or "TBC"
        ground = str(match.get("ground_name", "")) or "TBC"
        home_team = str(match.get("home_team_name", ""))
        away_team = str(match.get("away_team_name", ""))
        home_club = str(match.get("home_club_name", ""))
        away_club = str(match.get("away_club_name", ""))
        competition = str(match.get("competition_name", ""))

        # Determine which side is OICC
        oicc_is_home = is_oicc(home_club)
        opponent_club = away_club if oicc_is_home else home_club
        opponent_team = away_team if oicc_is_home else home_team

        # Build display name for opponent
        oicc_display = CLUB_NAME
        if opponent_club:
            opp_display = opponent_club
        else:
            opp_display = opponent_team

        match_type = determine_match_type(match)

        # Parse date
        try:
            if hasattr(match_date_raw, "strftime"):
                match_dt = match_date_raw
            else:
                match_dt = datetime.strptime(str(match_date_raw)[:10], "%Y-%m-%d")
        except (ValueError, TypeError):
            match_dt = None

        if match_dt:
            display_date = match_dt.strftime("%#d %B %Y") if os.name == "nt" else match_dt.strftime("%-d %B %Y")
            iso_date = match_dt.strftime("%Y-%m-%d")
            day_name = match_dt.strftime("%a").upper()
            day_num = match_dt.strftime("%d")
            month_short = match_dt.strftime("%b").upper()
        else:
            display_date = str(match_date_raw)
            iso_date = str(match_date_raw)
            day_name = day_num = month_short = ""

        is_future = match_dt and match_dt.date() >= datetime.now().date()

        if is_future:
            fixtures.append({
                "date": iso_date,
                "displayDate": display_date,
                "dayName": day_name,
                "dayNum": day_num,
                "monthShort": month_short,
                "homeTeam": oicc_display if oicc_is_home else opp_display,
                "awayTeam": opp_display if oicc_is_home else oicc_display,
                "venue": ground,
                "time": match_time,
                "type": match_type,
                "competition": competition,
                "matchId": match_id,
            })
        else:
            # Past match - fetch scores and result
            print(f"    Fetching: {display_date} vs {opp_display}...")
            max_wkts = 8 if is_victoria_park(ground) else 10
            oicc_score, opp_score, result_margin = fetch_innings_scores(client, match_id, max_wickets=max_wkts)
            result_text, result_status = fetch_match_result(match_id)

            results.append({
                "date": display_date,
                "isoDate": iso_date,
                "homeTeam": oicc_display if oicc_is_home else opp_display,
                "homeScore": oicc_score if oicc_is_home else opp_score,
                "awayTeam": opp_display if oicc_is_home else oicc_display,
                "awayScore": opp_score if oicc_is_home else oicc_score,
                "result": result_status,
                "resultMargin": result_margin,
                "resultText": result_text or "",
                "venue": ground,
                "type": match_type,
                "competition": competition,
                "matchId": match_id,
            })

    fixtures.sort(key=lambda x: x.get("date", ""))
    results.sort(key=lambda x: x.get("isoDate", ""), reverse=True)
    return fixtures, results


def get_oicc_team_ids(matches_df):
    """Extract all OICC team IDs from match data."""
    team_ids = set()
    if matches_df is None or matches_df.empty:
        return list(team_ids)

    for _, match in matches_df.iterrows():
        home_club = str(match.get("home_club_name", ""))
        away_club = str(match.get("away_club_name", ""))
        if is_oicc(home_club):
            tid = match.get("home_team_id")
            if tid:
                team_ids.add(int(tid))
        if is_oicc(away_club):
            tid = match.get("away_team_id")
            if tid:
                team_ids.add(int(tid))

    return list(team_ids)


def compute_best_bowling(client, match_ids, oicc_team_ids):
    """Compute best bowling figures (wickets/runs) from individual match data."""
    best = {}  # bowler_id -> (wickets, runs)
    try:
        _, bowling_df, _ = client.get_individual_stats_from_all_games(
            match_ids=match_ids, team_ids=oicc_team_ids
        )
        if bowling_df is None or bowling_df.empty:
            return best

        for _, row in bowling_df.iterrows():
            bid = str(row.get("bowler_id", ""))
            wkts = int(row.get("wickets", 0))
            runs = int(row.get("runs", 0))
            # Best = most wickets, then fewest runs
            if bid not in best or (wkts, -runs) > (best[bid][0], -best[bid][1]):
                best[bid] = (wkts, runs)
    except Exception as e:
        print(f"    Could not compute best bowling: {e}")
    return best


def fetch_season_stats(client, matches_df):
    """Fetch aggregated season batting and bowling stats (OICC players only)."""
    stats = {"batting": [], "bowling": [], "fielding": []}
    if matches_df is None or matches_df.empty:
        return stats

    try:
        match_ids = matches_df["id"].tolist()
        match_ids = [int(mid) for mid in match_ids if mid]
        if not match_ids:
            return stats

        oicc_team_ids = get_oicc_team_ids(matches_df)
        print(f"  Fetching stats across {len(match_ids)} matches...")
        print(f"  OICC team IDs: {oicc_team_ids}")
        batting, bowling, fielding = client.get_stat_totals(
            match_ids=match_ids, team_ids=oicc_team_ids,
            group_by_team=False, n_players=15
        )

        # Compute best bowling figures from individual match data
        print("  Computing best bowling figures...")
        best_bowling = compute_best_bowling(client, match_ids, oicc_team_ids)

        stats["batting"] = df_to_dict(batting)
        bowling_list = df_to_dict(bowling)

        # Enrich bowling stats with best figures
        for b in bowling_list:
            bid = str(b.get("bowler_id", ""))
            if bid in best_bowling:
                wkts, runs = best_bowling[bid]
                b["best_figures"] = f"{wkts}/{runs}"
            else:
                b["best_figures"] = f"{b.get('max_wickets', 0)}/-"

        stats["bowling"] = bowling_list
        stats["fielding"] = df_to_dict(fielding)
        print(f"  Got {len(stats['batting'])} batters, {len(stats['bowling'])} bowlers")
    except Exception as e:
        print(f"  Error fetching stats: {e}")

    return stats


bank_holidays = set()  # YYYY-MM-DD strings for England & Wales, populated in main()


def fetch_bank_holidays():
    """Fetch England & Wales bank holidays from the gov.uk API."""
    try:
        resp = requests.get("https://www.gov.uk/bank-holidays.json", timeout=10)
        resp.raise_for_status()
        events = resp.json().get("england-and-wales", {}).get("events", [])
        return {e["date"] for e in events}
    except Exception as e:
        print(f"  Warning: Could not fetch bank holidays ({e}), using weekday/weekend only")
        return set()


def get_fixture_times(iso_date, raw_time):
    """Return (start_dt, end_dt) for a fixture.

    If a time is provided, use it with a smart duration.
    Otherwise apply defaults: weekend/bank holiday = 11:00-19:00, weekday = 18:00-21:00.
    """
    try:
        base = datetime.strptime(iso_date, "%Y-%m-%d")
    except ValueError:
        return None, None

    dow = base.weekday()  # 0=Mon … 6=Sun
    is_relaxed = dow >= 5 or iso_date in bank_holidays  # Sat, Sun, or bank holiday

    time_str = raw_time if raw_time and raw_time.upper() != "TBC" else ""
    if time_str:
        try:
            h, m = map(int, time_str.split(":")[:2])
            start = base.replace(hour=h, minute=m, second=0, microsecond=0)
            end = start + timedelta(hours=8 if is_relaxed else 3)
            return start, end
        except ValueError:
            pass  # fall through to smart defaults

    if is_relaxed:
        return (base.replace(hour=11, minute=0, second=0, microsecond=0),
                base.replace(hour=19, minute=0, second=0, microsecond=0))
    return (base.replace(hour=18, minute=0, second=0, microsecond=0),
            base.replace(hour=21, minute=0, second=0, microsecond=0))


def build_ics(fixtures):
    """Build iCalendar (.ics) content for a list of fixture dicts."""
    stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//OICC//Cricket Fixtures//EN",
        "X-WR-CALNAME:OICC Fixtures",
        "X-WR-CALDESC:Old Imperials Cricket Club upcoming fixtures",
        "REFRESH-INTERVAL;VALUE=DURATION:P1D",
        "X-PUBLISHED-TTL:P1D",
    ]
    for f in fixtures:
        start, end = get_fixture_times(f["date"], f.get("time", ""))
        if not start:
            continue
        uid = f"oicc-{f.get('matchId', f['date'])}@oldimperials.cc"
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{start.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND:{end.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{f['homeTeam']} vs {f['awayTeam']}",
            f"LOCATION:{f.get('venue', '')}",
            f"DESCRIPTION:{f.get('type', '')} cricket match",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


def save_ics(filename, content):
    """Save ICS content to file in the data directory."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / filename
    filepath.write_text(content, encoding="utf-8")
    print(f"  Saved: {filepath}")


def save_json(filename, data):
    """Save data to a JSON file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str, ensure_ascii=False)
    print(f"  Saved: {filepath}")


def fetch_single_season(client, season, is_default=False):
    """Fetch and save data for a single season. Returns summary dict + matches_df."""
    print(f"\n{'='*60}")
    print(f"  Fetching {season} season...")
    print(f"{'='*60}")

    matches_df = client.get_all_matches(season=season)
    if matches_df is not None:
        print(f"  Found {len(matches_df)} matches")
    else:
        print("  No matches found")
        return {"season": season, "fixtures": 0, "results": 0, "batting": 0, "bowling": 0}, None

    print("  Processing matches (fetching scorecards)...")
    fixtures, results = process_matches(client, matches_df)
    print(f"  Processed: {len(fixtures)} fixtures, {len(results)} results")

    suffix = "" if is_default else f"_{season}"

    save_json(f"fixtures{suffix}.json", {
        "fixtures": fixtures, "season": season,
        "lastUpdated": datetime.now().isoformat(),
    })
    if is_default and fixtures:
        print("  Generating fixtures.ics...")
        save_ics("fixtures.ics", build_ics(fixtures))
    save_json(f"results{suffix}.json", {
        "results": results, "season": season,
        "lastUpdated": datetime.now().isoformat(),
    })

    print("  Fetching season statistics...")
    stats = fetch_season_stats(client, matches_df)
    save_json(f"stats{suffix}.json", {
        "stats": stats, "season": season,
        "lastUpdated": datetime.now().isoformat(),
    })

    return {
        "season": season,
        "fixtures": len(fixtures),
        "results": len(results),
        "batting": len(stats.get("batting", [])),
        "bowling": len(stats.get("bowling", [])),
    }, matches_df


def main():
    season = CURRENT_YEAR
    fetch_all = False
    multi_season = False
    from_year = 2023  # OICC founding year on PlayCricket

    if "--season" in sys.argv:
        idx = sys.argv.index("--season")
        if idx + 1 < len(sys.argv):
            season = int(sys.argv[idx + 1])
    if "--all" in sys.argv:
        fetch_all = True
    if "--multi-season" in sys.argv:
        multi_season = True
        # Optionally specify start year: --multi-season --from 2024
        if "--from" in sys.argv:
            idx = sys.argv.index("--from")
            if idx + 1 < len(sys.argv):
                from_year = int(sys.argv[idx + 1])

    print("=" * 60)
    print("  OICC PlayCricket Data Fetcher")
    print("=" * 60)
    print(f"  Site ID: {SITE_ID}")
    if multi_season:
        print(f"  Seasons: {from_year} - {CURRENT_YEAR}")
    else:
        print(f"  Season:  {season}")
    print("=" * 60)

    global bank_holidays
    print("\nFetching UK bank holidays...")
    bank_holidays = fetch_bank_holidays()
    print(f"  Loaded {len(bank_holidays)} bank holidays")

    print("\nConnecting to PlayCricket API...")
    client = get_client()
    print("  Connected!")

    if multi_season:
        import pandas as pd

        seasons = list(range(from_year, CURRENT_YEAR + 1))
        available_seasons = []
        all_matches_dfs = []
        for yr in seasons:
            summary, matches_df = fetch_single_season(client, yr, is_default=(yr == season))
            if summary["results"] > 0 or summary["fixtures"] > 0:
                available_seasons.append(yr)
            if matches_df is not None and not matches_df.empty:
                all_matches_dfs.append(matches_df)

        # Generate all-time stats from combined match data
        if all_matches_dfs:
            print(f"\n{'='*60}")
            print("  Computing All-Time stats...")
            print(f"{'='*60}")
            combined_df = pd.concat(all_matches_dfs, ignore_index=True)
            all_time_stats = fetch_season_stats(client, combined_df)
            save_json("stats_all.json", {
                "stats": all_time_stats, "season": "all",
                "lastUpdated": datetime.now().isoformat(),
            })

        # Also combine all results for all-time results view
        all_results = []
        for yr in available_seasons:
            suffix = "" if yr == season else f"_{yr}"
            try:
                filepath = OUTPUT_DIR / f"results{suffix}.json"
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    all_results.extend(data.get("results", []))
            except Exception:
                pass
        all_results.sort(key=lambda x: x.get("isoDate", ""), reverse=True)
        save_json("results_all.json", {
            "results": all_results, "season": "all",
            "lastUpdated": datetime.now().isoformat(),
        })

        # Save a seasons index file so the JS knows which seasons exist
        save_json("seasons.json", {
            "seasons": sorted(available_seasons, reverse=True),
            "default": season,
            "lastUpdated": datetime.now().isoformat(),
        })
        print(f"\nAvailable seasons: {available_seasons}")
    else:
        summary, _ = fetch_single_season(client, season, is_default=True)
        # Save seasons index with just this season
        save_json("seasons.json", {
            "seasons": [season],
            "default": season,
            "lastUpdated": datetime.now().isoformat(),
        })

    if fetch_all:
        print("\nFetching registered players...")
        try:
            players_df = client.list_registered_players()
            if players_df is not None and not players_df.empty:
                save_json("players.json", {
                    "players": df_to_dict(players_df),
                    "lastUpdated": datetime.now().isoformat(),
                })
                print(f"  Found {len(players_df)} players")
        except Exception as e:
            print(f"  Error fetching players: {e}")

    print("\n" + "=" * 60)
    print("  COMPLETE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
