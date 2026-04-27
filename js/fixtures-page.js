/**
 * Fixtures Page - Dynamic Data Renderer
 * Loads real PlayCricket data from JSON and renders it on the fixtures page.
 */

(function () {
    const DATA_BASE = '../data/';
    let resultsData = null;
    let fixturesData = null;
    let statsData = null;
    let seasonsIndex = null;
    let bankHolidays = new Set(); // YYYY-MM-DD strings for England & Wales

    // ── Helpers ──────────────────────────────────────────────

    function isOICC(name) {
        return name && name.toLowerCase().includes('old imperials');
    }

    /**
     * Determine win/loss/tie from scores when the result field is empty.
     * Compares the OICC score against the opponent score.
     */
    function inferResult(match) {
        if (match.result) return match.result;

        const oiccScore = isOICC(match.homeTeam) ? match.homeScore : match.awayScore;
        const oppScore = isOICC(match.homeTeam) ? match.awayScore : match.homeScore;

        if (!oiccScore || !oppScore || oiccScore === '/' || oppScore === '/') return '';

        const oiccRuns = parseInt(oiccScore);
        const oppRuns = parseInt(oppScore);
        if (isNaN(oiccRuns) || isNaN(oppRuns)) return '';

        if (oiccRuns > oppRuns) return 'won';
        if (oiccRuns < oppRuns) return 'lost';
        return 'tie';
    }

    function resultLabel(status, margin) {
        if (margin && (status === 'won' || status === 'lost')) return margin;
        const labels = { won: 'Won', lost: 'Lost', tie: 'Tie', cancelled: 'Cancelled', abandoned: 'Abandoned', shared: 'Trophy Shared' };
        return labels[status] || '';
    }

    function parseDate(isoDate) {
        if (!isoDate) return null;
        return new Date(isoDate + 'T12:00:00');
    }

    function formatShortDate(isoDate) {
        const d = parseDate(isoDate);
        if (!d) return { day: '', num: '', month: '' };
        return {
            day: d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
            num: String(d.getDate()).padStart(2, '0'),
            month: d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
        };
    }

    function sanitise(val) {
        if (val === null || val === undefined || val === 'nan' || val === 'NaN') return '-';
        if (typeof val === 'number' && isNaN(val)) return '-';
        if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(1);
        return String(val);
    }

    // ── Calendar Helpers ─────────────────────────────────────

    function isWeekendOrBankHoliday(isoDate) {
        const d = parseDate(isoDate);
        if (!d) return false;
        const dow = d.getDay(); // 0=Sun, 6=Sat
        return dow === 0 || dow === 6 || bankHolidays.has(isoDate);
    }

    function icsDateStr(isoDate, time) {
        const d = parseDate(isoDate);
        if (!d) return null;
        const pad = n => String(n).padStart(2, '0');
        let startH, endH;
        if (time) {
            const [h, m] = time.split(':').map(Number);
            startH = h; endH = null; // will compute end from duration
            const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), startH, m);
            const duration = isWeekendOrBankHoliday(isoDate) ? 8 : 3; // hours
            const end = new Date(start.getTime() + duration * 60 * 60 * 1000);
            const fmt = dt => `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
            return { start: fmt(start), end: fmt(end), allDay: false };
        } else {
            // No time — use smart defaults
            if (isWeekendOrBankHoliday(isoDate)) {
                startH = 11; endH = 19;
            } else {
                startH = 18; endH = 21;
            }
            const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), startH, 0);
            const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), endH,   0);
            const fmt = dt => `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
            return { start: fmt(start), end: fmt(end), allDay: false };
        }
    }

    function buildVEVENT(f) {
        const dates = icsDateStr(f.date, f.time);
        if (!dates) return null;
        const title = `${f.homeTeam} vs ${f.awayTeam}`;
        return [
            'BEGIN:VEVENT',
            `DTSTART:${dates.start}`,
            `DTEND:${dates.end}`,
            `SUMMARY:${title}`,
            `LOCATION:${f.venue || ''}`,
            `DESCRIPTION:${f.type} cricket match`,
            'END:VEVENT'
        ].join('\r\n');
    }

    function buildICS(f) {
        const vevent = buildVEVENT(f);
        if (!vevent) return null;
        return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OICC//Cricket Fixtures//EN', vevent, 'END:VCALENDAR'].join('\r\n');
    }

    function buildAllICS(fixtures) {
        const vevents = fixtures.map(buildVEVENT).filter(Boolean);
        if (!vevents.length) return null;
        return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OICC//Cricket Fixtures//EN', ...vevents, 'END:VCALENDAR'].join('\r\n');
    }

    function downloadICS(icsText, filename) {
        const blob = new Blob([icsText], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function googleCalURL(f) {
        const dates = icsDateStr(f.date, f.time);
        if (!dates) return '#';
        const title = encodeURIComponent(`${f.homeTeam} vs ${f.awayTeam}`);
        const dateParam = `${dates.start}/${dates.end}`;
        const location = encodeURIComponent(f.venue || '');
        const details = encodeURIComponent(`${f.type} cricket match`);
        return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateParam}&details=${details}&location=${location}`;
    }

    function calDropdownHTML(idx, f) {
        return `
            <div class="cal-dropdown" data-cal-idx="${idx}">
                <button class="btn-add-cal">+ Add to Calendar</button>
                <div class="cal-options">
                    <a href="${googleCalURL(f)}" target="_blank" rel="noopener">Google Calendar</a>
                    <button class="cal-ics-btn" data-cal-idx="${idx}">Apple / Outlook (.ics)</button>
                </div>
            </div>`;
    }

    function setupCalendarButtons(fixtures) {
        // Toggle dropdown open/closed
        document.addEventListener('click', function (e) {
            const toggleBtn = e.target.closest('.btn-add-cal');
            const dropdown = e.target.closest('.cal-dropdown');
            document.querySelectorAll('.cal-dropdown.open').forEach(d => {
                if (d !== dropdown) d.classList.remove('open');
            });
            if (toggleBtn) {
                e.stopPropagation();
                dropdown.classList.toggle('open');
            } else if (!dropdown) {
                document.querySelectorAll('.cal-dropdown.open').forEach(d => d.classList.remove('open'));
            }
        });

        // Single fixture ICS download
        document.addEventListener('click', function (e) {
            const btn = e.target.closest('.cal-ics-btn');
            if (!btn) return;
            const idx = parseInt(btn.dataset.calIdx, 10);
            const f = fixtures[idx];
            if (!f) return;
            const ics = buildICS(f);
            if (ics) downloadICS(ics, `oicc-fixture-${f.date}.ics`);
        });

        // All fixtures ICS download
        document.addEventListener('click', function (e) {
            if (!e.target.closest('#btn-add-all-cal')) return;
            const ics = buildAllICS(fixtures);
            if (ics) downloadICS(ics, 'oicc-fixtures-2026.ics');
        });
    }

    // ── Data Fetching ────────────────────────────────────────

    async function fetchJSON(file) {
        try {
            const res = await fetch(DATA_BASE + file);
            if (!res.ok) return null;
            return res.json();
        } catch { return null; }
    }

    async function loadBankHolidays() {
        try {
            const res = await fetch('https://www.gov.uk/bank-holidays.json');
            if (!res.ok) return;
            const data = await res.json();
            const events = data['england-and-wales']?.events || [];
            bankHolidays = new Set(events.map(e => e.date));
        } catch { /* silently ignore — smart defaults will fall back to weekday times */ }
    }

    async function loadAllData() {
        // Load seasons index first to determine which season has data
        seasonsIndex = await fetchJSON('seasons.json');

        [resultsData, fixturesData, statsData] = await Promise.all([
            fetchJSON('results.json'),
            fetchJSON('fixtures.json'),
            fetchJSON('stats.json'),
        ]);

        // If default season stats are empty, find the most recent season with data
        if ((!statsData?.stats?.batting?.length) && seasonsIndex?.seasons?.length) {
            for (const yr of seasonsIndex.seasons) {
                const suffix = String(yr) === String(seasonsIndex.default) ? '' : `_${yr}`;
                const tryStats = await fetchJSON(`stats${suffix}.json`);
                if (tryStats?.stats?.batting?.length) {
                    statsData = tryStats;
                    // Also load matching results for the season summary
                    const tryResults = await fetchJSON(`results${suffix}.json`);
                    if (tryResults) resultsData = tryResults;
                    break;
                }
            }
        }
    }

    // ── Latest Result ────────────────────────────────────────

    function renderLatestResult() {
        const container = document.getElementById('latest-result');
        if (!container) return;

        const results = resultsData?.results;
        if (!results || results.length === 0) {
            container.innerHTML = '<p class="no-data-message">No results available yet.</p>';
            return;
        }

        // Find most recent result with actual scores
        const latest = results.find(r => r.homeScore && r.homeScore !== '/') || results[0];
        const status = inferResult(latest);

        container.innerHTML = `
            <div class="latest-result-card ${status}">
                <div class="latest-result-header">
                    <span class="latest-result-label">Latest Result</span>
                    ${status ? `<span class="result-badge ${status}">${resultLabel(status, latest.resultMargin)}</span>` : ''}
                </div>
                <div class="latest-result-body">
                    <div class="latest-team">
                        <span class="latest-team-name">${latest.homeTeam}</span>
                        <span class="latest-score">${latest.homeScore || '-'}</span>
                    </div>
                    <span class="latest-vs">vs</span>
                    <div class="latest-team">
                        <span class="latest-team-name">${latest.awayTeam}</span>
                        <span class="latest-score">${latest.awayScore || '-'}</span>
                    </div>
                </div>
                <div class="latest-result-meta">
                    <span>${latest.date}</span>
                    <span>${latest.venue}</span>
                    <span class="fixture-type">${latest.type}</span>
                </div>
                ${latest.resultText ? `<p class="latest-result-text">${latest.resultText}</p>` : ''}
            </div>
        `;
    }

    // ── Upcoming Fixtures ────────────────────────────────────

    function renderUpcomingFixtures() {
        const container = document.getElementById('upcoming-fixtures');
        if (!container) return;

        const fixtures = fixturesData?.fixtures;
        if (!fixtures || fixtures.length === 0) {
            container.innerHTML = `
                <div class="no-data-message">
                    <p>No upcoming fixtures scheduled yet.</p>
                    <p style="font-size:0.9rem;color:var(--gray);margin-top:0.5rem;">
                        Check back soon or visit
                        <a href="https://oldimperials.play-cricket.com/home" target="_blank"
                           style="color:var(--gold-dark);font-weight:600;">Play-Cricket</a>
                        for the latest updates.
                    </p>
                </div>`;
            return;
        }

        const sliced = fixtures.slice(0, 5);
        let html = '<div class="fixtures-grid">';
        sliced.forEach((f, idx) => {
            const d = formatShortDate(f.date);
            const homeClass = isOICC(f.homeTeam) ? 'team-home' : 'team-away';
            const awayClass = isOICC(f.awayTeam) ? 'team-home' : 'team-away';
            html += `
                <div class="fixture-card">
                    <div class="fixture-date">
                        <span class="date-day">${d.day}</span>
                        <span class="date-number">${d.num}</span>
                        <span class="date-month">${d.month}</span>
                    </div>
                    <div class="fixture-details">
                        <div class="fixture-teams">
                            <span class="${homeClass}">${f.homeTeam}</span>
                            <span class="vs">vs</span>
                            <span class="${awayClass}">${f.awayTeam}</span>
                        </div>
                        <div class="fixture-meta">
                            <span class="fixture-time">${f.time || ''}</span>
                            <span class="fixture-venue">${f.venue || ''}</span>
                        </div>
                        <span class="fixture-type">${f.type}</span>
                        ${calDropdownHTML(idx, f)}
                    </div>
                </div>`;
        });
        html += '</div>';
        html += `
            <div style="text-align:right;margin-top:1rem;">
                <button id="btn-add-all-cal" class="btn-add-cal" style="font-size:0.85rem;padding:0.4rem 1.1rem;">
                    + Add All Fixtures to Calendar
                </button>
            </div>`;
        container.innerHTML = html;
        setupCalendarButtons(sliced);
    }

    // ── Results List ─────────────────────────────────────────

    function renderResults() {
        const container = document.getElementById('results-list');
        if (!container) return;

        const results = resultsData?.results;
        if (!results || results.length === 0) {
            container.innerHTML = '<p class="no-data-message">No results available for this season.</p>';
            return;
        }

        let html = '';
        for (const r of results) {
            const status = inferResult(r);
            const oiccIsHome = isOICC(r.homeTeam);
            const oiccName = oiccIsHome ? r.homeTeam : r.awayTeam;
            const oiccScore = oiccIsHome ? r.homeScore : r.awayScore;
            const oppName = oiccIsHome ? r.awayTeam : r.homeTeam;
            const oppScore = oiccIsHome ? r.awayScore : r.homeScore;
            html += `
                <div class="result-card ${status}">
                    <div class="result-header">
                        <span class="result-date">${r.date} • ${r.type}</span>
                        ${status ? `<span class="result-badge ${status}">${resultLabel(status, r.resultMargin)}</span>` : ''}
                    </div>
                    <div class="result-teams">
                        <div class="team-score">
                            <span class="team-name oicc-team">${oiccName}</span>
                            <span class="score">${oiccScore || '-'}</span>
                        </div>
                        <span class="vs-separator">vs</span>
                        <div class="team-score">
                            <span class="team-name">${oppName}</span>
                            <span class="score">${oppScore || '-'}</span>
                        </div>
                    </div>
                    <div class="match-details">
                        <span class="match-detail">${r.venue}</span>
                        ${r.resultText ? `<span class="match-detail">${r.resultText}</span>` : ''}
                    </div>
                </div>`;
        }
        container.innerHTML = html;
    }

    // ── Season Stats ─────────────────────────────────────────

    function renderStats() {
        renderBattingStats();
        renderBowlingStats();
        renderSeasonSummary();
    }

    function renderSeasonSummary() {
        const container = document.getElementById('season-summary');
        if (!container) return;

        const results = resultsData?.results || [];
        const total = results.filter(r => r.homeScore && r.homeScore !== '/').length;
        const wins = results.filter(r => inferResult(r) === 'won').length;
        const losses = results.filter(r => inferResult(r) === 'lost').length;
        const winRate = total > 0 ? ((wins / total) * 100).toFixed(0) : 0;

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Games Played</div>
                    <div class="stat-number">${total}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Games Won</div>
                    <div class="stat-number">${wins}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Games Lost</div>
                    <div class="stat-number">${losses}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Win Rate</div>
                    <div class="stat-number">${winRate}%</div>
                </div>
            </div>`;
    }

    function renderBattingStats() {
        const container = document.getElementById('batting-stats');
        if (!container) return;

        const batting = statsData?.stats?.batting;
        if (!batting || batting.length === 0) {
            container.innerHTML = '<p class="no-data-message">No batting stats available.</p>';
            return;
        }

        const DEFAULT_SHOW = 10;
        const hasMore = batting.length > DEFAULT_SHOW;

        let html = `
            <h4 style="color:var(--primary-blue);margin-bottom:1rem;">Top Batters</h4>
            <table class="score-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th>Mat</th>
                        <th>Runs</th>
                        <th>HS</th>
                        <th>Avg</th>
                        <th>50s</th>
                        <th>100s</th>
                    </tr>
                </thead>
                <tbody>`;

        batting.forEach((b, i) => {
            const avg = (b.average !== null && !isNaN(b.average)) ? b.average.toFixed(1) : '-';
            const hiddenClass = i >= DEFAULT_SHOW ? ' class="stats-hidden-row"' : '';
            html += `
                    <tr${hiddenClass}>
                        <td>${b.rank}</td>
                        <td><strong>${b.batsman_name || b.initial_name}</strong></td>
                        <td>${sanitise(b.match_id)}</td>
                        <td><strong>${b.runs}</strong></td>
                        <td>${b.top_score}${b.not_out >= 1 ? '*' : ''}</td>
                        <td>${avg}</td>
                        <td>${b['50s']}</td>
                        <td>${b['100s']}</td>
                    </tr>`;
        });

        html += '</tbody></table>';
        if (hasMore) {
            html += `<button class="see-more-btn" data-target="batting-stats">See all ${batting.length} batters</button>`;
        }
        container.innerHTML = html;
    }

    function renderBowlingStats() {
        const container = document.getElementById('bowling-stats');
        if (!container) return;

        const bowling = statsData?.stats?.bowling;
        if (!bowling || bowling.length === 0) {
            container.innerHTML = '<p class="no-data-message">No bowling stats available.</p>';
            return;
        }

        const DEFAULT_SHOW = 10;
        const hasMore = bowling.length > DEFAULT_SHOW;

        let html = `
            <h4 style="color:var(--primary-blue);margin-bottom:1rem;">Top Bowlers</h4>
            <table class="score-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th>Mat</th>
                        <th>Overs</th>
                        <th>Wkts</th>
                        <th>Avg</th>
                        <th>Econ</th>
                        <th>Best</th>
                    </tr>
                </thead>
                <tbody>`;

        bowling.forEach((b, i) => {
            const avg = (b.average !== null && !isNaN(b.average)) ? b.average.toFixed(1) : '-';
            const econ = (b.econ !== null && !isNaN(b.econ)) ? b.econ.toFixed(1) : '-';
            const hiddenClass = i >= DEFAULT_SHOW ? ' class="stats-hidden-row"' : '';
            html += `
                    <tr${hiddenClass}>
                        <td>${b.rank}</td>
                        <td><strong>${b.bowler_name || b.initial_name}</strong></td>
                        <td>${sanitise(b.match_id)}</td>
                        <td>${sanitise(b.overs)}</td>
                        <td><strong>${b.wickets}</strong></td>
                        <td>${avg}</td>
                        <td>${econ}</td>
                        <td>${b.best_figures || (b.max_wickets + '/-')}</td>
                    </tr>`;
        });

        html += '</tbody></table>';
        if (hasMore) {
            html += `<button class="see-more-btn" data-target="bowling-stats">See all ${bowling.length} bowlers</button>`;
        }
        container.innerHTML = html;
    }

    // ── Season Selectors ─────────────────────────────────────

    function getSeasonFile(prefix, season) {
        const defaultSeason = seasonsIndex?.default || 2025;
        if (season === 'all') return `${prefix}_all.json`;
        if (String(season) === String(defaultSeason)) return `${prefix}.json`;
        return `${prefix}_${season}.json`;
    }

    function getMostRecentSeasonWithData() {
        // The seasons array is sorted descending; pick the first that has stats
        // For now, if the default (current year) has no stats, fall back to next
        const defaultSeason = seasonsIndex?.default;
        if (statsData?.stats?.batting?.length) return String(statsData.season || defaultSeason);
        // Otherwise return first season in the list that isn't the empty current year
        for (const yr of seasonsIndex?.seasons || []) {
            if (yr !== defaultSeason) return String(yr);
        }
        return String(defaultSeason);
    }

    function populateDropdown(selector, includeAllTime) {
        if (!selector || !seasonsIndex?.seasons?.length) return;
        selector.innerHTML = '';
        if (includeAllTime) {
            const allOpt = document.createElement('option');
            allOpt.value = 'all';
            allOpt.textContent = 'All Time';
            selector.appendChild(allOpt);
        }
        for (const yr of seasonsIndex.seasons) {
            const opt = document.createElement('option');
            opt.value = yr;
            opt.textContent = yr;
            selector.appendChild(opt);
        }
    }

    function setupSeasonSelectors() {
        // Results season selector
        const resultsSelector = document.getElementById('season-select');
        if (resultsSelector) {
            populateDropdown(resultsSelector, false);
            resultsSelector.value = String(seasonsIndex?.default || 2025);
            resultsSelector.addEventListener('change', async function () {
                const season = this.value;
                const seasonResults = await fetchJSON(getSeasonFile('results', season));
                if (seasonResults) resultsData = seasonResults;
                renderResults();
            });
        }

        // Stats season selector (with All Time option)
        const statsSelector = document.getElementById('stats-season-select');
        if (statsSelector) {
            populateDropdown(statsSelector, true);
            // Default to most recent season with data, not "All Time"
            statsSelector.value = getMostRecentSeasonWithData();
            statsSelector.addEventListener('change', async function () {
                const season = this.value;
                const seasonStats = await fetchJSON(getSeasonFile('stats', season));
                const seasonResults = await fetchJSON(getSeasonFile('results', season));
                if (seasonStats) statsData = seasonStats;
                if (seasonResults) resultsData = seasonResults;
                renderStats();
            });
        }
    }

    // ── See More Toggle ──────────────────────────────────────

    function setupSeeMore() {
        document.addEventListener('click', function (e) {
            if (!e.target.classList.contains('see-more-btn')) return;
            const container = document.getElementById(e.target.dataset.target);
            if (!container) return;
            const hidden = container.querySelectorAll('.stats-hidden-row');
            const isCollapsed = hidden[0]?.classList.contains('stats-hidden-row') &&
                                getComputedStyle(hidden[0]).display === 'none';
            if (isCollapsed) {
                hidden.forEach(r => r.style.display = 'table-row');
                e.target.textContent = 'Show top 10';
            } else {
                hidden.forEach(r => r.style.display = '');
                const count = container.querySelectorAll('tbody tr').length;
                const label = e.target.dataset.target === 'batting-stats' ? 'batters' : 'bowlers';
                e.target.textContent = `See all ${count} ${label}`;
            }
        });
    }

    // ── Achton Villa ──────────────────────────────────────────

    async function renderAchtonVilla() {
        const data = await fetchJSON('achton_villa.json');
        if (!data) return;

        renderAVLatestResult(data);
        renderAVLeagueTable(data);
        renderAVMatchList(data);
    }

    function avMatchResult(m) {
        const isHome = m.homeTeam.toLowerCase().includes('achton');
        const avGoals = isHome ? m.homeScore : m.awayScore;
        const oppGoals = isHome ? m.awayScore : m.homeScore;
        if (avGoals > oppGoals) return 'won';
        if (avGoals < oppGoals) return 'lost';
        return 'draw';
    }

    function avFormatDate(isoDate) {
        const d = new Date(isoDate + 'T12:00:00');
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function renderAVLatestResult(data) {
        const container = document.getElementById('av-summary');
        if (!container) return;

        const results = data.results;
        if (!results || results.length === 0) {
            container.innerHTML = '';
            return;
        }

        const latest = results[0]; // already sorted most recent first
        const result = avMatchResult(latest);
        const isHome = latest.homeTeam.toLowerCase().includes('achton');
        const opponent = isHome ? latest.awayTeam : latest.homeTeam;
        const avGoals = isHome ? latest.homeScore : latest.awayScore;
        const oppGoals = isHome ? latest.awayScore : latest.homeScore;
        const resultColors = { won: '#28a745', lost: 'var(--deep-red)', draw: 'var(--gold)' };
        const resultLabels = { won: 'WIN', lost: 'LOSS', draw: 'DRAW' };

        container.innerHTML = `
            <div class="av-latest-result" style="background: var(--white); border-radius: var(--radius-lg); padding: 1.5rem; margin-bottom: 2rem; box-shadow: var(--shadow-sm); border-left: 5px solid ${resultColors[result]};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                    <span style="font-size: 0.9rem; color: var(--gray);">Latest Result &middot; ${avFormatDate(latest.date)}</span>
                    <span style="background: ${resultColors[result]}; color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-weight: 700; font-size: 0.85rem;">${resultLabels[result]}</span>
                </div>
                <div style="display: flex; justify-content: center; align-items: center; gap: 2rem; flex-wrap: wrap;">
                    <div style="text-align: center;">
                        <div style="font-weight: 700; color: var(--deep-red); font-size: 1.1rem;">Achton Villa</div>
                        <div style="font-size: 2.5rem; font-weight: 700; color: var(--dark-gray);">${avGoals}</div>
                    </div>
                    <span style="font-size: 1.2rem; font-weight: 700; color: var(--gray);">-</span>
                    <div style="text-align: center;">
                        <div style="font-weight: 700; color: var(--primary-blue); font-size: 1.1rem;">${opponent}</div>
                        <div style="font-size: 2.5rem; font-weight: 700; color: var(--dark-gray);">${oppGoals}</div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 0.75rem; font-size: 0.85rem; color: var(--gray);">${latest.time}</div>
            </div>`;
    }

    function renderAVLeagueTable(data) {
        const container = document.getElementById('av-league-table');
        if (!container || !data.leagueTable) return;

        let html = `
            <div class="av-league-table-wrapper">
                <h3>League Table</h3>
                <table class="av-table">
                    <thead>
                        <tr>
                            <th>Pos</th>
                            <th>Team</th>
                            <th>P</th>
                            <th>W</th>
                            <th>D</th>
                            <th>L</th>
                            <th>GF</th>
                            <th>GA</th>
                            <th>GD</th>
                            <th>Pts</th>
                        </tr>
                    </thead>
                    <tbody>`;

        for (const t of data.leagueTable) {
            const isAV = t.team.toLowerCase().includes('achton');
            html += `
                        <tr${isAV ? ' class="av-highlight"' : ''}>
                            <td>${t.position}</td>
                            <td>${t.team}</td>
                            <td>${t.played}</td>
                            <td>${t.won}</td>
                            <td>${t.drawn}</td>
                            <td>${t.lost}</td>
                            <td>${t.goalsFor}</td>
                            <td>${t.goalsAgainst}</td>
                            <td>${t.goalDifference > 0 ? '+' : ''}${t.goalDifference}</td>
                            <td><strong>${t.points}</strong></td>
                        </tr>`;
        }

        html += `
                    </tbody>
                </table>`;

        if (data.leagueUrl) {
            html += `
                <p class="av-table-footer">
                    <a href="${data.leagueUrl}" target="_blank">View on PlayFiveASide</a>`;
            if (data.lastUpdated) {
                const d = new Date(data.lastUpdated);
                html += ` &middot; Updated ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
            }
            html += `</p>`;
        }

        html += '</div>';
        container.innerHTML = html;
    }

    function renderAVMatchList(data) {
        const container = document.getElementById('av-league-table');
        if (!container) return;

        // Append results and fixtures below the league table (already rendered)
        let html = container.innerHTML;

        const resultColors = { won: '#28a745', lost: 'var(--deep-red)', draw: 'var(--gold)' };

        // Results section
        if (data.results && data.results.length > 0) {
            html += `<h3 style="color: var(--primary-blue); margin: 2rem 0 1rem;">Results</h3>
                <div class="av-match-list">`;
            for (const m of data.results) {
                const res = avMatchResult(m);
                const isHome = m.homeTeam.toLowerCase().includes('achton');
                const opponent = isHome ? m.awayTeam : m.homeTeam;
                const avGoals = isHome ? m.homeScore : m.awayScore;
                const oppGoals = isHome ? m.awayScore : m.homeScore;
                html += `
                    <div class="av-match-row" style="border-left: 4px solid ${resultColors[res]};">
                        <span class="av-match-date">${avFormatDate(m.date)}</span>
                        <span class="av-match-vs">vs ${opponent}</span>
                        <span class="av-match-score">${avGoals} - ${oppGoals}</span>
                        <span class="av-match-badge" style="background: ${resultColors[res]};">${res === 'won' ? 'W' : res === 'lost' ? 'L' : 'D'}</span>
                    </div>`;
            }
            html += '</div>';
        }

        // Fixtures section
        if (data.fixtures && data.fixtures.length > 0) {
            html += `<h3 style="color: var(--primary-blue); margin: 2rem 0 1rem;">Upcoming Fixtures</h3>
                <div class="av-match-list">`;
            for (const m of data.fixtures) {
                const isHome = m.homeTeam.toLowerCase().includes('achton');
                const opponent = isHome ? m.awayTeam : m.homeTeam;
                html += `
                    <div class="av-match-row av-fixture-row">
                        <span class="av-match-date">${avFormatDate(m.date)}</span>
                        <span class="av-match-vs">vs ${opponent}</span>
                        <span class="av-match-score">${m.time}</span>
                    </div>`;
            }
            html += '</div>';
        }

        container.innerHTML = html;
    }

    // ── Tab Handling ─────────────────────────────────────────

    function setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const tabId = this.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(tabId).classList.add('active');
            });
        });
    }

    // ── Last Updated ─────────────────────────────────────────

    function renderLastUpdated() {
        const el = document.getElementById('last-updated');
        if (!el) return;
        const ts = resultsData?.lastUpdated;
        if (ts) {
            const d = new Date(ts);
            el.textContent = `Data last updated: ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
        }
    }

    // ── Init ─────────────────────────────────────────────────

    async function init() {
        await Promise.all([loadAllData(), loadBankHolidays()]);
        renderLatestResult();
        renderUpcomingFixtures();
        renderResults();
        renderStats();
        renderLastUpdated();
        renderAchtonVilla();
        setupSeasonSelectors();
        setupSeeMore();
        setupTabs();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
