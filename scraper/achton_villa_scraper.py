"""
Achton Villa 5-a-side League Table & Fixtures Scraper
Scrapes the league table and fixtures/results from playfiveaside.com
and exports to JSON for the OICC website.

Usage:
    python achton_villa_scraper.py
"""

import json
import re
import sys
from datetime import datetime, date
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://playfiveaside.com/active-leagues/euston-tuesday-4g"
TABLE_URL = f"{BASE_URL}/league-tables"
FIXTURES_URL = f"{BASE_URL}/fixtures-and-results"

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def scrape_league_table():
    """Scrape the league table from playfiveaside.com."""
    print(f"Fetching {TABLE_URL} ...")
    resp = requests.get(TABLE_URL, timeout=15)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    table = soup.find("table")
    if not table:
        print("Error: No table found on the page.")
        return None

    teams = []
    tbody = table.find("tbody")
    rows = tbody.find_all("tr") if tbody else table.find_all("tr")[1:]

    for row in rows:
        cells = [td.get_text(strip=True) for td in row.find_all("td")]
        if not cells or len(cells) < 9:
            continue

        team = {
            "position": int(cells[0]) if cells[0].isdigit() else 0,
            "team": cells[1],
            "played": int(cells[2]) if cells[2].isdigit() else 0,
            "won": int(cells[3]) if cells[3].isdigit() else 0,
            "drawn": int(cells[4]) if cells[4].isdigit() else 0,
            "lost": int(cells[5]) if cells[5].isdigit() else 0,
            "goalsFor": int(cells[6]) if cells[6].lstrip("-").isdigit() else 0,
            "goalsAgainst": int(cells[7]) if cells[7].lstrip("-").isdigit() else 0,
            "goalDifference": int(cells[8]) if cells[8].lstrip("-").isdigit() else 0,
            "points": int(cells[9]) if len(cells) > 9 and cells[9].isdigit() else 0,
        }
        teams.append(team)

    if not teams:
        print("Error: No team data found in the table.")
        return None

    print(f"  Found {len(teams)} teams")
    return teams


# Known team names for matching
KNOWN_TEAMS = {
    "KPR", "BDO Bottlejobs", "Framlingham Drawbridges",
    "Achton Villa", "Neverthesame FC", "Flying without Ings", "FMO FC",
}


def is_team_name(line):
    """Check if a line is a known team name."""
    return line in KNOWN_TEAMS


def scrape_fixtures():
    """Scrape fixtures and results from playfiveaside.com."""
    print(f"Fetching {FIXTURES_URL} ...")
    resp = requests.get(FIXTURES_URL, timeout=15)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text("\n", strip=True)
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # First pass: collect all team names that appear on the page
    # to handle teams we don't know about yet
    all_teams = set(KNOWN_TEAMS)

    matches = []
    current_date = None
    i = 0

    while i < len(lines):
        line = lines[i]

        # Match date headers like "Tuesday, February 3, 2026"
        date_match = re.match(
            r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+"
            r"(\w+\s+\d{1,2},\s+\d{4})",
            line,
        )
        if date_match:
            try:
                current_date = datetime.strptime(
                    date_match.group(1), "%B %d, %Y"
                ).strftime("%Y-%m-%d")
            except ValueError:
                pass
            i += 1
            continue

        # Match time lines like "7:00 PM [Pitch 1]"
        time_match = re.match(r"(\d{1,2}:\d{2}\s*[AP]M)", line, re.IGNORECASE)
        if time_match and current_date:
            match_time = time_match.group(1).strip()

            # Structure after time line:
            #   [PAY]        (optional)
            #   TEAM_A
            #   SCORE : SCORE
            #   [PAY]        (optional)
            #   TEAM_B
            j = i + 1
            team_a = None
            team_b = None
            score_a = None
            score_b = None

            # Scan forward to find: team_a, score line, team_b
            while j < min(i + 8, len(lines)):
                scan = lines[j]

                if scan == "PAY":
                    j += 1
                    continue

                # Score line: "9 : 5" or "20 : 3"
                score_match = re.match(r"^(\d+)\s*:\s*(\d+)$", scan)
                if score_match and team_a and score_a is None:
                    score_a = int(score_match.group(1))
                    score_b = int(score_match.group(2))
                    j += 1
                    continue

                # Team name: any non-score, non-PAY, non-digit-only line
                # that comes before or after the score
                if not re.match(r"^\d+\s*:\s*\d+$", scan) and scan != "PAY":
                    if team_a is None and score_a is None:
                        team_a = scan
                    elif score_a is not None and team_b is None:
                        team_b = scan
                        break
                    else:
                        break

                j += 1

            if team_a and team_b and score_a is not None:
                matches.append({
                    "date": current_date,
                    "time": match_time,
                    "homeTeam": team_a,
                    "awayTeam": team_b,
                    "homeScore": score_a,
                    "awayScore": score_b,
                })

            # Skip past this match block to the next time/date
            i = j + 1
            continue

        i += 1

    print(f"  Found {len(matches)} matches")
    return matches


def classify_matches(matches):
    """Split matches into results (played) and fixtures (upcoming)."""
    today = date.today()
    results = []
    fixtures = []

    for m in matches:
        if not m["date"]:
            continue
        match_date = datetime.strptime(m["date"], "%Y-%m-%d").date()
        if match_date < today:
            results.append(m)
        elif match_date == today:
            if m["homeScore"] == 0 and m["awayScore"] == 0:
                fixtures.append(m)
            else:
                results.append(m)
        else:
            fixtures.append(m)

    # Results: most recent first; fixtures: soonest first
    results.sort(key=lambda x: x["date"], reverse=True)
    fixtures.sort(key=lambda x: x["date"])

    return results, fixtures


def filter_achton_villa(matches):
    """Filter to only Achton Villa matches."""
    return [
        m for m in matches
        if "achton" in m["homeTeam"].lower() or "achton" in m["awayTeam"].lower()
    ]


def find_achton_villa(teams):
    """Find Achton Villa's position in the table."""
    for t in teams:
        if "achton" in t["team"].lower():
            return t
    return None


def save_data(teams, all_results, all_fixtures):
    """Save league table and fixtures data to JSON."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    av = find_achton_villa(teams) if teams else None
    if av:
        print(f"  Achton Villa: P{av['position']} | {av['points']} pts | "
              f"{av['won']}W {av['drawn']}D {av['lost']}L")

    av_results = filter_achton_villa(all_results)
    av_fixtures = filter_achton_villa(all_fixtures)

    print(f"  Achton Villa: {len(av_results)} results, {len(av_fixtures)} upcoming")

    output = {
        "leagueTable": teams,
        "achtonVilla": av,
        "results": av_results,
        "fixtures": av_fixtures,
        "leagueUrl": TABLE_URL,
        "fixturesUrl": FIXTURES_URL,
        "lastUpdated": datetime.now().isoformat(),
    }

    out_path = DATA_DIR / "achton_villa.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"  Saved to {out_path}")


def main():
    teams = scrape_league_table()

    all_matches = scrape_fixtures()
    all_results, all_fixtures = classify_matches(all_matches)

    print(f"  Total: {len(all_results)} results, {len(all_fixtures)} fixtures")

    if teams or all_matches:
        save_data(teams, all_results, all_fixtures)
        print("Done!")
    else:
        print("Failed to scrape data.")
        sys.exit(1)


if __name__ == "__main__":
    main()
