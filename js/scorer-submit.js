/**
 * Imperial Super Sixes - Live Scorer direct-submit.
 * Builds the same figures as scorer-export.js's copy-paste blocks, but as a
 * single JSON payload POSTed straight to a Google Apps Script Web App bound
 * to the tournament Sheet — see scraper/apps-script/Code.gs for the
 * receiving side and SUPER_SIXES_GUIDE.md for how to deploy it.
 *
 * The Apps Script URL is baked in below (DEFAULT_APPS_SCRIPT_URL) — nothing
 * for a scorer to configure. Deliberately still optional in the sense that
 * the copy-paste export always remains available regardless of whether a
 * submission succeeds — this is a convenience layered on top, not a
 * replacement for it.
 */

import { computeScorecard } from './scorer-rules.js';
import { computeSheetStatus } from './scorer-export.js';

const URL_STORAGE_KEY = 'ss_scorer_apps_script_url';

// Baked in so scorers don't need to configure anything — this is the
// Imperial Super Sixes tournament Sheet's deployed Apps Script Web App. Not
// a secret: it only grants what doPost/doGet in scraper/apps-script/Code.gs
// expose (writing match data into the same rows a scorer could already
// edit by hand), the same trust level as the Sheet's published CSV URLs.
// A device can still override it (e.g. pointing at a test sheet) via the
// Export screen's URL field — that override always wins over this default.
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby4N5eDcWELMhY3JEhVSJqIg_C4oTIA6luMGOiBI9FFiCm5fQGdY4IydOZoq6uYOVOayw/exec';

export function getSubmitUrl() {
    const stored = localStorage.getItem(URL_STORAGE_KEY);
    return stored !== null ? stored : DEFAULT_APPS_SCRIPT_URL;
}

/** True when the URL in use is the baked-in default rather than a
 * device-specific override — purely informational, for the settings UI. */
export function isUsingDefaultUrl() {
    return localStorage.getItem(URL_STORAGE_KEY) === null;
}

export function setSubmitUrl(url) {
    const trimmed = (url || '').trim();
    if (trimmed) localStorage.setItem(URL_STORAGE_KEY, trimmed);
    else localStorage.removeItem(URL_STORAGE_KEY);
}

/** Builds the full JSON payload for one match — a fixture-row update plus
 * every batting/bowling row across both innings. Field names match the
 * Sheet's actual column headers exactly (see scraper/apps-script/Code.gs),
 * since the receiving script looks columns up by header text, not position. */
export function buildSubmitPayload(match) {
    const innA = match.innings.find(i => i.battingTeam === 'A');
    const innB = match.innings.find(i => i.battingTeam === 'B');
    const status = computeSheetStatus(match);
    const battedFirst = match.battedFirst === 'A' ? 1 : (match.battedFirst === 'B' ? 2 : '');
    const scA = innA ? computeScorecard(innA) : null;
    const scB = innB ? computeScorecard(innB) : null;

    const fixture = {
        Round: match.round,
        Team1: match.teamA,
        Team2: match.teamB,
        Status: status,
        BattedFirst: battedFirst,
        Team1_Runs: scA ? scA.totalRuns : '',
        Team1_Wickets: scA ? scA.wickets : '',
        Team1_Overs: scA ? scA.oversDisplay : '',
        Team2_Runs: scB ? scB.totalRuns : '',
        Team2_Wickets: scB ? scB.wickets : '',
        Team2_Overs: scB ? scB.oversDisplay : '',
    };

    const batting = [];
    const bowling = [];
    for (const innings of match.innings) {
        const sc = computeScorecard(innings);
        for (const b of sc.battingOrder) {
            batting.push({
                Innings: innings.inningsNumber,
                Player: b.name,
                Runs: b.runs,
                Balls: b.balls,
                Fours: b.fours,
                Sixes: b.sixes,
                HowOut: b.dismissalCode || 'not out',
                Bowler: b.dismissalBowler || '',
                Fielder: b.dismissalFielder || '',
            });
        }
        for (const b of sc.bowlingOrder) {
            bowling.push({
                Innings: innings.inningsNumber,
                Bowler: b.name,
                Overs: b.overs,
                Maidens: b.maidens,
                Runs: b.runs,
                Wickets: b.wickets,
            });
        }
    }

    return { matchNo: match.matchNo, fixture, batting, bowling };
}

async function post(url, payload) {
    // Content-Type: text/plain (not application/json) keeps this a "simple"
    // CORS request, so the browser doesn't send a preflight OPTIONS request —
    // Apps Script Web Apps have no way to answer one. The Apps Script side
    // reads e.postData.contents and JSON.parses it itself.
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
    });
    const text = await resp.text();
    try {
        return JSON.parse(text);
    } catch {
        return { success: false, error: `Unexpected response (not JSON): ${text.slice(0, 200)}` };
    }
}

export async function submitMatch(match) {
    const url = getSubmitUrl();
    if (!url) return { success: false, error: 'No Apps Script URL configured yet.' };
    try {
        return await post(url, buildSubmitPayload(match));
    } catch (err) {
        return { success: false, error: `Network error: ${err.message}` };
    }
}

/** A lightweight GET "is this URL alive and correctly deployed" check, for a
 * Test Connection button — separate from actually submitting any data. */
export async function testConnection() {
    const url = getSubmitUrl();
    if (!url) return { success: false, error: 'No Apps Script URL configured yet.' };
    try {
        const resp = await fetch(url, { method: 'GET' });
        const text = await resp.text();
        try {
            return JSON.parse(text);
        } catch {
            return { success: false, error: `Unexpected response (not JSON): ${text.slice(0, 200)}` };
        }
    } catch (err) {
        return { success: false, error: `Network error: ${err.message}` };
    }
}
