/**
 * Imperial Super Sixes - Page Renderer
 * Loads data/super_sixes.json (built by scraper/super_sixes_manual.py from the
 * scorers' spreadsheet) and renders the live strip, groups, bracket, full
 * schedule and stat leaderboards. Polls for updates while the tab is visible.
 */

(function () {
    const DATA_URL = '../data/super_sixes.json';
    const POLL_MS = 60000;

    // Player of the Tournament is a human decision, not something derivable
    // from match data like the other stat badges below — set manually.
    const PLAYER_OF_THE_TOURNAMENT = { player: 'H. Shah', team: 'Fable 6' };

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
            const statToggleBtn = e.target.closest('.ss-stat-toggle-btn');
            if (statToggleBtn) {
                const card = statToggleBtn.closest('.ss-stat-card');
                const extra = card && card.querySelector('.ss-stat-extra');
                if (!extra) return;
                const show = extra.style.display === 'none';
                extra.style.display = show ? '' : 'none';
                statToggleBtn.textContent = show ? 'Show top 5' : `Show all ${statToggleBtn.dataset.total} players`;
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
        const groupKeys = Object.keys(data.groups || {}).filter(key => key.trim()).sort();
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

    const CAP_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M4 13c0-4.4 3.6-8 8-8s8 3.6 8 8v1H4v-1z"/><path d="M2 14h13.5c2 0 4.5 0 4.5 1.4 0 .9-1 1.6-2.3 1.6H4.5C3 17 2 16 2 14.7V14z"/></svg>';
    const STAR_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z"/></svg>';

    function badgeIcon(cls, label, svg) {
        return `<span class="ss-badge ss-badge-${cls}" title="${esc(label)}">${svg}</span>`;
    }

    function playerBadges(r, badgeCtx) {
        let html = '';
        const isSamePlayer = (a, b) => a && b && a.player === b.player && a.team === b.team;
        if (isSamePlayer(r, badgeCtx.topScorer)) html += badgeIcon('cap-orange', 'Top run-scorer', CAP_SVG);
        if (isSamePlayer(r, badgeCtx.topWicketTaker)) html += badgeIcon('cap-purple', 'Top wicket-taker', CAP_SVG);
        if (isSamePlayer(r, PLAYER_OF_THE_TOURNAMENT)) html += badgeIcon('star', 'Player of the tournament', STAR_SVG);
        return html;
    }

    function statRow(r, cols, badgeCtx) {
        return `
        <tr>
            <td><span class="ss-stat-name">${esc(r.player)}${playerBadges(r, badgeCtx)}</span><span class="ss-stat-team">${esc(r.team)}</span></td>
            ${cols.map(c => `<td class="num">${c.value(r)}</td>`).join('')}
        </tr>`;
    }

    function statTable(title, rows, cols, badgeCtx) {
        if (!rows || !rows.length) {
            return `<div class="ss-stat-card"><h3>${esc(title)}</h3><p class="ss-empty">No data yet.</p></div>`;
        }
        const visible = rows.slice(0, 5);
        const extra = rows.slice(5);
        return `
        <div class="ss-stat-card">
            <h3>${esc(title)}</h3>
            <table class="ss-stat-table">
                <thead><tr><th>Player</th>${cols.map(c => `<th class="num">${esc(c.label)}</th>`).join('')}</tr></thead>
                <tbody>${visible.map(r => statRow(r, cols, badgeCtx)).join('')}</tbody>
                ${extra.length ? `<tbody class="ss-stat-extra" style="display:none">${extra.map(r => statRow(r, cols, badgeCtx)).join('')}</tbody>` : ''}
            </table>
            ${extra.length ? `<button class="ss-stat-toggle-btn" data-action="toggle-stat-rows" data-total="${rows.length}">Show all ${rows.length} players</button>` : ''}
        </div>`;
    }

    function renderStats(data) {
        const el = document.getElementById('ss-stats');
        const bat = (data.stats && data.stats.batting) || {};
        const bowl = (data.stats && data.stats.bowling) || {};
        const badgeCtx = {
            topScorer: (bat.topRunScorers && bat.topRunScorers[0]) || null,
            topWicketTaker: (bowl.mostWickets && bowl.mostWickets[0]) || null,
        };

        el.innerHTML = [
            statTable('Top Run Scorers', bat.topRunScorers, [
                { label: 'Runs', value: r => r.runs },
                { label: 'SR', value: r => r.strikeRate ?? '-' },
            ], badgeCtx),
            statTable('Best Batting Average', bat.bestAverage, [
                { label: 'Avg', value: r => r.average },
                { label: 'Runs', value: r => r.runs },
            ], badgeCtx),
            statTable('Best Strike Rate', bat.bestStrikeRate, [
                { label: 'SR', value: r => r.strikeRate },
                { label: 'Runs', value: r => r.runs },
            ], badgeCtx),
            statTable('Most Sixes', bat.mostSixes, [
                { label: '6s', value: r => r.sixes },
                { label: 'Runs', value: r => r.runs },
            ], badgeCtx),
            statTable('Most Fours', bat.mostFours, [
                { label: '4s', value: r => r.fours },
                { label: 'Runs', value: r => r.runs },
            ], badgeCtx),
            statTable('Most Wickets', bowl.mostWickets, [
                { label: 'Wkts', value: r => r.wickets },
                { label: 'Best', value: r => r.bestFigures },
            ], badgeCtx),
            statTable('Best Bowling Average', bowl.bestAverage, [
                { label: 'Avg', value: r => r.average },
                { label: 'Wkts', value: r => r.wickets },
            ], badgeCtx),
            statTable('Best Economy', bowl.bestEconomy, [
                { label: 'Econ', value: r => r.economy },
                { label: 'Overs', value: r => r.overs },
            ], badgeCtx),
        ].join('');
    }

    // ── Final standings podium ───────────────────────────────
    // 3rd place isn't a separate playoff — it's whichever team lost the
    // semi-final that the eventual champion played in, derived from the
    // bracket data rather than hardcoded so it stays correct on its own.

    let confettiFired = false;

    function computeFinalStandings(data) {
        const b = data.bracket || {};
        const final = b.final;
        if (!final || final.status !== 'Complete' || !final.winner) return null;

        const champion = final.winner;
        const runnerUp = final.teamA === champion ? final.teamB : final.teamA;

        const championSemi = [b.semiFinal1, b.semiFinal2]
            .filter(Boolean)
            .find(s => s.teamA === champion || s.teamB === champion);
        if (!championSemi) return null;
        const thirdPlace = championSemi.teamA === champion ? championSemi.teamB : championSemi.teamA;

        // The wooden spoon is "won" by finishing last — i.e. losing the
        // wooden spoon decider, not winning it.
        let woodenSpoon = null;
        const ws = b.woodenSpoon;
        if (ws && ws.status === 'Complete' && ws.winner) {
            woodenSpoon = ws.teamA === ws.winner ? ws.teamB : ws.teamA;
        }

        return { champion, runnerUp, thirdPlace, woodenSpoon };
    }

    function podiumPlace(rankClass, rankNumber, rankLabel, team) {
        return `
        <div class="ss-podium-place ${rankClass}">
            <div class="ss-podium-card">
                <div class="ss-podium-rank-label">${esc(rankLabel)}</div>
                <div class="ss-podium-team">${esc(team)}</div>
            </div>
            <div class="ss-podium-block">${rankNumber}</div>
        </div>`;
    }

    function renderPodium(data) {
        const wrap = document.getElementById('ss-podium');
        const s = computeFinalStandings(data);
        if (!s) { wrap.innerHTML = ''; return; }

        wrap.innerHTML = `
            <div class="ss-podium-wrap">
                <div class="ss-podium-heading">
                    <h2>Final Standings</h2>
                    <p>Imperial Super Sixes 2026</p>
                </div>
                <div class="ss-podium">
                    ${podiumPlace('gold', 1, 'Winner', s.champion)}
                    ${podiumPlace('silver', 2, 'Runner-up', s.runnerUp)}
                    ${podiumPlace('bronze', 3, 'Third Place', s.thirdPlace)}
                </div>
                ${s.woodenSpoon ? `<p class="ss-wooden-spoon-line">Wooden Spoon: ${esc(s.woodenSpoon)}</p>` : ''}
            </div>`;

        if (!confettiFired) {
            confettiFired = true;
            fireConfetti();
        }
    }

    function fireConfetti() {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const canvas = document.getElementById('ss-confetti-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const colors = ['#FFD700', '#DAA520', '#C8102E', '#003F87', '#FFFFFF', '#9AA0A6', '#B5651D'];

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        canvas.style.display = 'block';

        const pieces = Array.from({ length: 160 }, () => ({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * canvas.height * 0.6,
            w: 6 + Math.random() * 5,
            h: 8 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            rot: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 10,
            vy: 2 + Math.random() * 2.5,
            vx: (Math.random() - 0.5) * 2,
            drift: Math.random() * Math.PI * 2,
        }));

        const duration = 4000;
        const start = performance.now();

        function frame(now) {
            const elapsed = now - start;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            pieces.forEach(p => {
                p.y += p.vy;
                p.x += p.vx + Math.sin(elapsed / 300 + p.drift) * 0.6;
                p.rot += p.rotSpeed;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rot * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            });
            if (elapsed < duration) {
                requestAnimationFrame(frame);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                canvas.style.display = 'none';
            }
        }
        requestAnimationFrame(frame);
        window.addEventListener('resize', resize, { once: true });
    }

    // ── Last updated ─────────────────────────────────────────

    function renderLastUpdated(data) {
        const el = document.getElementById('ss-last-updated');
        if (!data.lastUpdated) { el.textContent = ''; return; }
        const d = new Date(data.lastUpdated);
        const mins = Math.round((Date.now() - d.getTime()) / 60000);
        const ago = mins < 1 ? 'just now' : mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
        el.textContent = `Live data updated ${ago} (${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })})`;
        el.classList.toggle('stale', mins >= 20);
    }

    // ── Init / polling ───────────────────────────────────────

    async function loadAndRender() {
        try {
            const res = await fetch(DATA_URL + '?t=' + Date.now());
            if (!res.ok) return;
            const data = await res.json();
            renderLastUpdated(data);
            renderPodium(data);
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
