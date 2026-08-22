/**
 * Imperial Super Sixes - Live Scorer UI.
 * Single-page app: one #app mount point, fully re-rendered on state change.
 * No build step, no framework — matches the rest of the site.
 */

import * as Rules from './scorer-rules.js';
import * as Storage from './scorer-storage.js';
import * as Export from './scorer-export.js';
import * as Roster from './scorer-roster.js';
import * as Submit from './scorer-submit.js';

const app = document.getElementById('app');

// Event kinds that mark a structural moment (over/bowler/innings-state
// changes) rather than an actual delivery — kept in sync with the same list
// in scorer-rules.js, used here only for UI filtering/display decisions.
const STRUCTURAL_EVENT_KINDS = ['endOver', 'setBowler', 'manualEnd', 'reopen'];
// Of those, these have no dedicated edit form (nothing to hand-correct,
// only undo) — setBowler is excluded since it IS editable (reassign who bowled).
const NO_EDIT_FORM_KINDS = ['endOver', 'manualEnd', 'reopen'];

// ── App state ────────────────────────────────────────────────

let state = {
    screen: 'home',   // home | setup | inningsSetup | scoring | scorecard | export | history
    match: null,        // current Rules match object
    panel: null,          // active bottom-sheet panel, or null
    panelData: {},         // scratch data for whatever panel is open (e.g. which row is being edited)
    historyInningsNumber: null, // which innings the ball-by-ball screen is showing — lets you
                                 // view/edit a CLOSED innings, not just whichever is current
    historyReturnScreen: 'scoring', // where the history screen's Back button goes
    submitStatus: null, // { state: 'submitting'|'success'|'error', ... } for the Export screen's direct-submit
};

function setState(patch) {
    state = { ...state, ...patch };
    render();
}

function currentInnings() {
    if (!state.match || !state.match.innings.length) return null;
    return state.match.innings[state.match.innings.length - 1];
}

/** The innings the ball-by-ball narrative screen (and its Edit/Undo panels)
 * is currently showing — may be a CLOSED innings the scorer navigated to
 * directly from the scorecard, not just whichever innings is live. */
function historyInnings() {
    if (!state.match) return null;
    return state.match.innings.find(i => i.inningsNumber === state.historyInningsNumber) || currentInnings();
}

function saveCurrentMatch() {
    if (state.match) Storage.saveMatch(state.match);
}

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** A real <select> dropdown of `options`, with an "Other" choice that reveals
 * a free-text fallback — "dropdown from the named list, free entry if
 * required" for any player-name field in the override UI. A plain
 * input+datalist looked right on desktop but datalist suggestions don't
 * render as an actual dropdown on many mobile browsers, so this uses a real
 * <select> instead. */
function playerSelect(id, options, currentValue, { emptyLabel = '— none / not applicable —', extraAttrs = '' } = {}) {
    const isCustom = !!currentValue && !options.includes(currentValue);
    return `
        <select id="${id}" data-player-select ${extraAttrs}>
            <option value="">${esc(emptyLabel)}</option>
            ${options.map(p => `<option value="${esc(p)}" ${p === currentValue ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            <option value="__other__" ${isCustom ? 'selected' : ''}>Other (type name)…</option>
        </select>
        <input type="text" id="${id}-other" class="scorer-inline-edit" placeholder="Type name" autocomplete="off"
               value="${esc(isCustom ? currentValue : '')}" style="margin-top:0.4rem;${isCustom ? '' : 'display:none;'}">`;
}

/** Reads the resolved value from a playerSelect() — either the picked
 * roster name, or whatever was typed into the "Other" fallback field. */
function playerSelectValue(id) {
    const sel = document.getElementById(id);
    if (!sel) return '';
    if (sel.value === '__other__') {
        const other = document.getElementById(`${id}-other`);
        return other ? other.value.trim() : '';
    }
    return sel.value;
}

// ── Home screen ──────────────────────────────────────────────

function matchRowHtml(m) {
    let resultLine = '';
    let badge = '';
    if (m.ended) {
        const fullMatch = Storage.loadMatch(m.matchNo);
        const result = fullMatch ? Rules.computeMatchResult(fullMatch) : null;
        resultLine = `<span class="scorer-match-result">${esc(result || 'Result pending')}</span>`;
        badge = m.abandoned
            ? '<span class="scorer-abandoned-badge">Abandoned</span>'
            : '<span class="scorer-finished-badge">Finished</span>';
    }
    return `
    <div class="scorer-match-row">
        <button class="scorer-match-open" data-action="open-match" data-matchno="${m.matchNo}">
            <span class="scorer-match-teams">#${m.matchNo} ${esc(m.teamA)} vs ${esc(m.teamB)} ${badge}</span>
            <span class="scorer-match-meta">${esc(m.round)} · ${m.inningsCount} innings started</span>
            ${resultLine}
        </button>
        <button class="scorer-match-settings-btn" data-action="open-panel" data-panel="matchSettings" data-matchno="${m.matchNo}" title="Match settings">&#9881;</button>
    </div>`;
}

function renderHome() {
    const allMatches = Storage.listSavedMatches();
    const matches = allMatches.filter(m => !m.archived);
    const archived = allMatches.filter(m => m.archived);
    return `
    <div class="scorer-header">
        <h1>Super Sixes Scorer</h1>
    </div>
    <div class="scorer-panel">
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="new-match">+ New Match</button>
    </div>
    ${matches.length ? `
    <div class="scorer-panel">
        <h3>Saved matches</h3>
        <div class="scorer-match-list">
            ${matches.map(matchRowHtml).join('')}
        </div>
    </div>` : ''}
    ${archived.length ? `
    <div class="scorer-panel">
        <details>
            <summary>Archived matches (${archived.length})</summary>
            <div class="scorer-match-list" style="margin-top:0.6rem;">
                ${archived.map(matchRowHtml).join('')}
            </div>
        </details>
    </div>` : ''}
    ${renderPanel()}
    `;
}

// ── Match setup screen ───────────────────────────────────────

function renderSetup() {
    const teamNames = Roster.TEAMS.map(t => t.name);
    return `
    <div class="scorer-header">
        <button class="scorer-back" data-action="go-home">&larr; Matches</button>
        <h1>New Match</h1>
    </div>
    <form class="scorer-panel scorer-form" id="setup-form">
        <label>Match No <input type="number" name="matchNo" required min="1"></label>
        <label>Round
            <select name="round">
                <option>Group A</option>
                <option>Group B</option>
                <option>Semi Final 1</option>
                <option>Semi Final 2</option>
                <option>Wooden Spoon</option>
                <option>3rd Place Playoff</option>
                <option>Final</option>
            </select>
        </label>
        <label>Team 1 (bats first, unless you set BattedFirst later)
            ${playerSelect('teamASelect', teamNames, '', { emptyLabel: '— choose a team —', extraAttrs: 'data-roster-target="rosterA"' })}
        </label>
        <label>Team 1 players — one name per line
            <textarea id="rosterA" name="rosterA" rows="7" required placeholder="Player 1&#10;Player 2&#10;..."></textarea>
        </label>
        <label>Team 2
            ${playerSelect('teamBSelect', teamNames, '', { emptyLabel: '— choose a team —', extraAttrs: 'data-roster-target="rosterB"' })}
        </label>
        <label>Team 2 players — one name per line
            <textarea id="rosterB" name="rosterB" rows="7" required placeholder="Player 1&#10;Player 2&#10;..."></textarea>
        </label>
        <p class="scorer-hint">Picking a team fills in its usual squad — edit freely if someone's sitting out or filling in.</p>
        <details>
            <summary>Advanced (format settings)</summary>
            <label>Overs per innings <input type="number" name="oversPerInnings" value="5" min="1"></label>
            <label>Players per side <input type="number" name="playersPerSide" value="6" min="2"></label>
        </details>
        <button type="submit" class="scorer-btn scorer-btn-primary scorer-btn-lg">Start Match &rarr;</button>
    </form>
    `;
}

function handleSetupSubmit(form) {
    const data = new FormData(form);
    const teamA = playerSelectValue('teamASelect');
    const teamB = playerSelectValue('teamBSelect');
    if (!teamA || !teamB) {
        alert('Pick or type a name for both teams before starting the match.');
        return;
    }
    const rosterA = String(data.get('rosterA')).split('\n').map(s => s.trim()).filter(Boolean);
    const rosterB = String(data.get('rosterB')).split('\n').map(s => s.trim()).filter(Boolean);
    const match = Rules.createMatch({
        matchNo: Number(data.get('matchNo')),
        round: data.get('round'),
        teamA, teamB,
        rosterA, rosterB,
        oversPerInnings: Number(data.get('oversPerInnings')) || 5,
        playersPerSide: Number(data.get('playersPerSide')) || 6,
    });
    setState({ match, screen: 'inningsSetup' });
    saveCurrentMatch();
}

// ── Innings setup screen ─────────────────────────────────────

function renderInningsSetup() {
    const m = state.match;
    const inningsNumber = m.innings.length + 1;
    const suggestedBattingTeam = inningsNumber === 1 ? 'A' : (m.battedFirst === 'A' ? 'B' : 'A');
    return `
    <div class="scorer-header">
        <button class="scorer-back" data-action="go-home">&larr; Matches</button>
        <h1>#${m.matchNo} ${esc(m.teamA)} vs ${esc(m.teamB)}</h1>
        <p class="scorer-sub">Innings ${inningsNumber} setup</p>
    </div>
    <form class="scorer-panel scorer-form" id="innings-setup-form">
        <label>Batting team
            <select name="battingTeam">
                <option value="A" ${suggestedBattingTeam === 'A' ? 'selected' : ''}>${esc(m.teamA)}</option>
                <option value="B" ${suggestedBattingTeam === 'B' ? 'selected' : ''}>${esc(m.teamB)}</option>
            </select>
        </label>
        <label>Opening striker <select name="striker" id="strikerSelect"></select></label>
        <label>Opening non-striker <select name="nonStriker" id="nonStrikerSelect"></select></label>
        <label>Opening bowler <select name="bowler" id="bowlerSelect"></select></label>
        <p class="scorer-hint" id="rosterSizeHint"></p>
        <button type="submit" class="scorer-btn scorer-btn-primary scorer-btn-lg">Start Innings &rarr;</button>
    </form>
    `;
}

function wireInningsSetupSelects(form) {
    const m = state.match;
    const hint = document.getElementById('rosterSizeHint');
    function fillBatters() {
        const team = form.battingTeam.value;
        const roster = Rules.rosterFor(m, team);
        form.striker.innerHTML = roster.map(p => `<option>${esc(p)}</option>`).join('');
        form.nonStriker.innerHTML = roster.map(p => `<option>${esc(p)}</option>`).join('');
        form.nonStriker.selectedIndex = 1;
        const bowlingRoster = Rules.rosterFor(m, team === 'A' ? 'B' : 'A');
        form.bowler.innerHTML = bowlingRoster.map(p => `<option>${esc(p)}</option>`).join('');
        if (hint) {
            hint.textContent = roster.length > m.playersPerSide
                ? `Squad has ${roster.length} names listed but this is a ${m.playersPerSide}-a-side match.`
                : '';
        }
    }
    form.battingTeam.addEventListener('change', fillBatters);
    fillBatters();
}

function handleInningsSetupSubmit(form) {
    const data = new FormData(form);
    Rules.startInnings(state.match, {
        battingTeam: data.get('battingTeam'),
        striker: data.get('striker'),
        nonStriker: data.get('nonStriker'),
        bowler: data.get('bowler'),
    });
    setState({ screen: 'scoring', panel: null });
    saveCurrentMatch();
}

// ── Scoring screen ───────────────────────────────────────────

function ballGlyph(ball) {
    if (ball.void) return `<span class="ball-pill ball-retire" title="Retired">R</span>`;
    if (ball.wicket) return `<span class="ball-pill ball-wicket" title="${esc(Rules.formatHowOut(ball.wicket, ball.bowler))}">W</span>`;
    if (ball.extraType === 'wide') return `<span class="ball-pill ball-extra" title="Wide">Wd${ball.extraRuns > (state.match.extraRunsWideNoBall || 1) ? '+' : ''}</span>`;
    if (ball.extraType === 'noball') return `<span class="ball-pill ball-extra" title="No ball">Nb${ball.runsOffBat ? '+' + ball.runsOffBat : ''}</span>`;
    if (ball.extraType === 'bye') return `<span class="ball-pill ball-extra" title="Bye">B${ball.extraRuns}</span>`;
    if (ball.extraType === 'legbye') return `<span class="ball-pill ball-extra" title="Leg bye">Lb${ball.extraRuns}</span>`;
    return `<span class="ball-pill">${ball.runsOffBat}</span>`;
}

function renderScoring() {
    const m = state.match;
    const inn = currentInnings();
    if (!inn) return renderInningsSetup();

    if (inn.complete) return renderInningsCompletePrompt();
    if (!inn.currentBowler) return renderNewOverPrompt();

    const sc = Rules.computeScorecard(inn);
    const strikerLine = sc.battingOrder.find(b => b.name === inn.striker) || { runs: 0, balls: 0 };
    const nonStrikerLine = sc.battingOrder.find(b => b.name === inn.nonStriker) || { runs: 0, balls: 0 };
    const bowlerLine = sc.bowlingOrder.find(b => b.name === inn.currentBowler) || { runs: 0, legalBalls: 0, wickets: 0 };
    const battingTeamName = inn.battingTeam === 'A' ? m.teamA : m.teamB;
    const bowlingTeamName = inn.bowlingTeam === 'A' ? m.teamA : m.teamB;

    const thisOverBalls = inn.balls.filter(b => b.overNumber === (inn.completedOvers + 1) && !STRUCTURAL_EVENT_KINDS.includes(b.kind));
    const legalThisOver = thisOverBalls.filter(b => b.isLegal && !b.void).length;
    const overReadyToEnd = legalThisOver >= 6;

    const panelHtml = renderPanel();

    return `
    <div class="scorer-header scorer-header-compact">
        <button class="scorer-back" data-action="go-home">&larr;</button>
        <div class="scorer-score-summary">
            <strong>${esc(battingTeamName)} ${sc.totalRuns}/${sc.wickets}</strong>
            <span>(${sc.oversDisplay} ov)</span>
        </div>
        <button class="scorer-back" data-action="show-scorecard">Scorecard</button>
    </div>
    <div class="scorer-panel scorer-live-panel">
        <div class="scorer-over-track">${thisOverBalls.map(ballGlyph).join('')}</div>
        <div class="scorer-players-row">
            <div class="scorer-player-card scorer-striker">
                <span class="scorer-player-name">${esc(inn.striker)} *</span>
                <span class="scorer-player-figs">${strikerLine.runs} (${strikerLine.balls})</span>
            </div>
            <div class="scorer-player-card">
                ${inn.nonStriker ? `
                <span class="scorer-player-name">${esc(inn.nonStriker)}</span>
                <span class="scorer-player-figs">${nonStrikerLine.runs} (${nonStrikerLine.balls})</span>
                ` : `<span class="scorer-player-name">— batting alone (LMS) —</span>`}
            </div>
        </div>
        <div class="scorer-bowler-row">
            <span class="scorer-player-name">${esc(inn.currentBowler)} (${bowlingTeamName})</span>
            <span class="scorer-player-figs">${bowlerLine.wickets}/${bowlerLine.runs}, ${bowlerLine.overs || '0.0'} ov</span>
        </div>
    </div>

    ${overReadyToEnd ? `
    <div class="scorer-panel scorer-end-over-banner">
        <p>${legalThisOver} balls bowled this over. Keep going, or:</p>
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="end-over">End Over &rarr;</button>
    </div>` : ''}

    <div class="scorer-panel scorer-buttons">
        <div class="scorer-run-grid">
            ${[0, 1, 2, 3, 4, 6].map(r => `<button class="scorer-btn scorer-run-btn" data-action="run" data-runs="${r}">${r}</button>`).join('')}
            <button class="scorer-btn scorer-run-btn" data-action="open-panel" data-panel="otherRuns">?</button>
        </div>
        <div class="scorer-extra-grid">
            <button class="scorer-btn" data-action="open-panel" data-panel="wide">Wide</button>
            <button class="scorer-btn" data-action="open-panel" data-panel="noball">No Ball</button>
            <button class="scorer-btn" data-action="open-panel" data-panel="bye">Bye</button>
            <button class="scorer-btn" data-action="open-panel" data-panel="legbye">Leg Bye</button>
        </div>
        <div class="scorer-action-grid">
            <button class="scorer-btn scorer-btn-danger" data-action="open-panel" data-panel="wicket">Wicket</button>
            <button class="scorer-btn" data-action="open-panel" data-panel="retire">Retire</button>
            <button class="scorer-btn" data-action="undo-last">&#8630; Undo Last Ball</button>
            <button class="scorer-btn" data-action="open-panel" data-panel="fixMistake">Fix a Mistake</button>
        </div>
    </div>
    ${panelHtml}
    `;
}

function renderNewOverPrompt() {
    const m = state.match;
    const inn = currentInnings();
    const sc = Rules.computeScorecard(inn);
    const battingTeamName = inn.battingTeam === 'A' ? m.teamA : m.teamB;
    const bowlingRoster = Rules.rosterFor(m, inn.bowlingTeam);
    const lastBowler = [...inn.balls].reverse().find(b => !b.void && !STRUCTURAL_EVENT_KINDS.includes(b.kind))?.bowler;
    return `
    <div class="scorer-header scorer-header-compact">
        <button class="scorer-back" data-action="go-home">&larr;</button>
        <div class="scorer-score-summary">
            <strong>${esc(battingTeamName)} ${sc.totalRuns}/${sc.wickets}</strong>
            <span>(${sc.oversDisplay} ov)</span>
        </div>
        <button class="scorer-back" data-action="show-scorecard">Scorecard</button>
    </div>
    <form class="scorer-panel scorer-form" id="new-over-form">
        <p>Who's bowling over ${inn.completedOvers + 1}?</p>
        <label>Bowler
            <select name="bowler">
                ${bowlingRoster.map(p => `<option>${esc(p)}</option>`).join('')}
            </select>
        </label>
        ${lastBowler ? `<p class="scorer-hint">Last over: ${esc(lastBowler)} bowled the previous over.</p>` : ''}
        <button type="submit" class="scorer-btn scorer-btn-primary scorer-btn-lg">Start Over &rarr;</button>
    </form>
    `;
}

function renderInningsCompletePrompt() {
    const m = state.match;
    const inn = currentInnings();
    const sc = Rules.computeScorecard(inn);
    const battingTeamName = inn.battingTeam === 'A' ? m.teamA : m.teamB;
    const isSecondInnings = m.innings.length >= 2;
    const reasonLabel = { all_out: 'All out', overs_complete: 'Overs complete', manual: 'Ended manually' }[inn.completeReason] || '';
    return `
    <div class="scorer-header">
        <button class="scorer-back" data-action="go-home">&larr; Matches</button>
        <h1>Innings ${inn.inningsNumber} Complete</h1>
    </div>
    <div class="scorer-panel">
        <p><strong>${esc(battingTeamName)}: ${sc.totalRuns}/${sc.wickets}</strong> (${sc.oversDisplay} ov)</p>
        <p class="scorer-hint">${reasonLabel}</p>
        <div class="scorer-action-grid">
            ${!isSecondInnings ? `<button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="start-next-innings">Start 2nd Innings &rarr;</button>` : ''}
            <button class="scorer-btn" data-action="show-scorecard">View Full Scorecard</button>
            <button class="scorer-btn" data-action="reopen-innings">Reopen this innings (undo completion)</button>
        </div>
    </div>
    `;
}

// ── Sub-panels ────────────────────────────────────────────────

function renderPanel() {
    if (!state.panel) return '';
    switch (state.panel) {
        case 'wide': return renderExtraPanel('wide', 'Wide');
        case 'noball': return renderExtraPanel('noball', 'No Ball');
        case 'bye': return renderExtraPanel('bye', 'Bye');
        case 'legbye': return renderExtraPanel('legbye', 'Leg Bye');
        case 'otherRuns': return renderOtherRunsPanel();
        case 'wicket': return renderWicketPanel();
        case 'retire': return renderRetirePanel();
        case 'fixMistake': return renderFixMistakePanel();
        case 'changeBowlerMidOver': return renderChangeBowlerPanel();
        case 'editBattingRow': return renderEditBattingRowPanel();
        case 'editBowlingRow': return renderEditBowlingRowPanel();
        case 'editTeamTotal': return renderEditTeamTotalPanel();
        case 'matchSettings': return renderMatchSettingsPanel();
        case 'confirmResetOverrides': return renderConfirmResetOverridesPanel();
        case 'confirmUndoTo': return renderConfirmUndoToPanel();
        case 'ballActions': return renderBallActionsPanel();
        case 'editBall': return renderEditBallPanel();
        default: return '';
    }
}

function panelShell(title, bodyHtml) {
    // NOTE: the overlay itself deliberately has NO data-action — closing on
    // backdrop click is handled by the explicit e.target === overlay check
    // in the click handler below. Giving the overlay its own data-action
    // previously meant ANY click inside the sheet that didn't land on an
    // element with its own data-action (e.g. a <select>, a label, empty
    // space) bubbled up via closest() to the overlay's close action and
    // closed the whole panel — which is exactly the "can't change the
    // dropdown, any click closes it" bug.
    return `
    <div class="scorer-overlay">
        <div class="scorer-sheet">
            <div class="scorer-sheet-header">
                <h3>${esc(title)}</h3>
                <button class="scorer-close" data-action="close-panel">&times;</button>
            </div>
            ${bodyHtml}
        </div>
    </div>`;
}

function renderExtraPanel(kind, title) {
    const inn = currentInnings();
    const rule = Rules.extrasRuleForOverPublic(state.match, inn);
    if (kind === 'wide' || kind === 'noball') {
        return panelShell(title, `
            <p class="scorer-hint">Worth ${state.match.extraRunsWideNoBall} run${state.match.extraRunsWideNoBall === 1 ? '' : 's'} this over${rule.rebowl ? ', and will be rebowled' : ', and counts as a legal ball (no rebowl)'}.</p>
            <label>${kind === 'wide' ? 'Extra runs actually run (beyond the penalty)' : 'Runs the batter scored off it'}
                <input type="number" id="extraRunsInput" value="0" min="0">
            </label>
            <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-extra" data-kind="${kind}">Confirm</button>
        `);
    }
    // bye / legbye
    return panelShell(title, `
        <label>Runs run
            <input type="number" id="extraRunsInput" value="1" min="1">
        </label>
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-extra" data-kind="${kind}">Confirm</button>
    `);
}

function renderOtherRunsPanel() {
    return panelShell('Other Runs', `
        <p class="scorer-hint">For anything outside 0/1/2/3/4/6 — e.g. 5 runs from overthrows.</p>
        <label>Runs off the bat <input type="number" id="otherRunsInput" value="5" min="0" autofocus></label>
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-other-runs">Confirm</button>
    `);
}

function renderWicketPanel() {
    const m = state.match;
    const inn = currentInnings();
    const incoming = Rules.eligibleIncomingBatters(inn);
    const isLastBatterStanding = incoming.length === 0;
    return panelShell('Wicket', `
        <label>Batter out
            <select id="wicketBatterOut">
                <option value="${esc(inn.striker)}">${esc(inn.striker)} (striker)</option>
                ${inn.nonStriker ? `<option value="${esc(inn.nonStriker)}">${esc(inn.nonStriker)} (non-striker)</option>` : ''}
            </select>
        </label>
        <label>How out
            <select id="wicketType">
                <option value="bowled">Bowled</option>
                <option value="caught">Caught</option>
                <option value="lbw">LBW</option>
                <option value="runout">Run Out</option>
                <option value="stumped">Stumped</option>
                <option value="hitwicket">Hit Wicket</option>
            </select>
        </label>
        <label>Fielder (if relevant)${playerSelect('wicketFielder', Rules.rosterFor(m, inn.bowlingTeam), '')}</label>
        <label><input type="checkbox" id="wicketOffExtra"> Happened on a wide/no-ball</label>
        <label>Runs completed before the wicket <input type="number" id="wicketRunsCompleted" value="0" min="0"></label>
        <label>Incoming batter
            <select id="wicketNewBatter" ${isLastBatterStanding ? 'disabled' : ''}>
                ${isLastBatterStanding
                    ? '<option>— none left, last batter continues alone (LMS) —</option>'
                    : incoming.map(p => `<option>${esc(p)}</option>`).join('')}
            </select>
        </label>
        ${isLastBatterStanding ? '<p class="scorer-hint">No one left to come in, this dismissal ends the innings.</p>' : ''}
        <button class="scorer-btn scorer-btn-danger scorer-btn-lg" data-action="confirm-wicket" data-last-standing="${isLastBatterStanding}">Confirm Wicket</button>
    `);
}

function renderRetirePanel() {
    const inn = currentInnings();
    const incoming = Rules.eligibleIncomingBatters(inn);
    return panelShell('Retire Batter', `
        <label>Batter retiring
            <select id="retireBatterOut">
                <option value="${esc(inn.striker)}">${esc(inn.striker)} (striker)</option>
                ${inn.nonStriker ? `<option value="${esc(inn.nonStriker)}">${esc(inn.nonStriker)} (non-striker)</option>` : ''}
            </select>
        </label>
        <label>Coming in
            <select id="retireNewBatter">
                ${incoming.length ? incoming.map(p => `<option>${esc(p)}</option>`).join('') : '<option disabled>— no one eligible —</option>'}
            </select>
        </label>
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-retire" ${incoming.length ? '' : 'disabled'}>Confirm Retirement</button>
    `);
}

function renderFixMistakePanel() {
    const inn = currentInnings();
    return panelShell('Fix a Mistake', `
        <div class="scorer-action-grid">
            <button class="scorer-btn" data-action="swap-strike">Swap who's on strike</button>
            <button class="scorer-btn" data-action="end-over">End this over now (short over)</button>
            <button class="scorer-btn" data-action="open-panel" data-panel="changeBowlerMidOver">Change bowler mid-over (injury)</button>
            <button class="scorer-btn" data-action="show-history" data-innings="${inn.inningsNumber}" data-return="scoring">Ball-by-ball narrative — edit or undo</button>
            <button class="scorer-btn" data-action="show-scorecard">Edit the scorecard directly</button>
            <button class="scorer-btn scorer-btn-danger" data-action="end-innings-now">End Innings Now</button>
        </div>
        <p class="scorer-hint">For anything else, the scorecard view lets you hand-edit any figure directly, independent of the ball-by-ball log.</p>
    `);
}

function renderChangeBowlerPanel() {
    const m = state.match;
    const inn = currentInnings();
    const bowlingRoster = Rules.rosterFor(m, inn.bowlingTeam);
    return panelShell('Change Bowler Mid-Over', `
        <label>New bowler for the rest of this over
            <select id="midOverBowler">
                ${bowlingRoster.map(p => `<option ${p === inn.currentBowler ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            </select>
        </label>
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-mid-over-bowler">Confirm</button>
    `);
}

// ── Ball-by-ball history screen ───────────────────────────────

function renderHistory() {
    const m = state.match;
    const inn = historyInnings();
    if (!inn) return renderHome();
    const battingTeamName = inn.battingTeam === 'A' ? m.teamA : m.teamB;
    const labels = Rules.ballLabels(inn);
    const rows = inn.balls.map((event, idx) => {
        const isOverMarker = event.kind === 'endOver';
        const label = labels[idx];
        return `
        <button class="scorer-history-row${isOverMarker ? ' scorer-history-divider' : ''}" data-action="open-panel" data-panel="ballActions" data-undo-index="${idx}">
            <span class="scorer-history-desc">${esc(Rules.describeEvent(event))}</span>
            ${!isOverMarker ? `<span class="scorer-history-meta">${label ? esc(label) + ' · ' : ''}${esc(event.bowler || '')}</span>` : ''}
        </button>`;
    }).join('');
    return `
    <div class="scorer-header">
        <button class="scorer-back" data-action="back-from-history">&larr; Back</button>
        <h1>Ball-by-Ball</h1>
        <p class="scorer-sub">${esc(battingTeamName)}, innings ${inn.inningsNumber}${inn.complete ? ' (closed)' : ''} — tap any entry to edit it in place, or undo back to just before it happened.</p>
    </div>
    <div class="scorer-panel scorer-history-list">
        ${rows || '<p class="scorer-empty">No balls recorded yet.</p>'}
    </div>
    ${renderPanel()}
    `;
}

function renderConfirmUndoToPanel() {
    const inn = historyInnings();
    const idx = state.panelData.undoIndex;
    const event = inn.balls[idx];
    const numDiscarded = inn.balls.length - idx;
    return panelShell('Undo to here?', `
        <p>This will undo <strong>${numDiscarded}</strong> event${numDiscarded === 1 ? '' : 's'}, back to just before:</p>
        <p class="scorer-hint">"${esc(Rules.describeEvent(event))}"</p>
        <p class="scorer-hint">Everything after it will be discarded.</p>
        <button class="scorer-btn scorer-btn-danger scorer-btn-lg" data-action="confirm-undo-to">Yes, undo ${numDiscarded} event${numDiscarded === 1 ? '' : 's'}</button>
    `);
}

function renderBallActionsPanel() {
    const inn = historyInnings();
    const idx = state.panelData.undoIndex;
    const event = inn.balls[idx];
    const canEdit = !NO_EDIT_FORM_KINDS.includes(event.kind);
    return panelShell('Ball Actions', `
        <p class="scorer-hint">"${esc(Rules.describeEvent(event))}"</p>
        <div class="scorer-action-grid">
            ${canEdit ? `<button class="scorer-btn scorer-btn-primary" data-action="open-panel" data-panel="editBall" data-undo-index="${idx}">Edit this ball</button>` : ''}
            <button class="scorer-btn scorer-btn-danger" data-action="open-panel" data-panel="confirmUndoTo" data-undo-index="${idx}">Undo to just before this</button>
        </div>
        <p class="scorer-hint">Editing keeps everything recorded after it — it just corrects this one ball and recalculates from there. Undo instead discards everything after it.</p>
    `);
}

function renderEditBallPanel() {
    const m = state.match;
    const inn = historyInnings();
    const idx = state.panelData.undoIndex;
    const event = inn.balls[idx];

    if (NO_EDIT_FORM_KINDS.includes(event.kind)) {
        return panelShell('Nothing to Edit', `<p class="scorer-hint">This just marks a structural moment (${esc(Rules.describeEvent(event))}) — nothing to hand-edit here. Use "Undo to just before this" if it needs to be removed.</p>`);
    }
    if (event.kind === 'setBowler') {
        const bowlingRoster = Rules.rosterFor(m, inn.bowlingTeam);
        return panelShell('Edit: Bowler Assignment', `
            <label>Bowler for over ${event.overNumber}
                <select id="ebkBowler">${bowlingRoster.map(p => `<option ${p === event.bowler ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
            </label>
            <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-ball">Save</button>
        `);
    }
    if (event.kind === 'run') {
        return panelShell('Edit Ball: Runs', `
            <label>Runs off the bat <input type="number" id="ebkRuns" value="${event.runsOffBat}" min="0"></label>
            <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-ball">Save</button>
        `);
    }
    if (event.kind === 'wide') {
        const rule = Rules.extrasRuleForOver(m, event.overNumber);
        const runsRun = event.extraRuns - rule.runs;
        return panelShell('Edit Ball: Wide', `
            <p class="scorer-hint">Worth ${rule.runs} run${rule.runs === 1 ? '' : 's'} penalty this over${rule.rebowl ? ', and is rebowled' : ', and counts as a legal ball'}.</p>
            <label>Extra runs actually run (beyond the penalty) <input type="number" id="ebkRunsRun" value="${runsRun}" min="0"></label>
            <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-ball">Save</button>
        `);
    }
    if (event.kind === 'noball') {
        return panelShell('Edit Ball: No Ball', `
            <label>Runs the batter scored off it <input type="number" id="ebkRuns" value="${event.runsOffBat}" min="0"></label>
            <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-ball">Save</button>
        `);
    }
    if (event.kind === 'bye' || event.kind === 'legbye') {
        return panelShell(`Edit Ball: ${event.kind === 'bye' ? 'Bye' : 'Leg Bye'}`, `
            <label>Runs run <input type="number" id="ebkRuns" value="${event.extraRuns}" min="0"></label>
            <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-ball">Save</button>
        `);
    }

    // wicket / retire — need who was actually at the crease and eligible to
    // come in AT THAT POINT in history, not right now.
    const crease = Rules.battersAtCreaseBeforeIndex(m, inn, idx);
    const incoming = Rules.eligibleIncomingBattersAtIndex(m, inn, idx);
    const incomingOptions = (!event.newBatter || incoming.includes(event.newBatter)) ? incoming : [event.newBatter, ...incoming];

    if (event.kind === 'retire') {
        return panelShell('Edit Ball: Retirement', `
            <label>Batter retiring
                <select id="ebkBatterOut">
                    <option value="${esc(crease.striker)}" ${event.wicket.batterOut === crease.striker ? 'selected' : ''}>${esc(crease.striker)} (striker)</option>
                    ${crease.nonStriker ? `<option value="${esc(crease.nonStriker)}" ${event.wicket.batterOut === crease.nonStriker ? 'selected' : ''}>${esc(crease.nonStriker)} (non-striker)</option>` : ''}
                </select>
            </label>
            <label>Coming in
                <select id="ebkNewBatter">
                    ${incomingOptions.length ? incomingOptions.map(p => `<option ${p === event.newBatter ? 'selected' : ''}>${esc(p)}</option>`).join('') : '<option disabled>— no one eligible —</option>'}
                </select>
            </label>
            <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-ball">Save</button>
        `);
    }

    const bowlingRoster = Rules.rosterFor(m, inn.bowlingTeam);
    return panelShell('Edit Ball: Wicket', `
        <label>Batter out
            <select id="ebkBatterOut">
                <option value="${esc(crease.striker)}" ${event.wicket.batterOut === crease.striker ? 'selected' : ''}>${esc(crease.striker)} (striker)</option>
                ${crease.nonStriker ? `<option value="${esc(crease.nonStriker)}" ${event.wicket.batterOut === crease.nonStriker ? 'selected' : ''}>${esc(crease.nonStriker)} (non-striker)</option>` : ''}
            </select>
        </label>
        <label>How out
            <select id="ebkWicketType">
                ${['bowled', 'caught', 'lbw', 'runout', 'stumped', 'hitwicket'].map(t =>
                    `<option value="${t}" ${event.wicket.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase()}${t.slice(1)}</option>`
                ).join('')}
            </select>
        </label>
        <label>Fielder (if relevant)${playerSelect('ebkFielder', bowlingRoster, event.wicket.fielder || '')}</label>
        <label><input type="checkbox" id="ebkOffExtra" ${(event.extraType === 'wide' || event.extraType === 'noball') ? 'checked' : ''}> Happened on a wide/no-ball</label>
        <label>Runs completed before the wicket <input type="number" id="ebkRunsCompleted" value="${event.runsOffBat || 0}" min="0"></label>
        <label>Incoming batter
            <select id="ebkNewBatter">
                ${incomingOptions.length ? incomingOptions.map(p => `<option ${p === event.newBatter ? 'selected' : ''}>${esc(p)}</option>`).join('') : '<option>— none, last batter continues (LMS) —</option>'}
            </select>
        </label>
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-ball">Save</button>
    `);
}

// ── Scorecard screen (fully editable) ─────────────────────────

function renderScorecard() {
    const m = state.match;
    return `
    <div class="scorer-header">
        <button class="scorer-back" data-action="back-to-scoring">&larr; Back</button>
        <h1>#${m.matchNo} ${esc(m.teamA)} vs ${esc(m.teamB)}${m.archived ? ' <span class="scorer-hint" style="display:inline;">(archived)</span>' : ''}${m.ended ? (m.abandoned ? ' <span class="scorer-abandoned-badge">Abandoned</span>' : ' <span class="scorer-finished-badge">Finished</span>') : ''}</h1>
        <button class="scorer-back" data-action="open-panel" data-panel="matchSettings" data-matchno="${m.matchNo}">&#9881; Settings</button>
    </div>
    <div class="scorer-panel">
        ${m.ended ? `
            <p><strong>${esc(Rules.computeMatchResult(m) || 'Result pending')}</strong></p>
            <button class="scorer-btn" data-action="reopen-match" data-matchno="${m.matchNo}">Reopen Match</button>
        ` : `
            <div class="scorer-action-grid">
                <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="mark-match-ended" data-matchno="${m.matchNo}">Mark Match as Finished</button>
                <button class="scorer-btn" data-action="mark-match-abandoned" data-matchno="${m.matchNo}">Mark as Abandoned (No Result)</button>
            </div>
        `}
    </div>
    ${m.innings.map(inn => renderInningsScorecard(m, inn)).join('')}
    <div class="scorer-panel">
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="show-export">Export for the Sheet &rarr;</button>
    </div>
    ${renderPanel()}
    `;
}

function renderInningsScorecard(match, innings) {
    const sc = Rules.computeScorecard(innings);
    const teamName = innings.battingTeam === 'A' ? match.teamA : match.teamB;
    return `
    <div class="scorer-panel">
        <h3>
            <button class="scorer-team-total-btn" data-action="open-panel" data-panel="editTeamTotal" data-innings="${innings.inningsNumber}">
                ${esc(teamName)} — ${sc.totalRuns}/${sc.wickets} (${sc.oversDisplay} ov) ✎
            </button>
            ${innings.complete ? '<span class="scorer-hint">closed</span>' : ''}
        </h3>
        ${renderDivergenceBanner(innings)}
        <button class="scorer-btn" data-action="show-history" data-innings="${innings.inningsNumber}" data-return="scorecard" style="margin-bottom:0.75rem;">View Ball-by-Ball Narrative</button>
        <table class="scorer-sc-table">
            <thead><tr><th>Batter</th><th>How Out</th><th>Bowler</th><th>Fielder</th><th>R</th><th>B</th><th>4s</th><th>6s</th></tr></thead>
            <tbody>
                ${sc.battingOrder.map(b => `
                    <tr class="scorer-editable-row" data-action="open-panel" data-panel="editBattingRow" data-innings="${innings.inningsNumber}" data-name="${esc(b.name)}">
                        <td>${esc(b.name)}</td>
                        <td>${esc(b.howOut)}</td>
                        <td>${esc(b.dismissalBowler)}</td>
                        <td>${esc(b.dismissalFielder)}</td>
                        <td>${b.runs}</td>
                        <td>${b.balls}</td>
                        <td>${b.fours}</td>
                        <td>${b.sixes}</td>
                    </tr>`).join('')}
            </tbody>
        </table>
        <table class="scorer-sc-table">
            <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th></tr></thead>
            <tbody>
                ${sc.bowlingOrder.map(b => `
                    <tr class="scorer-editable-row" data-action="open-panel" data-panel="editBowlingRow" data-innings="${innings.inningsNumber}" data-name="${esc(b.name)}">
                        <td>${esc(b.name)}</td>
                        <td>${b.overs}</td>
                        <td>${b.maidens}</td>
                        <td>${b.runs}</td>
                        <td>${b.wickets}</td>
                    </tr>`).join('')}
            </tbody>
        </table>
        <p class="scorer-hint">Tap any row to edit.</p>
    </div>
    `;
}

function renderEditBattingRowPanel() {
    const m = state.match;
    const { innings: inningsNo, name } = state.panelData;
    const innings = m.innings.find(i => i.inningsNumber === inningsNo);
    const sc = Rules.computeScorecard(innings);
    const line = sc.battingOrder.find(b => b.name === name);
    const battingRoster = Rules.rosterFor(m, innings.battingTeam);
    const bowlingRoster = Rules.rosterFor(m, innings.bowlingTeam);
    return panelShell(`Edit: ${name}`, `
        <div class="scorer-edit-grid">
            <label>Runs <input type="number" id="ebRuns" value="${line.runs}"></label>
            <label>Balls <input type="number" id="ebBalls" value="${line.balls}"></label>
            <label>4s <input type="number" id="ebFours" value="${line.fours}"></label>
            <label>6s <input type="number" id="ebSixes" value="${line.sixes}"></label>
        </div>
        <label>How out
            <select id="ebHowOut">
                ${['not out', 'b', 'ct', 'lbw', 'run out', 'st', 'hw'].map(code =>
                    `<option value="${code}" ${line.dismissalCode === code || (code === 'not out' && !line.dismissalCode) ? 'selected' : ''}>${code}</option>`
                ).join('')}
            </select>
        </label>
        <label>Bowler (credited with the wicket, if any)${playerSelect('ebBowler', bowlingRoster, line.dismissalBowler)}</label>
        <label>Fielder (if caught/run out/stumped)${playerSelect('ebFielder', bowlingRoster, line.dismissalFielder)}</label>
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-batting">Save</button>
    `);
}

function renderEditBowlingRowPanel() {
    const m = state.match;
    const { innings: inningsNo, name } = state.panelData;
    const innings = m.innings.find(i => i.inningsNumber === inningsNo);
    const sc = Rules.computeScorecard(innings);
    const line = sc.bowlingOrder.find(b => b.name === name);
    return panelShell(`Edit: ${name}`, `
        <div class="scorer-edit-grid">
            <label>Overs <input type="text" id="ebwOvers" value="${line.overs}"></label>
            <label>Maidens <input type="number" id="ebwMaidens" value="${line.maidens}"></label>
            <label>Runs <input type="number" id="ebwRuns" value="${line.runs}"></label>
            <label>Wickets <input type="number" id="ebwWickets" value="${line.wickets}"></label>
        </div>
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-bowling">Save</button>
    `);
}

function renderEditTeamTotalPanel() {
    const m = state.match;
    const { innings: inningsNo } = state.panelData;
    const innings = m.innings.find(i => i.inningsNumber === inningsNo);
    const sc = Rules.computeScorecard(innings);
    return panelShell('Edit Team Total', `
        <div class="scorer-edit-grid">
            <label>Runs <input type="number" id="etRuns" value="${sc.totalRuns}"></label>
            <label>Wickets <input type="number" id="etWickets" value="${sc.wickets}"></label>
            <label>Overs <input type="text" id="etOvers" value="${sc.oversDisplay}"></label>
        </div>
        <p class="scorer-hint">This is what actually decides the match result and feeds the Sheet export.</p>
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="confirm-edit-team-total">Save</button>
    `);
}

function renderMatchSettingsPanel() {
    const matchNo = state.panelData.matchno;
    const match = (state.match && state.match.matchNo === matchNo) ? state.match : Storage.loadMatch(matchNo);
    if (!match) return panelShell('Match Settings', `<p class="scorer-hint">Match not found.</p>`);
    return panelShell(`Match Settings — #${match.matchNo}`, `
        <label>Match No <input type="number" id="msMatchNo" value="${match.matchNo}" min="1"></label>
        <button class="scorer-btn scorer-btn-primary" data-action="confirm-rename-match" data-matchno="${match.matchNo}">Save Match No</button>
        <p class="scorer-hint" style="margin-top:1rem;">${match.ended
            ? `This match is marked ${match.abandoned ? 'abandoned' : 'finished'}${Rules.computeMatchResult(match) ? ' — ' + esc(Rules.computeMatchResult(match)) : ''}. Its result shows on the home screen.`
            : 'Marking a match finished (or abandoned) shows its result on the home screen — reopen any time if more edits are needed.'}</p>
        ${match.ended ? `
            <button class="scorer-btn" data-action="reopen-match" data-matchno="${match.matchNo}">Reopen Match</button>
        ` : `
            <div class="scorer-action-grid">
                <button class="scorer-btn scorer-btn-primary" data-action="mark-match-ended" data-matchno="${match.matchNo}">Mark as Finished</button>
                <button class="scorer-btn" data-action="mark-match-abandoned" data-matchno="${match.matchNo}">Mark as Abandoned</button>
            </div>
        `}
        <p class="scorer-hint" style="margin-top:1rem;">${match.archived
            ? 'This match is archived'
            : 'Archiving hides this match from the main list (e.g. a duplicate or cancelled fixture) without deleting its data. It stays fully viewable and editable from the Archived section.'}</p>
        <button class="scorer-btn ${match.archived ? '' : 'scorer-btn-danger'}" data-action="${match.archived ? 'unarchive-match' : 'archive-match'}" data-matchno="${match.matchNo}">
            ${match.archived ? 'Unarchive this match' : 'Archive this match'}
        </button>
    `);
}

// ── Export screen ────────────────────────────────────────────

function renderSheetSyncSection() {
    const url = Submit.getSubmitUrl();
    const usingDefault = Submit.isUsingDefaultUrl();
    const status = state.submitStatus;
    const submitting = status && status.state === 'submitting';
    return `
    <div class="scorer-panel">
        <h3>Submit Directly to the Sheet</h3>
        <p class="scorer-hint">${usingDefault
            ? "Already set up — this device is using the tournament's Apps Script by default, nothing to configure. Only change the URL below if you specifically need to point at a different sheet."
            : 'This device is using a custom Apps Script URL, not the tournament default. Clear the field and Save to go back to the default.'}
            The copy-paste blocks below always work regardless.</p>
        <label>Apps Script URL
            <input type="text" id="appsScriptUrl" value="${esc(url)}" placeholder="https://script.google.com/macros/s/.../exec">
        </label>
        <div class="scorer-action-grid">
            <button class="scorer-btn" data-action="save-apps-script-url">Save URL</button>
            <button class="scorer-btn" data-action="test-apps-script-connection" ${url ? '' : 'disabled'}>Test Connection</button>
        </div>
        ${url ? `
        <button class="scorer-btn scorer-btn-primary scorer-btn-lg" data-action="submit-to-sheet" style="margin-top:0.75rem;" ${submitting ? 'disabled' : ''}>
            ${submitting ? 'Submitting…' : 'Submit to Sheet'}
        </button>` : ''}
        ${status && !submitting ? renderSubmitStatusMessage(status) : ''}
    </div>`;
}

function renderSubmitStatusMessage(status) {
    if (status.state === 'success') {
        let detail = status.message || '';
        if (status.details) {
            detail = status.details.map(d => {
                if (d.updated !== undefined) return `${d.tab}: ${d.updated} updated, ${d.appended} appended`;
                return `${d.tab}: row ${d.created ? 'created' : 'updated'}`;
            }).join(' · ');
        }
        return `<p class="scorer-hint" style="color: var(--primary-blue); font-weight:700; margin-top:0.6rem;">&#10003; ${esc(status.isTest ? 'Connection OK' + (detail ? ' — ' + detail : '') : 'Submitted — ' + detail)}</p>`;
    }
    return `<p class="scorer-hint" style="color: var(--deep-red); font-weight:700; margin-top:0.6rem;">&#9888; ${esc(status.error || 'Something went wrong.')}</p>`;
}

function renderExport() {
    const m = state.match;
    const fixturesRow = Export.buildFixturesBlock(m);
    const battingBlocks = Export.buildBattingBlocks(m);
    const bowlingBlocks = Export.buildBowlingBlocks(m);

    return `
    <div class="scorer-header">
        <button class="scorer-back" data-action="show-scorecard">&larr; Back</button>
        <h1>Export to Sheet</h1>
    </div>
    ${m.archived ? `
    <div class="scorer-panel scorer-warning-banner">
        <p>This match is archived.</p>
    </div>` : ''}
    ${m.innings.some(inn => computeDivergenceMessages(inn).length) ? `
    <div class="scorer-panel scorer-divergence-warning">
        <p><strong>&#9888; Before exporting — check these:</strong></p>
        ${m.innings.flatMap(inn => computeDivergenceMessages(inn).map(msg => `<p>Innings ${inn.inningsNumber}: ${esc(msg)}.</p>`)).join('')}
    </div>` : ''}
    ${renderSheetSyncSection()}
    <div class="scorer-panel">
        <h3>Fixtures_Results row ${m.matchNo}</h3>
        <p class="scorer-hint">Click the <strong>Status</strong> cell of match ${m.matchNo}'s row, then paste.</p>
        <pre class="scorer-copy-block">${esc(fixturesRow)}</pre>
        <button class="scorer-btn" data-action="copy" data-text="${esc(fixturesRow)}">Copy</button>
    </div>
    ${battingBlocks.map(b => `
    <div class="scorer-panel">
        <h3>Batting — Innings ${b.inningsNumber} (${esc(b.battingTeamLabel)})</h3>
        <p class="scorer-hint">Block A: click column A (MatchNo) on the first free Batting row, paste.</p>
        <pre class="scorer-copy-block">${esc(b.leftBlock)}</pre>
        <button class="scorer-btn" data-action="copy" data-text="${esc(b.leftBlock)}">Copy Block A</button>
        <p class="scorer-hint">Block B: click column E (Player) on that same first row, paste.</p>
        <pre class="scorer-copy-block">${esc(b.rightBlock)}</pre>
        <button class="scorer-btn" data-action="copy" data-text="${esc(b.rightBlock)}">Copy Block B</button>
    </div>`).join('')}
    ${bowlingBlocks.map(b => `
    <div class="scorer-panel">
        <h3>Bowling — Innings ${b.inningsNumber} (${esc(b.bowlingTeamLabel)})</h3>
        <p class="scorer-hint">Block A: click column A (MatchNo) on the first free Bowling row, paste.</p>
        <pre class="scorer-copy-block">${esc(b.leftBlock)}</pre>
        <button class="scorer-btn" data-action="copy" data-text="${esc(b.leftBlock)}">Copy Block A</button>
        <p class="scorer-hint">Block B: click column D (Bowler) on that same first row, paste.</p>
        <pre class="scorer-copy-block">${esc(b.rightBlock)}</pre>
        <button class="scorer-btn" data-action="copy" data-text="${esc(b.rightBlock)}">Copy Block B</button>
    </div>`).join('')}
    `;
}

// ── Main render dispatch ─────────────────────────────────────

function render() {
    let html;
    switch (state.screen) {
        case 'home': html = renderHome(); break;
        case 'setup': html = renderSetup(); break;
        case 'inningsSetup': html = renderInningsSetup(); break;
        case 'scoring': html = renderScoring(); break;
        case 'scorecard': html = renderScorecard(); break;
        case 'export': html = renderExport(); break;
        case 'history': html = renderHistory(); break;
        default: html = renderHome();
    }
    app.innerHTML = html;

    if (state.screen === 'setup') {
        document.getElementById('setup-form').addEventListener('submit', e => {
            e.preventDefault();
            handleSetupSubmit(e.target);
        });
    }
    if (state.screen === 'inningsSetup') {
        const form = document.getElementById('innings-setup-form');
        wireInningsSetupSelects(form);
        form.addEventListener('submit', e => {
            e.preventDefault();
            handleInningsSetupSubmit(e.target);
        });
    }
    if (state.screen === 'scoring' && !currentInnings()?.currentBowler && !currentInnings()?.complete) {
        const form = document.getElementById('new-over-form');
        if (form) form.addEventListener('submit', e => {
            e.preventDefault();
            const bowlerName = new FormData(e.target).get('bowler');
            Rules.setBowler(state.match, currentInnings(), bowlerName);
            saveCurrentMatch();
            render();
        });
    }
}

// ── Action handling (event delegation) ───────────────────────

// Toggles the free-text fallback next to a playerSelect() when "Other" is
// picked — a direct DOM tweak, not a state change, so it doesn't disturb any
// other fields already filled in on the same panel.
app.addEventListener('change', e => {
    if (!e.target.matches('[data-player-select]')) return;
    const other = document.getElementById(`${e.target.id}-other`);
    if (other) {
        other.style.display = e.target.value === '__other__' ? '' : 'none';
        if (e.target.value === '__other__') other.focus();
    }
    // Linked dropdown: picking a team auto-fills its usual squad into the
    // paired roster textarea (still freely editable afterward).
    const rosterTargetId = e.target.dataset.rosterTarget;
    if (rosterTargetId && e.target.value && e.target.value !== '__other__') {
        const textarea = document.getElementById(rosterTargetId);
        const players = Roster.rosterForTeamName(e.target.value);
        if (textarea && players.length) textarea.value = players.join('\n');
    }
});

app.addEventListener('click', e => {
    // Backdrop click closes the panel — but ONLY a click on the backdrop
    // itself, never anything inside the sheet (see panelShell's comment).
    if (e.target.classList.contains('scorer-overlay')) {
        setState({ panel: null });
        return;
    }

    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const inn = currentInnings();

    switch (action) {
        case 'new-match':
            setState({ match: null, screen: 'setup' });
            break;
        case 'go-home':
            setState({ screen: 'home', match: null, panel: null });
            break;
        case 'open-match': {
            const match = Storage.loadMatch(Number(target.dataset.matchno));
            const screen = !match.innings.length || match.innings[match.innings.length - 1].complete
                ? (match.innings.length >= 2 ? 'scorecard' : 'inningsSetup')
                : 'scoring';
            setState({ match, screen, panel: null });
            break;
        }
        case 'confirm-rename-match': {
            const oldNo = Number(target.dataset.matchno);
            const newNo = Number(document.getElementById('msMatchNo').value);
            if (!newNo || newNo === oldNo) { setState({ panel: null }); break; }
            if (Storage.loadMatch(newNo)) {
                alert(`Match #${newNo} already exists — pick a different number.`);
                break;
            }
            const match = (state.match && state.match.matchNo === oldNo) ? state.match : Storage.loadMatch(oldNo);
            match.matchNo = newNo;
            Storage.saveMatch(match);
            Storage.deleteMatch(oldNo);
            setState({
                match: (state.match && state.match.matchNo === oldNo) ? match : state.match,
                panel: null,
            });
            break;
        }
        case 'confirm-reset-overrides': {
            const inningsNo = Number(target.dataset.innings);
            const innings = state.match.innings.find(i => i.inningsNumber === inningsNo);
            Rules.clearOverrides(innings);
            saveCurrentMatch();
            setState({ panel: null });
            break;
        }
        case 'archive-match':
        case 'unarchive-match': {
            const no = Number(target.dataset.matchno);
            const match = (state.match && state.match.matchNo === no) ? state.match : Storage.loadMatch(no);
            match.archived = action === 'archive-match';
            Storage.saveMatch(match);
            setState({
                match: (state.match && state.match.matchNo === no) ? match : state.match,
                panel: null,
            });
            break;
        }
        case 'mark-match-ended':
        case 'mark-match-abandoned':
        case 'reopen-match': {
            const no = Number(target.dataset.matchno);
            const match = (state.match && state.match.matchNo === no) ? state.match : Storage.loadMatch(no);
            match.ended = action !== 'reopen-match';
            match.abandoned = action === 'mark-match-abandoned';
            Storage.saveMatch(match);
            setState({
                match: (state.match && state.match.matchNo === no) ? match : state.match,
                panel: null,
            });
            break;
        }
        case 'run':
            Rules.recordBall(state.match, inn, { kind: 'run', runs: Number(target.dataset.runs) });
            saveCurrentMatch();
            render();
            break;
        case 'confirm-other-runs': {
            const runs = Number(document.getElementById('otherRunsInput').value) || 0;
            Rules.recordBall(state.match, inn, { kind: 'run', runs });
            saveCurrentMatch();
            setState({ panel: null });
            break;
        }
        case 'undo-last':
            Rules.undoLastEvent(state.match, inn);
            saveCurrentMatch();
            render();
            break;
        case 'open-panel':
            setState({
                panel: target.dataset.panel,
                panelData: {
                    innings: target.dataset.innings ? Number(target.dataset.innings) : undefined,
                    name: target.dataset.name,
                    undoIndex: target.dataset.undoIndex !== undefined ? Number(target.dataset.undoIndex) : undefined,
                    matchno: target.dataset.matchno !== undefined ? Number(target.dataset.matchno) : undefined,
                },
            });
            break;
        case 'close-panel':
            setState({ panel: null });
            break;
        case 'confirm-extra': {
            const kind = target.dataset.kind;
            const val = Number(document.getElementById('extraRunsInput').value) || 0;
            if (kind === 'wide') Rules.recordBall(state.match, inn, { kind: 'wide', runsRun: val });
            else if (kind === 'noball') Rules.recordBall(state.match, inn, { kind: 'noball', runsOffBat: val });
            else Rules.recordBall(state.match, inn, { kind, runs: val });
            saveCurrentMatch();
            setState({ panel: null });
            break;
        }
        case 'confirm-wicket': {
            const batterOut = document.getElementById('wicketBatterOut').value;
            const dismissalType = document.getElementById('wicketType').value;
            const fielder = playerSelectValue('wicketFielder');
            const offExtraChecked = document.getElementById('wicketOffExtra').checked;
            const runsCompleted = Number(document.getElementById('wicketRunsCompleted').value) || 0;
            const lastStanding = target.dataset.lastStanding === 'true';
            const newBatter = lastStanding ? null : document.getElementById('wicketNewBatter').value;
            Rules.recordBall(state.match, inn, {
                kind: 'wicket', dismissalType, batterOut, fielder: fielder || null,
                newBatter, runsCompleted,
                offExtra: offExtraChecked ? 'wide' : null,
            });
            saveCurrentMatch();
            setState({ panel: null });
            break;
        }
        case 'confirm-retire': {
            const batterOut = document.getElementById('retireBatterOut').value;
            const newBatter = document.getElementById('retireNewBatter').value;
            Rules.recordBall(state.match, inn, { kind: 'retire', batterOut, newBatter });
            saveCurrentMatch();
            setState({ panel: null });
            break;
        }
        case 'confirm-mid-over-bowler': {
            Rules.setBowler(state.match, inn, document.getElementById('midOverBowler').value);
            saveCurrentMatch();
            setState({ panel: null });
            break;
        }
        case 'swap-strike': {
            const tmp = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = tmp;
            saveCurrentMatch();
            setState({ panel: null });
            break;
        }
        case 'end-over':
            Rules.endOver(state.match, inn);
            saveCurrentMatch();
            setState({ panel: null });
            break;
        case 'end-innings-now':
            Rules.endInningsManually(state.match, inn);
            saveCurrentMatch();
            setState({ screen: 'scoring', panel: null });
            break;
        case 'show-scorecard':
            setState({ screen: 'scorecard', panel: null });
            break;
        case 'show-history':
            setState({
                screen: 'history',
                panel: null,
                historyInningsNumber: target.dataset.innings !== undefined ? Number(target.dataset.innings) : inn?.inningsNumber,
                historyReturnScreen: target.dataset.return || 'scoring',
            });
            break;
        case 'back-from-history':
            setState({ screen: state.historyReturnScreen || 'scoring', panel: null });
            break;
        case 'back-to-scoring':
            setState({ screen: 'scoring', panel: null });
            break;
        case 'show-export':
            setState({ screen: 'export', submitStatus: null });
            break;
        case 'save-apps-script-url': {
            const url = document.getElementById('appsScriptUrl').value;
            Submit.setSubmitUrl(url);
            setState({ submitStatus: null });
            break;
        }
        case 'test-apps-script-connection':
            setState({ submitStatus: { state: 'submitting' } });
            Submit.testConnection().then(result => {
                setState({ submitStatus: { state: result.success ? 'success' : 'error', isTest: true, ...result } });
            });
            break;
        case 'submit-to-sheet':
            setState({ submitStatus: { state: 'submitting' } });
            Submit.submitMatch(state.match).then(result => {
                setState({ submitStatus: { state: result.success ? 'success' : 'error', ...result } });
            });
            break;
        case 'start-next-innings':
            // Suggested batting team for the new innings is derived in
            // renderInningsSetup() from match.battedFirst.
            setState({ screen: 'inningsSetup' });
            break;
        case 'reopen-innings':
            Rules.reopenInnings(state.match, inn);
            saveCurrentMatch();
            render();
            break;
        case 'confirm-undo-to': {
            const targetInnings = historyInnings();
            Rules.undoToIndex(state.match, targetInnings, state.panelData.undoIndex);
            saveCurrentMatch();
            setState({ screen: 'history', panel: null });
            break;
        }
        case 'confirm-edit-batting': {
            const { innings: inningsNo, name } = state.panelData;
            const innings = state.match.innings.find(i => i.inningsNumber === inningsNo);
            const runs = document.getElementById('ebRuns').value;
            const balls = document.getElementById('ebBalls').value;
            const fours = document.getElementById('ebFours').value;
            const sixes = document.getElementById('ebSixes').value;
            const howOutCode = document.getElementById('ebHowOut').value;
            const bowler = playerSelectValue('ebBowler');
            const fielder = playerSelectValue('ebFielder');
            const dismissalCode = howOutCode === 'not out' ? '' : howOutCode;

            Rules.setFieldOverride(innings, 'batting', name, 'runs', runs);
            Rules.setFieldOverride(innings, 'batting', name, 'balls', balls);
            Rules.setFieldOverride(innings, 'batting', name, 'fours', fours);
            Rules.setFieldOverride(innings, 'batting', name, 'sixes', sixes);
            Rules.setFieldOverride(innings, 'batting', name, 'dismissalCode', dismissalCode);
            Rules.setFieldOverride(innings, 'batting', name, 'dismissalBowler', bowler);
            Rules.setFieldOverride(innings, 'batting', name, 'dismissalFielder', fielder);
            Rules.setFieldOverride(innings, 'batting', name, 'howOut', describeHowOutForDisplay(howOutCode, bowler, fielder));
            Rules.setFieldOverride(innings, 'batting', name, 'out', howOutCode !== 'not out');
            saveCurrentMatch();
            setState({ screen: 'scorecard', panel: null });
            break;
        }
        case 'confirm-edit-bowling': {
            const { innings: inningsNo, name } = state.panelData;
            const innings = state.match.innings.find(i => i.inningsNumber === inningsNo);
            Rules.setFieldOverride(innings, 'bowling', name, 'maidens', document.getElementById('ebwMaidens').value);
            Rules.setFieldOverride(innings, 'bowling', name, 'runs', document.getElementById('ebwRuns').value);
            Rules.setFieldOverride(innings, 'bowling', name, 'wickets', document.getElementById('ebwWickets').value);
            Rules.setFieldOverride(innings, 'bowling', name, 'overs', document.getElementById('ebwOvers').value);
            saveCurrentMatch();
            setState({ screen: 'scorecard', panel: null });
            break;
        }
        case 'confirm-edit-team-total': {
            const { innings: inningsNo } = state.panelData;
            const innings = state.match.innings.find(i => i.inningsNumber === inningsNo);
            Rules.setFieldOverride(innings, 'team', '_', 'runs', document.getElementById('etRuns').value);
            Rules.setFieldOverride(innings, 'team', '_', 'wickets', document.getElementById('etWickets').value);
            Rules.setFieldOverride(innings, 'team', '_', 'overs', document.getElementById('etOvers').value);
            saveCurrentMatch();
            setState({ screen: 'scorecard', panel: null });
            break;
        }
        case 'confirm-edit-ball': {
            const targetInnings = historyInnings();
            const idx = state.panelData.undoIndex;
            const event = targetInnings.balls[idx];
            if (!NO_EDIT_FORM_KINDS.includes(event.kind)) {
                const patch = buildBallEditPatch(state.match, targetInnings, idx, event);
                Rules.editEventAtIndex(state.match, targetInnings, idx, patch);
                saveCurrentMatch();
            }
            setState({ screen: 'history', panel: null });
            break;
        }
        case 'copy': {
            const text = target.dataset.text;
            navigator.clipboard?.writeText(text).then(() => {
                const original = target.textContent;
                target.textContent = 'Copied!';
                setTimeout(() => { target.textContent = original; }, 1200);
            }).catch(() => alert('Copy failed — select the text above manually.'));
            break;
        }
    }
});

/** Standing (not dismissible, recomputed on every render) divergence check
 * for one innings — three figures that should normally agree:
 *   ball-by-ball  --(row overrides cascade up)-->  scorecard rows  --(team
 *   override wins, doesn't cascade back down)-->  displayed total.
 * Returns human-readable messages for whichever links in that chain
 * disagree. Never blocks anything — overrides are allowed to disagree with
 * the ball-by-ball on purpose — this only makes sure it's never silently missed. */
function computeDivergenceMessages(innings) {
    const raw = Rules.computeScorecardWithoutOverrides(innings);
    const beforeTeamOverride = Rules.computeScorecardBeforeTeamOverride(innings);
    const displayed = Rules.computeScorecard(innings);
    const msgs = [];

    if (beforeTeamOverride.totalRuns !== raw.totalRuns || beforeTeamOverride.wickets !== raw.wickets) {
        msgs.push(`Scorecard disagrees with the ball-by-ball record (${beforeTeamOverride.totalRuns}/${beforeTeamOverride.wickets} on the scorecard vs ${raw.totalRuns}/${raw.wickets} from the balls recorded)`);
    }
    if (displayed.totalRuns !== beforeTeamOverride.totalRuns || displayed.wickets !== beforeTeamOverride.wickets) {
        msgs.push(`Total score disagrees with the scorecard (${displayed.totalRuns}/${displayed.wickets} shown vs ${beforeTeamOverride.totalRuns}/${beforeTeamOverride.wickets} on the batting card)`);
    }
    const teamOv = innings.overrides?.[Rules.teamOverrideKey()];
    if (teamOv?.overs !== undefined && teamOv.overs !== raw.oversDisplay) {
        msgs.push(`Total overs disagrees with the ball-by-ball record (${displayed.oversDisplay} shown vs ${raw.oversDisplay} bowled)`);
    }
    return msgs;
}

function renderDivergenceBanner(innings) {
    const msgs = computeDivergenceMessages(innings);
    if (!msgs.length) return '';
    return `<div class="scorer-divergence-warning">
        ${msgs.map(m => `<p>&#9888; ${esc(m)}.</p>`).join('')}
        <button class="scorer-btn scorer-btn-danger" data-action="open-panel" data-panel="confirmResetOverrides" data-innings="${innings.inningsNumber}">Reset to Ball-by-Ball</button>
    </div>`;
}

function renderConfirmResetOverridesPanel() {
    const { innings: inningsNo } = state.panelData;
    const innings = state.match.innings.find(i => i.inningsNumber === inningsNo);
    const count = innings.overrides ? Object.keys(innings.overrides).length : 0;
    return panelShell('Reset to Ball-by-Ball?', `
        <p>This clears ${count} hand-entered override${count === 1 ? '' : 's'} on this innings — every batting/bowling row and the team total will go back to exactly what the ball-by-ball record says.</p>
        <p class="scorer-hint">This only removes the manual edits made to the scorecards etc.</p>
        <button class="scorer-btn scorer-btn-danger scorer-btn-lg" data-action="confirm-reset-overrides" data-innings="${inningsNo}">Yes, reset ${count} override${count === 1 ? '' : 's'}</button>
    `);
}

/** Builds the field patch for Rules.editEventAtIndex() from whatever the
 * "Edit this ball" panel's form fields currently hold — mirrors buildEvent()
 * in scorer-rules.js, just patching an existing event instead of building a
 * fresh one. */
function buildBallEditPatch(match, innings, idx, event) {
    switch (event.kind) {
        case 'run':
            return { runsOffBat: Number(document.getElementById('ebkRuns').value) || 0 };
        case 'wide': {
            const rule = Rules.extrasRuleForOver(match, event.overNumber);
            const runsRun = Number(document.getElementById('ebkRunsRun').value) || 0;
            return { extraRuns: rule.runs + runsRun };
        }
        case 'noball':
            return { runsOffBat: Number(document.getElementById('ebkRuns').value) || 0 };
        case 'bye':
        case 'legbye':
            return { extraRuns: Number(document.getElementById('ebkRuns').value) || 0 };
        case 'setBowler':
            return { bowler: document.getElementById('ebkBowler').value };
        case 'wicket': {
            const dismissalType = document.getElementById('ebkWicketType').value;
            const fielder = playerSelectValue('ebkFielder');
            const runsCompleted = Number(document.getElementById('ebkRunsCompleted').value) || 0;
            const offExtraChecked = document.getElementById('ebkOffExtra').checked;
            const batterOut = document.getElementById('ebkBatterOut').value;
            const newBatter = document.getElementById('ebkNewBatter').value;
            const rule = Rules.extrasRuleForOver(match, event.overNumber);
            const patch = {
                wicket: { type: dismissalType, batterOut, fielder: fielder || null, creditedToBowler: dismissalType !== 'runout' },
                newBatter: newBatter || null,
            };
            if (offExtraChecked) {
                patch.extraType = 'wide';
                patch.extraRuns = rule.runs;
                patch.isLegal = !rule.rebowl;
                patch.runsOffBat = 0;
            } else {
                patch.extraType = null;
                patch.extraRuns = 0;
                patch.isLegal = true;
                patch.runsOffBat = runsCompleted;
            }
            return patch;
        }
        case 'retire': {
            const batterOut = document.getElementById('ebkBatterOut').value;
            const newBatter = document.getElementById('ebkNewBatter').value;
            return {
                wicket: { type: 'retired', batterOut, fielder: null, creditedToBowler: false },
                newBatter: newBatter || null,
            };
        }
        default:
            return {};
    }
}

function describeHowOutForDisplay(code, bowler, fielder) {
    if (!code || code === 'not out') return 'not out';
    if (code === 'b') return bowler ? `b ${bowler}` : 'bowled';
    if (code === 'ct') return (fielder && bowler) ? (fielder === bowler ? `c & b ${bowler}` : `c ${fielder} b ${bowler}`) : 'caught';
    if (code === 'lbw') return bowler ? `lbw b ${bowler}` : 'lbw';
    if (code === 'run out') return fielder ? `run out (${fielder})` : 'run out';
    if (code === 'st') return (fielder && bowler) ? `st ${fielder} b ${bowler}` : 'stumped';
    if (code === 'hw') return bowler ? `hit wicket b ${bowler}` : 'hit wicket';
    return code;
}

// ── Init ─────────────────────────────────────────────────────

render();
