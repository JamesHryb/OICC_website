"""
One-off diagnostic — NOT the real scraper. Run this locally (not in CI) to
capture what the CricHeroes tournament pages actually look like once past
the Cloudflare check, so the real scraper can be written against real data
instead of guesses.

Setup (once):
    pip install playwright
    playwright install chromium

This version reuses a session cookie captured from your own browser (see
scraper/cricheroes_cookies.json.example for the format) instead of trying
to pass the check itself. Copy that file to cricheroes_cookies.json, fill
in your User-Agent and the cricheroes.com cookies from DevTools, then run:

    python cricheroes_diagnose.py

It navigates straight in with the borrowed session — no clicking needed
this time, if it works at all. Everything gets saved into
scraper/cricheroes_diagnostics/ — zip that folder up and send it back.
"""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
OUT_DIR = HERE / "cricheroes_diagnostics"
COOKIE_FILE = HERE / "cricheroes_cookies.json"

PAGES = [
    ("our_upcoming", "https://cricheroes.com/tournament/2160358/summer-smash/matches/upcoming-matches"),
    ("example_past", "https://cricheroes.com/tournament/1968397/tpl-2026-tal-premier-league-uk/matches/past-matches"),
]


def load_cookie_config():
    if not COOKIE_FILE.exists():
        print(f"Missing {COOKIE_FILE}. Copy cricheroes_cookies.json.example to "
              f"cricheroes_cookies.json and fill it in first.")
        sys.exit(1)
    return json.loads(COOKIE_FILE.read_text(encoding="utf-8"))


def looks_blocked(page):
    title = page.title()
    return "just a moment" in title.lower() or "attention required" in title.lower()


def capture(page, name, captured):
    OUT_DIR.mkdir(exist_ok=True)
    page.screenshot(path=str(OUT_DIR / f"{name}.png"), full_page=True)
    (OUT_DIR / f"{name}.html").write_text(page.content(), encoding="utf-8")
    (OUT_DIR / f"{name}_requests.json").write_text(json.dumps(captured, indent=2), encoding="utf-8")
    status = "BLOCKED (still seeing the challenge page)" if looks_blocked(page) else "looks like real content"
    print(f"  [{name}] {status} — saved {name}.png / {name}.html / {name}_requests.json")


def main():
    config = load_cookie_config()
    user_agent = config.get("user_agent", "")
    cookie_dict = config.get("cookies", {})
    if not user_agent or not cookie_dict:
        print("cricheroes_cookies.json needs both a user_agent and at least one cookie filled in.")
        sys.exit(1)

    cookies_payload = [
        {"name": name, "value": value, "domain": ".cricheroes.com", "path": "/"}
        for name, value in cookie_dict.items()
        if value and "PASTE" not in value
    ]
    print(f"Loaded {len(cookies_payload)} cookie(s) to inject.")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(viewport={"width": 1400, "height": 1000}, user_agent=user_agent)
        ctx.add_cookies(cookies_payload)

        captured = []
        ctx.on("response", lambda r: captured.append(
            {"url": r.url, "status": r.status, "content_type": r.headers.get("content-type", "")}
        ) if "json" in r.headers.get("content-type", "").lower() else None)

        page = ctx.new_page()
        for name, url in PAGES:
            captured.clear()
            print(f"\nOpening {url}")
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1500)
            capture(page, name, captured)

        if not looks_blocked(page):
            print("\nOn the currently-open example past-matches page: click into any ONE "
                  "completed match to open its scorecard.")
            input("  -> Once the scorecard page has loaded, press Enter here to capture it...")
            captured.clear()
            capture(page, "example_scorecard", captured)

        browser.close()

    print(f"\nDone. Zip up {OUT_DIR} and send it back.")


if __name__ == "__main__":
    main()
