/**
 * Imperial Super Sixes - Page Renderer
 * Loads data/super_sixes.json (built by scraper/super_sixes_manual.py from the
 * scorers' spreadsheet) and renders the live strip, groups, bracket, full
 * schedule and stat leaderboards. Polls for updates while the tab is visible.
 */

(function () {
    const DATA_URL = '../data/super_sixes.json';
    const POLL_MS = 60000;

    // ── Helpers ──────────────────────────────────────────────

    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function tbcClass(name) {
        return name === 'TBC' ? ' tbc' : '';
    }

    function scoreLine(score) {
        if (!score || score.runs === null || score.runs === undefined) return null;
        const w = (score.wickets !== null && score.wickets !== undefined) ? score.wickets : '-';
        const ov = score.overs ? ` (${score.overs} ov)` : '';
        return `${score.runs}/${w}${ov}`;
    }

    // ── Scorecard rendering (data already embedded per match) ─

    function renderInningsPane(inn) {
        const hasBat = inn.batting && inn.batting.length > 0;
        const hasBowl = inn.bowling && inn.bowling.length > 0;
        let html = '';

        if (hasBat) {
            html += `<table class="sc-table">
                <thead><tr><th>Batter</th><th>Dismissal</th><th class="sc-num">R</th><th class="sc-num">B</th><th class="sc-num">4s</th><th class="sc-num">6s</th></tr></thead>
                <tbody>`;
            inn.batting.forEach(b => {
                html += `<tr>
                    <td><strong>${esc(b.name)}</strong></td>
                    <td class="sc-dismissal">${esc(b.howOutText)}</td>
                    <td class="sc-num"><strong>${b.runs}</strong></td>
                    <td class="sc-num">${b.balls ?? '-'}</td>
                    <td class="sc-num">${b.fours}</td>
                    <td class="sc-num">${b.sixes}</td>
                </tr>`;
            });
            html += '</tbody></table>';
        }

        if (hasBowl) {
            html += `<table class="sc-table sc-bowl-table">
                <thead><tr><th>Bowler</th><th class="sc-num">O</th><th class="sc-num">M</th><th class="sc-num">R</th><th class="sc-num">W</th></tr></thead>
                <tbody>`;
            inn.bowling.forEach(b => {
                html += `<tr>
                    <td><strong>${esc(b.name)}</strong></td>
                    <td class="sc-num">${esc(b.overs)}</td>
                    <td class="sc-num">${b.maidens}</td>
                    <td class="sc-num">${b.runs}</td>
                    <td class="sc-num"><strong>${b.wickets}</strong></td>
                </tr>`;
            });
            html += '</tbody></table>';
        }

        if (!hasBat && !hasBowl) html = '<p class="sc-no-data">No scorecard entries yet.</p>';
        return html;
    }

    function renderScorecardHTML(scorecard) {
        if (!scorecard || !scorecard.innings || !scorecard.innings.length) {
            return '<p class="sc-no-data">Scorecard not available yet.</p>';
        }
        let html = '<div class="scorecard"><div class="sc-innings-tabs">';
        scorecard.innings.forEach((inn, i) => {
            html += `<button class="sc-tab-btn${i === 0 ? ' active' : ''}" data-sc-tab="${i}">${esc(inn.teamName)} Innings</button>`;
        });
        html += '</div>';
        scorecard.innings.forEach((inn, i) => {
            const summary = (inn.runs !== null && inn.runs !== undefined)
                ? `${inn.runs}/${inn.wickets ?? '-'}${inn.overs ? ` (${inn.overs} ov)` : ''}`
                : 'Yet to bat';
            html += `<div class="sc-innings-pane${i === 0 ? ' active' : ''}" data-sc-pane="${i}">
                <p class="scorecard-innings-title">${esc(inn.teamName)} &mdash; ${summary}</p>
                ${renderInningsPane(inn)}
            </div>`;
        });
        html += '</div>';
        return html;
    }

    function setupScorecardToggles() {
        document.addEventListener('click', function (e) {
            const btn = e.target.closest('.scorecard-toggle-btn');
            if (btn) {
                const panel = document.getElementById(btn.dataset.panelId);
                if (!panel) return;
                const show = panel.style.display === 'none';
                panel.style.display = show ? 'block' : 'none';
                btn.textContent = show ? 'Scorecard ▲' : 'Scorecard ▼';
                return;
            }
            const tabBtn = e.target.closest('.sc-tab-btn');
            if (tabBtn) {
                const scorecard = tabBtn.closest('.scorecard');
                if (!scorecard) return;
                const idx = tabBtn.dataset.scTab;
                scorecard.querySelectorAll('.sc-tab-btn').forEach(b => b.classList.remove('active'));
                scorecard.querySelectorAll('.sc-innings-pane').forEach(p => p.classList.remove('active'));
                tabBtn.classList.add('active');
                const pane = scorecard.querySelector(`.sc-innings-pane[data-sc-pane="${idx}"]`);
                if (pane) pane.classList.add('active');
            }
        });
    }

    // ── Live banner ──────────────────────────────────────────

    function renderLive(data) {
        const el = document.getElementById('ss-live-banner');
        const live = data.live || [];
        if (!live.length) { el.innerHTML = ''; return; }

        el.innerHTML = live.map(m => `
            <div class="ss-live-card">
                <span class="ss-live-pill"><span class="ss-live-dot"></span> Live Now</span>
                <div class="ss-live-teams">
                    <span>${esc(m.round)}: ${esc(m.teamA)} vs ${esc(m.teamB)}</span>
                    <span class="ss-live-score">${scoreLine(m.teamAScore) || 'Yet to bat'}${m.teamBScore ? ' &middot; ' + scoreLine(m.teamBScore) : ''}</span>
                </div>
                <div class="ss-live-meta">${m.time ? 'Started ' + esc(m.time) : ''}</div>
            </div>
        `).join('');
    }

    // ── Latest results + next fixtures strip ────────────────

    function stripCard(match, opts) {
        const isResult = opts.cls === 'result';
        const aScore = scoreLine(match.teamAScore);
        const bScore = scoreLine(match.teamBScore);
        const aWin = match.winner && match.winner === match.teamA;
        const bWin = match.winner && match.winner === match.teamB;

        return `
            <div class="ss-strip-card ${opts.cls}${opts.highlight ? ' next' : ''}">
                <span class="ss-strip-label">${esc(opts.label)}</span>
                <span class="ss-strip-round">${esc(match.round)}</span>
                <div class="ss-strip-teams">
                    <div class="ss-strip-team-row${aWin ? ' winner' : ''}">
                        <span class="ss-strip-team-name${tbcClass(match.teamA)}">${esc(match.teamA)}</span>
                        ${aScore ? `<span class="ss-strip-score">${aScore}</span>` : ''}
                    </div>
                    <div class="ss-strip-team-row${bWin ? ' winner' : ''}">
                        <span class="ss-strip-team-name${tbcClass(match.teamB)}">${esc(match.teamB)}</span>
                        ${bScore ? `<span class="ss-strip-score">${bScore}</span>` : ''}
                    </div>
                </div>
                ${isResult && match.resultText ? `<span class="ss-strip-result">${esc(match.resultText)}</span>` : ''}
                ${!isResult && match.time ? `<span class="ss-strip-meta">Starts ${esc(match.time)}</span>` : ''}
            </div>`;
    }

    function renderStrip(data) {
        const el = document.getElementById('ss-strip');
        const recentResults = (data.results || []).slice(0, 2);
        const nextFixtures = (data.fixtures || []).slice(0, 2);

        if (!recentResults.length && !nextFixtures.length) {
            el.innerHTML = '<p class="ss-empty">No matches played or scheduled yet &mdash; check back once the draw is confirmed.</p>';
            return;
        }

        let html = '';
        recentResults.forEach(m => { html += stripCard(m, { label: 'Recent Result', cls: 'result' }); });
        nextFixtures.forEach((m, i) => { html += stripCard(m, { label: i === 0 ? 'Next Up' : 'Then', cls: 'fixture', highlight: i === 0 }); });
        el.innerHTML = html;
    }

    // ── Group tables ─────────────────────────────────────────

    function renderGroups(data) {
        const el = document.getElementById('ss-groups');
        const groupKeys = Object.keys(data.groups || {}).sort();
        if (!groupKeys.length) {
            el.innerHTML = '<p class="ss-empty">Groups not set up yet.</p>';
            return;
        }

        el.innerHTML = groupKeys.map(key => {
            const rows = data.groups[key];
            return `
            <div class="ss-group-card">
                <h3>Group ${esc(key)}</h3>
                <table class="ss-group-table">
                    <thead><tr><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>NRR</th><th>Pts</th></tr></thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                <td>${esc(r.team)}</td>
                                <td>${r.played}</td>
                                <td>${r.won}</td>
                                <td>${r.lost}</td>
                                <td>${r.tied}</td>
                                <td>${r.nrr > 0 ? '+' : ''}${r.nrr.toFixed(2)}</td>
                                <td class="ss-pts">${r.points}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                <p class="ss-group-note">Top 2 advance to the semi-finals &middot; 3rd goes to the Wooden Spoon</p>
            </div>`;
        }).join('');
    }

    // ── Knockout bracket ─────────────────────────────────────

    function bracketMatchCard(match, roundLabel) {
        if (!match) {
            return `<div class="ss-bracket-match">
                <div class="ss-bracket-round">${esc(roundLabel)}</div>
                <p class="ss-empty" style="padding:0.5rem 0;">To be confirmed</p>
            </div>`;
        }
        const decided = !!match.winner;
        const aWin = match.winner === match.teamA;
        const bWin = match.winner === match.teamB;
        return `
        <div class="ss-bracket-match${decided ? ' decided' : ''}">
            <div class="ss-bracket-round">${esc(match.round || roundLabel)}</div>
            <div class="ss-bracket-team${aWin ? ' winner' : ''}">
                <span class="ss-bracket-team-name${tbcClass(match.teamA)}">${esc(match.teamA)}</span>
                ${scoreLine(match.teamAScore) ? `<span class="ss-bracket-score">${scoreLine(match.teamAScore)}</span>` : ''}
            </div>
            <div class="ss-bracket-team${bWin ? ' winner' : ''}">
                <span class="ss-bracket-team-name${tbcClass(match.teamB)}">${esc(match.teamB)}</span>
                ${scoreLine(match.teamBScore) ? `<span class="ss-bracket-score">${scoreLine(match.teamBScore)}</span>` : ''}
            </div>
            <div class="ss-bracket-time">${esc(match.time || '')}</div>
            ${match.resultText ? `<div class="ss-bracket-time" style="color:var(--primary-blue);font-weight:600;">${esc(match.resultText)}</div>` : ''}
        </div>`;
    }

    function renderBracket(data) {
        const b = data.bracket || {};
        document.getElementById('ss-bracket').innerHTML = `
            <div class="ss-bracket-col">
                ${bracketMatchCard(b.semiFinal1, 'Semi Final 1')}
                ${bracketMatchCard(b.semiFinal2, 'Semi Final 2')}
            </div>
            <div class="ss-bracket-col">
                ${bracketMatchCard(b.final, 'Final')}
                ${bracketMatchCard(b.thirdPlace, '3rd Place Playoff')}
            </div>`;

        document.getElementById('ss-wooden-spoon').innerHTML =
            `<div class="ss-wooden-spoon-wrap">${bracketMatchCard(b.woodenSpoon, 'Wooden Spoon 🥄')}</div>`;
    }

    // ── Full schedule ────────────────────────────────────────

    function matchCard(match) {
        const status = (match.status || '').toLowerCase();
        const aScore = scoreLine(match.teamAScore);
        const bScore = scoreLine(match.teamBScore);
        const aWin = match.winner === match.teamA;
        const bWin = match.winner === match.teamB;
        const panelId = `ss-sc-${match.matchNo}`;
        const hasCard = !!match.scorecard;

        return `
        <div class="ss-match-card status-${status}">
            <div class="ss-match-header">
                <span class="ss-match-round">${esc(match.round)}</span>
                <span class="ss-status-badge ${status}">${esc(match.status)}</span>
            </div>
            <div class="ss-match-teams">
                <div class="ss-match-team${aWin ? ' winner' : ''}">
                    <span class="ss-match-team-name${tbcClass(match.teamA)}">${esc(match.teamA)}</span>
                    ${aScore ? `<span class="ss-match-team-score">${aScore}</span>` : ''}
                </div>
                <span class="ss-match-vs">vs</span>
                <div class="ss-match-team${bWin ? ' winner' : ''}">
                    <span class="ss-match-team-name${tbcClass(match.teamB)}">${esc(match.teamB)}</span>
                    ${bScore ? `<span class="ss-match-team-score">${bScore}</span>` : ''}
                </div>
            </div>
            <div class="ss-match-meta" style="margin-top:0.5rem;">${esc(match.time || '')}</div>
            ${match.resultText ? `<div class="ss-match-result">${esc(match.resultText)}</div>` : ''}
            ${match.notes ? `<div class="ss-match-meta">${esc(match.notes)}</div>` : ''}
            ${hasCard ? `
                <div class="result-actions" style="margin-top:0.75rem;">
                    <button class="scorecard-toggle-btn" data-panel-id="${panelId}">Scorecard ▼</button>
                </div>
                <div class="scorecard-panel" id="${panelId}" style="display:none;">${renderScorecardHTML(match.scorecard)}</div>
            ` : ''}
        </div>`;
    }

    function renderSchedule(data) {
        const el = document.getElementById('ss-schedule');
        const matches = data.matches || [];
        if (!matches.length) {
            el.innerHTML = '<p class="ss-empty">No fixtures published yet.</p>';
            return;
        }
        el.innerHTML = matches.map(matchCard).join('');
    }

    // ── Stats ────────────────────────────────────────────────

    function statTable(title, rows, cols) {
        if (!rows || !rows.length) {
            return `<div class="ss-stat-card"><h3>${esc(title)}</h3><p class="ss-empty">No data yet.</p></div>`;
        }
        return `
        <div class="ss-stat-card">
            <h3>${esc(title)}</h3>
            <table class="ss-stat-table">
                <thead><tr><th>Player</th>${cols.map(c => `<th class="num">${esc(c.label)}</th>`).join('')}</tr></thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td><span class="ss-stat-name">${esc(r.player)}</span><span class="ss-stat-team">${esc(r.team)}</span></td>
                            ${cols.map(c => `<td class="num">${c.value(r)}</td>`).join('')}
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function renderStats(data) {
        const el = document.getElementById('ss-stats');
        const bat = (data.stats && data.stats.batting) || {};
        const bowl = (data.stats && data.stats.bowling) || {};

        el.innerHTML = [
            statTable('Top Run Scorers', bat.topRunScorers, [
                { label: 'Runs', value: r => r.runs },
                { label: 'SR', value: r => r.strikeRate ?? '-' },
            ]),
            statTable('Best Batting Average', bat.bestAverage, [
                { label: 'Avg', value: r => r.average },
                { label: 'Runs', value: r => r.runs },
            ]),
            statTable('Best Strike Rate', bat.bestStrikeRate, [
                { label: 'SR', value: r => r.strikeRate },
                { label: 'Runs', value: r => r.runs },
            ]),
            statTable('Most Wickets', bowl.mostWickets, [
                { label: 'Wkts', value: r => r.wickets },
                { label: 'Best', value: r => r.bestFigures },
            ]),
            statTable('Best Bowling Average', bowl.bestAverage, [
                { label: 'Avg', value: r => r.average },
                { label: 'Wkts', value: r => r.wickets },
            ]),
            statTable('Best Economy', bowl.bestEconomy, [
                { label: 'Econ', value: r => r.economy },
                { label: 'Overs', value: r => r.overs },
            ]),
        ].join('');
    }

    // ── Last updated ─────────────────────────────────────────

    function renderLastUpdated(data) {
        const el = document.getElementById('ss-last-updated');
        if (!data.lastUpdated) { el.textContent = ''; return; }
        const d = new Date(data.lastUpdated);
        const mins = Math.round((Date.now() - d.getTime()) / 60000);
        const ago = mins < 1 ? 'just now' : mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
        el.textContent = `Live data updated ${ago} (${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`;
        el.classList.toggle('stale', mins >= 20);
    }

    // ── Init / polling ───────────────────────────────────────

    async function loadAndRender() {
        try {
            const res = await fetch(DATA_URL + '?t=' + Date.now());
            if (!res.ok) return;
            const data = await res.json();
            renderLastUpdated(data);
            renderLive(data);
            renderStrip(data);
            renderGroups(data);
            renderBracket(data);
            renderSchedule(data);
            renderStats(data);
        } catch (e) {
            console.error('Failed to load Super Sixes data', e);
        }
    }

    function init() {
        setupScorecardToggles();
        loadAndRender();
        setInterval(() => {
            if (document.visibilityState === 'visible') loadAndRender();
        }, POLL_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') loadAndRender();
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
