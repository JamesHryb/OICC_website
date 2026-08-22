/**
 * Imperial Super Sixes - Live Scorer export helpers.
 * Builds paste-ready TSV blocks matching the Google Sheet's exact column
 * layout, so a scorer can copy a block and paste it straight into the
 * right cell rather than retyping every figure.
 *
 * Deliberately split into separate blocks around the Sheet's computed
 * "Batting Team"/"Bowling Team" formula columns (C/D on Batting, C on
 * Bowling) — a single full-width paste would overwrite those formulas.
 */

import { computeScorecard } from './scorer-rules.js';

function tsvRow(cells) {
    return cells.map(c => (c === null || c === undefined) ? '' : String(c)).join('\t');
}

/** The Sheet's Status value for a match — single source of truth used by
 * both the copy-paste export and the direct Apps Script submission, so they
 * can never disagree. Abandoned/ended are explicit scorer declarations and
 * always win over whatever the innings' completion state would otherwise imply. */
export function computeSheetStatus(match) {
    if (match.abandoned) return 'Abandoned';
    if (match.ended) return 'Complete';
    const bothDone = match.innings.length === 2 && match.innings.every(i => i.complete);
    if (bothDone) return 'Complete';
    return match.innings.length > 0 ? 'Live' : 'Scheduled';
}

export function buildFixturesBlock(match) {
    // Columns: Status, BattedFirst, Team1_Runs, Team1_Wickets, Team1_Overs,
    // Team2_Runs, Team2_Wickets, Team2_Overs — paste starting at the Status
    // cell of this match's row.
    const innA = match.innings.find(i => i.battingTeam === 'A');
    const innB = match.innings.find(i => i.battingTeam === 'B');
    const status = computeSheetStatus(match);
    const battedFirst = match.battedFirst === 'A' ? 1 : (match.battedFirst === 'B' ? 2 : '');

    const scA = innA ? computeScorecard(innA) : null;
    const scB = innB ? computeScorecard(innB) : null;

    return tsvRow([
        status, battedFirst,
        scA ? scA.totalRuns : '', scA ? scA.wickets : '', scA ? scA.oversDisplay : '',
        scB ? scB.totalRuns : '', scB ? scB.wickets : '', scB ? scB.oversDisplay : '',
    ]);
}

export function buildBattingBlocks(match) {
    // One pair of blocks per innings: {leftBlock: "MatchNo\tInnings" rows for
    // column A, rightBlock: "Player..Fielder" rows for column E}.
    return match.innings.map(innings => {
        const sc = computeScorecard(innings);
        const leftRows = [];
        const rightRows = [];
        for (const b of sc.battingOrder) {
            leftRows.push(tsvRow([match.matchNo, innings.inningsNumber]));
            rightRows.push(tsvRow([
                b.name, b.runs, b.balls, b.fours, b.sixes,
                b.dismissalCode || 'not out', b.dismissalBowler, b.dismissalFielder,
            ]));
        }
        return {
            inningsNumber: innings.inningsNumber,
            battingTeamLabel: innings.battingTeam === 'A' ? match.teamA : match.teamB,
            leftBlock: leftRows.join('\n'),
            rightBlock: rightRows.join('\n'),
            rowCount: leftRows.length,
        };
    });
}

export function buildBowlingBlocks(match) {
    // Pair of blocks per innings: column A (MatchNo, Innings) and column D
    // (Bowler, Overs, Maidens, Runs, Wickets) — Bowling Team (C) is a formula.
    return match.innings.map(innings => {
        const sc = computeScorecard(innings);
        const leftRows = [];
        const rightRows = [];
        for (const b of sc.bowlingOrder) {
            leftRows.push(tsvRow([match.matchNo, innings.inningsNumber]));
            rightRows.push(tsvRow([
                b.name, b.overs, b.maidens, b.runs, b.wickets,
            ]));
        }
        return {
            inningsNumber: innings.inningsNumber,
            bowlingTeamLabel: innings.bowlingTeam === 'A' ? match.teamA : match.teamB,
            leftBlock: leftRows.join('\n'),
            rightBlock: rightRows.join('\n'),
            rowCount: leftRows.length,
        };
    });
}
