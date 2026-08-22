/**
 * Imperial Super Sixes - Live Scorer rules engine.
 * Pure functions, no DOM/storage dependencies, so this can be exercised
 * directly by a script for testing. All mutation happens on plain objects
 * passed in — nothing here touches localStorage or the page.
 *
 * Every event (a ball, or an explicit "end this over" action) is pushed in
 * order to innings.balls as a single unified log. Undo/history-editing works
 * by truncating that log and replaying everything remaining from the
 * innings' original starting state — deliberately not by hand-reversing
 * state mutations, which is error-prone for things like wickets or
 * over-endings. Replay guarantees the result is exactly what it would be if
 * the discarded events had never happened.
 */

export const DEFAULT_OVERS_PER_INNINGS = 5;
export const DEFAULT_PLAYERS_PER_SIDE = 6;

// Event kinds that mark a structural moment rather than an actual delivery —
// excluded from ball-counting, the batting/bowling tallies, and ball-by-ball
// labels.
const NON_DELIVERY_KINDS = ['endOver', 'setBowler', 'manualEnd', 'reopen'];

// ── Match / innings setup ───────────────────────────────────

export function createMatch(config) {
    const playersPerSide = config.playersPerSide || DEFAULT_PLAYERS_PER_SIDE;
    const rebowlAlways = config.round === 'Final';
    return {
        matchNo: config.matchNo,
        round: config.round,
        teamA: config.teamA,
        teamB: config.teamB,
        rosterA: config.rosterA.slice(),
        rosterB: config.rosterB.slice(),
        oversPerInnings: config.oversPerInnings || DEFAULT_OVERS_PER_INNINGS,
        playersPerSide,
        allOutWickets: playersPerSide, // LMS: last batter can bat alone — all N must be out, not N-1
        rebowlWideNoBall: rebowlAlways ? 'always' : 'finalOverOnly',
        extraRunsWideNoBall: rebowlAlways ? 1 : 2,
        battedFirst: null, // 'A' | 'B' — set when innings 1 starts
        archived: false, // hidden from the main match list / not meant for sync once true
        ended: false, // scorer has declared this match finished — shows its result on the home screen
        innings: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

export function rosterFor(match, teamSide) {
    return teamSide === 'A' ? match.rosterA : match.rosterB;
}

export function startInnings(match, { battingTeam, striker, nonStriker, bowler }) {
    const inningsNumber = match.innings.length + 1;
    const roster = rosterFor(match, battingTeam);
    // Cap replacement slots to the match FORMAT (playersPerSide - 2 openers),
    // not to however many names happen to be in the roster — a squad list
    // can legitimately have more players than play any single match (subs,
    // rotation), and LMS must still kick in at the right wicket (5 down for
    // a 6-a-side match) regardless of how many extra names were left in.
    const maxReplacements = Math.max(0, match.playersPerSide - 2);
    const yetToBat = roster.filter(p => p !== striker && p !== nonStriker).slice(0, maxReplacements);
    const innings = {
        inningsNumber,
        battingTeam,          // 'A' | 'B'
        bowlingTeam: battingTeam === 'A' ? 'B' : 'A',
        balls: [],
        // Mutable "current" state, rebuilt by replay whenever history changes:
        striker, nonStriker, currentBowler: bowler,
        retiredBatters: [], dismissedBatters: [], yetToBat: yetToBat.slice(),
        completedOvers: 0,
        complete: false,
        completeReason: null,  // 'all_out' | 'overs_complete' | 'manual'
        // Immutable record of how the innings started, so undo/replay can
        // always rebuild from scratch:
        initialStriker: striker, initialNonStriker: nonStriker, initialBowler: bowler,
        initialYetToBat: yetToBat.slice(),
    };
    if (inningsNumber === 1) match.battedFirst = battingTeam;
    match.innings.push(innings);
    match.updatedAt = Date.now();
    return innings;
}

// ── Ball-counting helpers ───────────────────────────────────

function legalBallsBowled(innings) {
    return innings.balls.filter(b => b.isLegal && !b.void).length;
}

function ballsInCurrentOver(innings) {
    return innings.balls.filter(b => b.overNumber === innings.completedOvers + 1 && b.isLegal && !b.void).length;
}

export function oversDisplay(innings) {
    return `${innings.completedOvers}.${ballsInCurrentOver(innings)}`;
}

/** Returns a parallel array giving each ball event's "over.ball" label as it
 * would have been called at the time (e.g. "4.3") — for the ball-by-ball
 * narrative. endOver/setBowler markers and retirements (not a delivery) get
 * null. An illegal wide/no-ball shares its label with the legal delivery
 * that follows it, matching normal cricket commentary conventions. */
export function ballLabels(innings) {
    const labels = [];
    let completedOvers = 0;
    let legalInOver = 0;
    for (const event of innings.balls) {
        if (event.kind === 'endOver') {
            labels.push(null);
            completedOvers += 1;
            legalInOver = 0;
            continue;
        }
        if (NON_DELIVERY_KINDS.includes(event.kind) || event.void) {
            labels.push(null);
            continue;
        }
        if (event.isLegal) legalInOver += 1;
        labels.push(`${completedOvers}.${legalInOver}`);
    }
    return labels;
}

function currentOverNumber(innings) {
    return innings.completedOvers + 1;
}

function extrasRuleForOver(match, overNumber) {
    const isLastOver = overNumber >= match.oversPerInnings;
    const rebowl = match.rebowlWideNoBall === 'always' || (match.rebowlWideNoBall === 'finalOverOnly' && isLastOver);
    return { rebowl, runs: match.extraRunsWideNoBall };
}

/** Public version for the UI to display "this will/won't be rebowled" hints. */
export function extrasRuleForOverPublic(match, innings) {
    return extrasRuleForOver(match, currentOverNumber(innings));
}

export { extrasRuleForOver };

// ── Eligible batters (for "who's coming in" pickers) ────────

export function eligibleIncomingBatters(innings) {
    // Yet-to-bat first, then retired-not-out (always offered, per house rule —
    // a retired batter can return at any wicket, e.g. "retired hurt" coming back).
    return innings.yetToBat.concat(innings.retiredBatters);
}

export function isInningsComplete(match, innings) {
    if (innings.dismissedBatters.length >= match.allOutWickets) return true;
    if (innings.completedOvers >= match.oversPerInnings) return true;
    return false;
}

export function ballsBowledSoFarInOver(innings) {
    return ballsInCurrentOver(innings);
}

// ── Recording events ─────────────────────────────────────────
// outcome.kind: 'run' | 'wide' | 'noball' | 'bye' | 'legbye' | 'wicket' | 'retire'

function swapStrike(innings) {
    if (!innings.striker || !innings.nonStriker) return; // LMS: no partner to swap with
    const tmp = innings.striker;
    innings.striker = innings.nonStriker;
    innings.nonStriker = tmp;
}

function maybeRotateOnRuns(innings, runsRun) {
    if (((runsRun % 2) + 2) % 2 === 1) swapStrike(innings);
}

function newEventShell(innings, kind) {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        overNumber: currentOverNumber(innings),
        bowler: innings.currentBowler,
        striker: innings.striker,
        nonStriker: innings.nonStriker,
        isLegal: true,
        void: false,
        runsOffBat: 0,
        extraRuns: 0,
        extraType: null,   // 'wide' | 'noball' | 'bye' | 'legbye'
        wicket: null,
        newBatter: null,   // for 'wicket' / 'retire' — persisted so replay doesn't need the original outcome object
        edited: false,
    };
}

/** Builds the event object for a new outcome — no state mutation here. */
function buildEvent(match, innings, outcome) {
    const event = newEventShell(innings, outcome.kind);
    const rule = extrasRuleForOver(match, event.overNumber);

    switch (outcome.kind) {
        case 'run':
            event.runsOffBat = outcome.runs || 0;
            break;
        case 'bye':
        case 'legbye':
            event.extraType = outcome.kind;
            event.extraRuns = outcome.runs || 0;
            break;
        case 'wide':
            event.extraType = 'wide';
            event.extraRuns = rule.runs + (outcome.runsRun || 0);
            event.isLegal = !rule.rebowl;
            break;
        case 'noball':
            event.extraType = 'noball';
            event.extraRuns = rule.runs;
            event.runsOffBat = outcome.runsOffBat || 0;
            event.isLegal = !rule.rebowl;
            break;
        case 'wicket': {
            const { dismissalType, batterOut, fielder, newBatter, runsCompleted, offExtra } = outcome;
            event.wicket = {
                type: dismissalType, batterOut, fielder: fielder || null,
                creditedToBowler: dismissalType !== 'runout',
            };
            event.newBatter = newBatter || null;
            if (offExtra) {
                event.extraType = offExtra; // 'wide' | 'noball'
                event.extraRuns = rule.runs;
                event.isLegal = !rule.rebowl;
            } else {
                event.runsOffBat = runsCompleted || 0;
            }
            break;
        }
        case 'retire': {
            const { batterOut, newBatter } = outcome;
            event.wicket = { type: 'retired', batterOut, fielder: null, creditedToBowler: false };
            event.newBatter = newBatter || null;
            event.void = true;
            event.isLegal = false;
            break;
        }
        default:
            throw new Error(`Unknown outcome kind: ${outcome.kind}`);
    }
    return event;
}

/** Puts `newBatter` in whichever slot (striker/non-striker) `outgoing` just
 * vacated. When there's no replacement (LMS — the last recognised batter
 * continues alone), the survivor always ends up as the STRIKER, since
 * they're the only one left to face the next ball — never left stranded in
 * the non-striker slot with striker set to null. */
function replaceBatter(innings, outgoing, newBatter) {
    const outgoingWasStriker = outgoing === innings.striker;
    if (newBatter) {
        if (outgoingWasStriker) innings.striker = newBatter;
        else innings.nonStriker = newBatter;
        return;
    }
    if (outgoingWasStriker) innings.striker = innings.nonStriker;
    innings.nonStriker = null;
}

/** Applies an existing event's effects to innings state. Used both for a
 * freshly-recorded event and during replay of historical ones. */
function applyEventEffects(match, innings, event) {
    switch (event.kind) {
        case 'run':
            maybeRotateOnRuns(innings, event.runsOffBat);
            break;
        case 'bye':
        case 'legbye':
            maybeRotateOnRuns(innings, event.extraRuns);
            break;
        case 'wide':
            // The fixed wide penalty doesn't rotate strike, only any extra
            // runs actually run on top of it do.
            maybeRotateOnRuns(innings, event.extraRuns - match.extraRunsWideNoBall);
            break;
        case 'noball':
            maybeRotateOnRuns(innings, event.runsOffBat);
            break;
        case 'wicket':
            innings.dismissedBatters.push(event.wicket.batterOut);
            replaceBatter(innings, event.wicket.batterOut, event.newBatter);
            innings.yetToBat = innings.yetToBat.filter(p => p !== event.newBatter);
            innings.retiredBatters = innings.retiredBatters.filter(p => p !== event.newBatter);
            if (event.runsOffBat) maybeRotateOnRuns(innings, event.runsOffBat);
            break;
        case 'retire':
            innings.retiredBatters.push(event.wicket.batterOut);
            replaceBatter(innings, event.wicket.batterOut, event.newBatter);
            innings.yetToBat = innings.yetToBat.filter(p => p !== event.newBatter);
            innings.retiredBatters = innings.retiredBatters.filter(p => p !== event.newBatter);
            break;
        case 'endOver':
            innings.completedOvers += 1;
            swapStrike(innings);
            innings.currentBowler = null;
            break;
        case 'setBowler':
            innings.currentBowler = event.bowler;
            break;
        case 'manualEnd':
            innings.complete = true;
            innings.completeReason = 'manual';
            break;
        case 'reopen':
            innings.complete = false;
            innings.completeReason = null;
            break;
    }

    if (!innings.complete && isInningsComplete(match, innings)) {
        innings.complete = true;
        innings.completeReason = innings.dismissedBatters.length >= match.allOutWickets ? 'all_out' : 'overs_complete';
    }
}

export function recordBall(match, innings, outcome) {
    const event = buildEvent(match, innings, outcome);
    innings.balls.push(event);
    applyEventEffects(match, innings, event);
    match.updatedAt = Date.now();
    return event;
}

/** Explicit "end this over" action — NOT automatic at 6 balls, so a short or
 * extended over is always the scorer's deliberate choice. */
export function endOver(match, innings) {
    const event = newEventShell(innings, 'endOver');
    innings.balls.push(event);
    applyEventEffects(match, innings, event);
    match.updatedAt = Date.now();
    return event;
}

/** Assigns who's bowling — recorded as an event (not a plain field mutation)
 * so replay/undo can correctly reconstruct currentBowler at any point in the
 * log, instead of losing it whenever undo crosses an over boundary. Used both
 * for picking the next over's bowler and for a mid-over change (injury). */
export function setBowler(match, innings, bowlerName) {
    const event = newEventShell(innings, 'setBowler');
    event.bowler = bowlerName;
    event.isLegal = false;
    innings.balls.push(event);
    applyEventEffects(match, innings, event);
    match.updatedAt = Date.now();
    return event;
}

/** Marks the innings complete right now, regardless of wickets/overs — for
 * ending a match early (e.g. time ran out). Recorded as an event (not a
 * plain field mutation) so it survives replay — otherwise undoing or
 * hand-editing any ball in an already-closed innings would silently reopen
 * it, since resetInningsToStart()+replay would have no record of the manual
 * completion to restore. */
export function endInningsManually(match, innings) {
    const event = newEventShell(innings, 'manualEnd');
    event.isLegal = false;
    innings.balls.push(event);
    applyEventEffects(match, innings, event);
    match.updatedAt = Date.now();
    return event;
}

/** Reopens a manually- or naturally-completed innings so scoring can
 * continue — also event-sourced, for the same replay-correctness reason. */
export function reopenInnings(match, innings) {
    const event = newEventShell(innings, 'reopen');
    event.isLegal = false;
    innings.balls.push(event);
    applyEventEffects(match, innings, event);
    match.updatedAt = Date.now();
    return event;
}

// ── Undo / history editing ───────────────────────────────────

function resetInningsToStart(innings) {
    innings.striker = innings.initialStriker;
    innings.nonStriker = innings.initialNonStriker;
    innings.currentBowler = innings.initialBowler;
    innings.dismissedBatters = [];
    innings.retiredBatters = [];
    innings.yetToBat = innings.initialYetToBat.slice();
    innings.completedOvers = 0;
    innings.complete = false;
    innings.completeReason = null;
}

/** Keeps balls[0..index), discards everything from index onward, and
 * rebuilds all derived state by replaying what's kept from scratch. */
export function undoToIndex(match, innings, index) {
    const kept = innings.balls.slice(0, Math.max(0, index));
    innings.balls = [];
    resetInningsToStart(innings);
    for (const event of kept) {
        innings.balls.push(event);
        applyEventEffects(match, innings, event);
    }
    match.updatedAt = Date.now();
}

/** Undo just the most recent event (ball or end-of-over). */
export function undoLastEvent(match, innings) {
    undoToIndex(match, innings, innings.balls.length - 1);
}

/** Rebuilds what innings state looked like just before balls[index] happened,
 * as an independent scratch copy — used to build historically-accurate
 * pickers (e.g. who was actually eligible to come in) when hand-editing a
 * past ball, without disturbing the real, current innings state. */
function snapshotBeforeIndex(match, innings, index) {
    const scratch = JSON.parse(JSON.stringify(innings));
    resetInningsToStart(scratch);
    for (let i = 0; i < index; i++) {
        applyEventEffects(match, scratch, scratch.balls[i]);
    }
    return scratch;
}

export function eligibleIncomingBattersAtIndex(match, innings, index) {
    return eligibleIncomingBatters(snapshotBeforeIndex(match, innings, index));
}

export function battersAtCreaseBeforeIndex(match, innings, index) {
    const s = snapshotBeforeIndex(match, innings, index);
    return { striker: s.striker, nonStriker: s.nonStriker };
}

/** Hand-edits a single past ball in place (wrong runs, wrong dismissal type,
 * etc.) WITHOUT discarding everything recorded after it — patches the
 * event's fields, then rebuilds all derived state by replaying the whole,
 * now-corrected log from scratch. Same replay primitive as undo, just
 * without truncating first. */
export function editEventAtIndex(match, innings, index, patch) {
    Object.assign(innings.balls[index], patch);
    resetInningsToStart(innings);
    for (const event of innings.balls) {
        applyEventEffects(match, innings, event);
    }
    match.updatedAt = Date.now();
}

/** A human-readable one-line summary of a single event, for the ball-by-ball
 * history list. */
export function describeEvent(event) {
    if (event.kind === 'endOver') return `— End of over ${event.overNumber} —`;
    if (event.kind === 'setBowler') return `${event.bowler} to bowl over ${event.overNumber}`;
    if (event.kind === 'manualEnd') return `— Innings ended manually —`;
    if (event.kind === 'reopen') return `— Innings reopened —`;
    if (event.void && event.wicket?.type === 'retired') {
        return `${event.wicket.batterOut} retires${event.newBatter ? ` (${event.newBatter} in)` : ''}`;
    }
    if (event.wicket) {
        return `WICKET: ${event.wicket.batterOut} ${formatHowOut(event.wicket, event.bowler)}${event.newBatter ? ` — ${event.newBatter} in` : ' — innings over'}`;
    }
    if (event.extraType === 'wide') return `Wide, ${event.extraRuns} run${event.extraRuns === 1 ? '' : 's'}`;
    if (event.extraType === 'noball') return `No ball, ${event.extraRuns + event.runsOffBat} run${(event.extraRuns + event.runsOffBat) === 1 ? '' : 's'}`;
    if (event.extraType === 'bye') return `${event.extraRuns} bye${event.extraRuns === 1 ? '' : 's'}`;
    if (event.extraType === 'legbye') return `${event.extraRuns} leg bye${event.extraRuns === 1 ? '' : 's'}`;
    return `${event.striker}: ${event.runsOffBat} run${event.runsOffBat === 1 ? '' : 's'}`;
}

// ── Derived scorecard ───────────────────────────────────────

function emptyBattingLine(name) {
    return {
        name, runs: 0, balls: 0, fours: 0, sixes: 0,
        howOut: 'not out', out: false,
        // Raw dismissal fields, separate from the narrative `howOut` string
        // above, matching the Sheet's HowOut/Bowler/Fielder columns:
        dismissalCode: '', dismissalBowler: '', dismissalFielder: '',
    };
}

const DISMISSAL_CODES = {
    bowled: 'b', caught: 'ct', lbw: 'lbw', runout: 'run out',
    stumped: 'st', hitwicket: 'hw', retired: 'not out',
};

function emptyBowlingLine(name) {
    return { name, legalBalls: 0, runs: 0, wickets: 0, maidens: 0 };
}

function computeScorecardRaw(innings) {
    const batting = {}; // name -> line
    const bowling = {}; // name -> line
    const battingOrder = [];
    const bowlingOrder = [];
    let totalRuns = 0;
    let extrasWide = 0, extrasNoBall = 0, extrasBye = 0, extrasLegBye = 0;

    function ensureBatter(name) {
        if (!batting[name]) { batting[name] = emptyBattingLine(name); battingOrder.push(name); }
        return batting[name];
    }
    function ensureBowler(name) {
        if (!bowling[name]) { bowling[name] = emptyBowlingLine(name); bowlingOrder.push(name); }
        return bowling[name];
    }

    for (const ball of innings.balls) {
        if (NON_DELIVERY_KINDS.includes(ball.kind)) continue;

        if (ball.void) {
            // Retirement — mark as not-yet-out, no stat impact beyond appearing in the order.
            ensureBatter(ball.wicket.batterOut);
            continue;
        }

        const batter = ensureBatter(ball.striker);
        const bowler = ensureBowler(ball.bowler);

        if (ball.kind === 'run') {
            batter.runs += ball.runsOffBat;
            batter.balls += 1;
            if (ball.runsOffBat === 4) batter.fours += 1;
            if (ball.runsOffBat === 6) batter.sixes += 1;
            totalRuns += ball.runsOffBat;
            bowler.runs += ball.runsOffBat;
            if (ball.isLegal) bowler.legalBalls += 1;
        } else if (ball.kind === 'bye' || ball.kind === 'legbye') {
            batter.balls += 1;
            totalRuns += ball.extraRuns;
            if (ball.kind === 'bye') extrasBye += ball.extraRuns; else extrasLegBye += ball.extraRuns;
            bowler.legalBalls += 1; // byes/legbyes only occur off legal deliveries
            // not charged to the bowler's runs
        } else if (ball.kind === 'wide') {
            totalRuns += ball.extraRuns;
            extrasWide += ball.extraRuns;
            bowler.runs += ball.extraRuns;
            if (ball.isLegal) bowler.legalBalls += 1;
        } else if (ball.kind === 'noball') {
            batter.runs += ball.runsOffBat;
            if (ball.runsOffBat === 4) batter.fours += 1;
            if (ball.runsOffBat === 6) batter.sixes += 1;
            totalRuns += ball.extraRuns + ball.runsOffBat;
            extrasNoBall += ball.extraRuns;
            bowler.runs += ball.extraRuns + ball.runsOffBat;
            if (ball.isLegal) bowler.legalBalls += 1;
            // no-balls don't count as a ball faced
        } else if (ball.kind === 'wicket') {
            if (ball.extraType === 'wide') {
                totalRuns += ball.extraRuns;
                extrasWide += ball.extraRuns;
                bowler.runs += ball.extraRuns;
            } else if (ball.extraType === 'noball') {
                totalRuns += ball.extraRuns + ball.runsOffBat;
                extrasNoBall += ball.extraRuns;
                bowler.runs += ball.extraRuns + ball.runsOffBat;
                batter.runs += ball.runsOffBat;
            } else {
                batter.runs += ball.runsOffBat;
                batter.balls += 1;
                totalRuns += ball.runsOffBat;
                bowler.runs += ball.runsOffBat;
            }
            if (ball.isLegal) bowler.legalBalls += 1;
            if (ball.wicket.creditedToBowler) bowler.wickets += 1;

            const dismissed = ensureBatter(ball.wicket.batterOut);
            dismissed.out = true;
            dismissed.howOut = formatHowOut(ball.wicket, ball.bowler);
            dismissed.dismissalCode = DISMISSAL_CODES[ball.wicket.type] || ball.wicket.type;
            dismissed.dismissalBowler = ball.wicket.creditedToBowler ? ball.bowler : '';
            dismissed.dismissalFielder = ball.wicket.fielder || '';
        }
    }

    const finalBowlingOrder = bowlingOrder.map(n => bowling[n]);
    for (const line of finalBowlingOrder) {
        line.overs = bowlingOversDisplay(line.legalBalls);
    }

    return {
        battingOrder: battingOrder.map(n => batting[n]),
        bowlingOrder: finalBowlingOrder,
        totalRuns,
        wickets: innings.dismissedBatters.length,
        legalBalls: legalBallsBowled(innings),
        oversDisplay: oversDisplay(innings),
        extras: { wide: extrasWide, noBall: extrasNoBall, bye: extrasBye, legBye: extrasLegBye,
                  total: extrasWide + extrasNoBall + extrasBye + extrasLegBye },
    };
}

/**
 * The full, final scorecard: ball-by-ball → row overrides → team-total
 * override, applied in that order. Each stage cascades into the next by
 * default (hand-correcting a batter's runs changes the total; hand-editing a
 * ball changes both) — but an explicit override at any stage freezes that
 * one figure and never propagates back down to the stages below it.
 */
export function computeScorecard(innings) {
    return applyTeamOverride(applyRowOverrides(computeScorecardRaw(innings), innings), innings);
}

/** The scorecard with row-level (batting/bowling) overrides applied and
 * cascaded into the total, but WITHOUT any team-total override — i.e. what
 * the total "should" be per the scorecard rows, ignoring a hand-typed total.
 * Used to detect when an overridden team total disagrees with its own
 * scorecard. */
export function computeScorecardBeforeTeamOverride(innings) {
    return applyRowOverrides(computeScorecardRaw(innings), innings);
}

/** The scorecard as the ball-by-ball log alone would produce it, ignoring
 * every override — used to detect when the scorecard (row overrides
 * cascaded into the total) disagrees with what was actually bowled. Never
 * used to block a save; overrides are allowed to disagree on purpose, this
 * is only for surfacing a standing warning. */
export function computeScorecardWithoutOverrides(innings) {
    return computeScorecardRaw(innings);
}

/** A human-readable result summary for the home screen once a match is
 * marked finished — team batting first wins by runs, team batting second
 * wins by wickets in hand (playersPerSide minus wickets lost, matching the
 * LMS format's ceiling). Returns null when there isn't enough data yet
 * (fewer than two innings started) rather than guessing. */
export function computeMatchResult(match) {
    if (!match.battedFirst || match.innings.length < 2) return null;
    const firstInnings = match.innings.find(i => i.battingTeam === match.battedFirst);
    const secondInnings = match.innings.find(i => i.battingTeam !== match.battedFirst);
    if (!firstInnings || !secondInnings) return null;

    const firstTeamName = match.battedFirst === 'A' ? match.teamA : match.teamB;
    const secondTeamName = match.battedFirst === 'A' ? match.teamB : match.teamA;
    const scFirst = computeScorecard(firstInnings);
    const scSecond = computeScorecard(secondInnings);

    let summary;
    if (scFirst.totalRuns === scSecond.totalRuns) {
        summary = `Match tied (${firstTeamName} ${scFirst.totalRuns}/${scFirst.wickets}, ${secondTeamName} ${scSecond.totalRuns}/${scSecond.wickets})`;
    } else if (scFirst.totalRuns > scSecond.totalRuns) {
        const margin = scFirst.totalRuns - scSecond.totalRuns;
        summary = `${firstTeamName} won by ${margin} run${margin === 1 ? '' : 's'}`;
    } else {
        const wicketsInHand = Math.max(0, match.playersPerSide - scSecond.wickets);
        summary = `${secondTeamName} won by ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'}`;
    }
    if (!firstInnings.complete || !secondInnings.complete) {
        summary += ' (an innings is not marked complete)';
    }
    return summary;
}

/**
 * Manual per-field overrides always win over the ball-derived figures above —
 * "full editing, even if it contradicts the ball-by-ball" is a deliberate
 * requirement, not a bug. Overrides live on innings.overrides, keyed
 * "batting:<name>" / "bowling:<name>", and are applied here so every
 * consumer of computeScorecard (the UI, the Sheet export) sees the same
 * corrected figures — there's only one computeScorecard, not a raw version
 * plus a UI-only wrapper that the export path could accidentally bypass.
 */
export function setFieldOverride(innings, kind, name, field, value) {
    if (!innings.overrides) innings.overrides = {};
    const key = `${kind}:${name}`;
    if (!innings.overrides[key]) innings.overrides[key] = {};
    const numericFields = ['runs', 'balls', 'fours', 'sixes', 'maidens', 'wickets'];
    innings.overrides[key][field] = numericFields.includes(field) ? (Number(value) || 0) : value;
}

/** Clears every hand-entered override on an innings — every batting/bowling
 * row and the team total revert to exactly what the ball-by-ball record
 * says. The ball-by-ball log itself is untouched; this only removes the
 * correction layer on top of it. */
export function clearOverrides(innings) {
    innings.overrides = {};
}

// The team total ("team", "_") is a single override slot per innings — it's
// what actually decides the match result and feeds Team1_Runs/Wickets/Overs
// in the export, so it's kept independently editable from individual
// batting/bowling lines rather than trying to keep them in sync automatically
// (same relationship the Sheet already has: the Fixtures_Results score and
// the Batting/Bowling rows are two separately-entered things there too).
export function teamOverrideKey() {
    return 'team:_';
}

/** Applies batting/bowling row overrides, then recomputes totalRuns/wickets
 * as the SUM of the (now-overridden) rows — so the total automatically
 * cascades from the scorecard instead of staying independently tied to the
 * raw ball-by-ball once a row has been hand-corrected. Extras aren't
 * attributed to a batter, so they're carried over from the raw total as-is;
 * oversDisplay is left as the raw ball-derived value (overs isn't something
 * rows are individually overridden to sum into). */
function applyRowOverrides(scorecard, innings) {
    if (innings.overrides) {
        for (const line of scorecard.battingOrder) {
            const ov = innings.overrides[`batting:${line.name}`];
            if (ov) Object.assign(line, ov);
        }
        for (const line of scorecard.bowlingOrder) {
            const ov = innings.overrides[`bowling:${line.name}`];
            if (ov) Object.assign(line, ov);
        }
    }
    scorecard.totalRuns = scorecard.battingOrder.reduce((sum, b) => sum + (Number(b.runs) || 0), 0) + scorecard.extras.total;
    scorecard.wickets = scorecard.battingOrder.filter(b => b.out).length;
    return scorecard;
}

/** Applies the team-total override last, if present — it always wins over
 * whatever the (possibly row-cascaded) total above it says, and never
 * propagates back down to the rows or the ball-by-ball. */
function applyTeamOverride(scorecard, innings) {
    const teamOv = innings.overrides?.[teamOverrideKey()];
    if (teamOv) {
        if (teamOv.runs !== undefined) scorecard.totalRuns = teamOv.runs;
        if (teamOv.wickets !== undefined) scorecard.wickets = teamOv.wickets;
        if (teamOv.overs !== undefined) scorecard.oversDisplay = teamOv.overs;
    }
    return scorecard;
}

export function formatHowOut(wicket, bowlerName) {
    if (!wicket) return 'not out';
    switch (wicket.type) {
        case 'bowled': return `b ${bowlerName}`;
        case 'caught': return wicket.fielder ? `c ${wicket.fielder} b ${bowlerName}` : `c & b ${bowlerName}`;
        case 'lbw': return `lbw b ${bowlerName}`;
        case 'runout': return wicket.fielder ? `run out (${wicket.fielder})` : 'run out';
        case 'stumped': return `st ${wicket.fielder || '?'} b ${bowlerName}`;
        case 'hitwicket': return `hit wicket b ${bowlerName}`;
        case 'retired': return 'retired not out';
        default: return wicket.type;
    }
}

export function bowlingOversDisplay(legalBalls) {
    return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}
