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
import os
import sys
from datetime import datetime
from pathlib import Path

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


def df_to_dict(df):
    """Safely convert a pandas DataFrame to a list of dicts."""
    if df is None:
        return []
    try:
        return df.to_dict(orient="records")
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


def fetch_innings_scores(client, match_id):
    """Fetch innings scores for a match and return OICC + opposition scores."""
    oicc_score = ""
    opp_score = ""
    try:
        innings_df = client.get_innings_total_scores(match_id=int(match_id))
        if innings_df is None or innings_df.empty:
            return oicc_score, opp_score

        for _, inn in innings_df.iterrows():
            team = str(inn.get("team_batting_name", ""))
            runs = inn.get("runs", "")
            wickets = inn.get("wickets", "")
            overs = inn.get("overs", "")

            score = f"{runs}/{wickets}"
            if overs:
                score += f" ({overs} ov)"

            if is_oicc(team):
                oicc_score = score
            else:
                opp_score = score
    except Exception as e:
        print(f"    Could not fetch innings for match {match_id}: {e}")

    return oicc_score, opp_score


def fetch_match_result(client, match_id):
    """Safely fetch match result text and letter."""
    result_text = ""
    result_status = ""
    try:
        result_text = client.get_match_result_string(match_id=int(match_id))
    except Exception:
        pass
    try:
        letter = client.get_result_for_my_team(match_id=int(match_id))
        if letter == "W":
            result_status = "won"
        elif letter == "L":
            result_status = "lost"
        elif letter in ("D", "T"):
            result_status = "tie"
        elif letter in ("C", "A", "CON"):
            result_status = "cancelled"
        else:
            result_status = ""
    except Exception:
        pass
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
            oicc_score, opp_score = fetch_innings_scores(client, match_id)
            result_text, result_status = fetch_match_result(client, match_id)

            results.append({
                "date": display_date,
                "isoDate": iso_date,
                "homeTeam": oicc_display if oicc_is_home else opp_display,
                "homeScore": oicc_score if oicc_is_home else opp_score,
                "awayTeam": opp_display if oicc_is_home else oicc_display,
                "awayScore": opp_score if oicc_is_home else oicc_score,
                "result": result_status,
                "resultText": result_text or "",
                "venue": ground,
                "type": match_type,
                "competition": competition,
                "matchId": match_id,
            })

    fixtures.sort(key=lambda x: x.get("date", ""))
    results.sort(key=lambda x: x.get("isoDate", ""), reverse=True)
    return fixtures, results


def fetch_season_stats(client, matches_df):
    """Fetch aggregated season batting and bowling stats."""
    stats = {"batting": [], "bowling": [], "fielding": []}
    if matches_df is None or matches_df.empty:
        return stats

    try:
        match_ids = matches_df["id"].tolist()
        match_ids = [int(mid) for mid in match_ids if mid]
        if not match_ids:
            return stats

        print(f"  Fetching stats across {len(match_ids)} matches...")
        batting, bowling, fielding = client.get_stat_totals(
            match_ids=match_ids, group_by_team=False, n_players=15
        )
        stats["batting"] = df_to_dict(batting)
        stats["bowling"] = df_to_dict(bowling)
        stats["fielding"] = df_to_dict(fielding)
        print(f"  Got {len(stats['batting'])} batsmen, {len(stats['bowling'])} bowlers")
    except Exception as e:
        print(f"  Error fetching stats: {e}")

    return stats


def save_json(filename, data):
    """Save data to a JSON file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str, ensure_ascii=False)
    print(f"  Saved: {filepath}")


def main():
    season = CURRENT_YEAR
    fetch_all = False

    if "--season" in sys.argv:
        idx = sys.argv.index("--season")
        if idx + 1 < len(sys.argv):
            season = int(sys.argv[idx + 1])
    if "--all" in sys.argv:
        fetch_all = True

    print("=" * 60)
    print("  OICC PlayCricket Data Fetcher")
    print("=" * 60)
    print(f"  Site ID: {SITE_ID}")
    print(f"  Season:  {season}")
    print("=" * 60)

    print("\n1. Connecting to PlayCricket API...")
    client = get_client()
    print("  Connected!")

    print(f"\n2. Fetching {season} season matches...")
    matches_df = client.get_all_matches(season=season)
    if matches_df is not None:
        print(f"  Found {len(matches_df)} matches")
    else:
        print("  No matches found")

    print("\n3. Processing matches (fetching scorecards)...")
    fixtures, results = process_matches(client, matches_df)
    print(f"\n  Processed: {len(fixtures)} fixtures, {len(results)} results")

    print("\n4. Saving fixtures...")
    save_json("fixtures.json", {
        "fixtures": fixtures, "season": season,
        "lastUpdated": datetime.now().isoformat(),
    })

    print("\n5. Saving results...")
    save_json("results.json", {
        "results": results, "season": season,
        "lastUpdated": datetime.now().isoformat(),
    })

    print("\n6. Fetching season statistics...")
    stats = fetch_season_stats(client, matches_df)
    save_json("stats.json", {
        "stats": stats, "season": season,
        "lastUpdated": datetime.now().isoformat(),
    })

    if fetch_all:
        print("\n7. Fetching registered players...")
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
    print(f"  Fixtures: {len(fixtures)}")
    print(f"  Results:  {len(results)}")
    bat_count = len(stats.get("batting", []))
    bowl_count = len(stats.get("bowling", []))
    print(f"  Stats:    {bat_count} batsmen, {bowl_count} bowlers")
    print(f"  Output:   {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
