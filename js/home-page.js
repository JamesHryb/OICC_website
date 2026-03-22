/**
 * Home Page - Dynamic Data Loader
 * Pulls real PlayCricket data into the home page sections.
 */

(function () {
    const DATA_BASE = './data/';

    function isOICC(name) {
        return name && name.toLowerCase().includes('old imperials');
    }

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

    async function fetchJSON(file) {
        try {
            const res = await fetch(DATA_BASE + file);
            if (!res.ok) return null;
            return res.json();
        } catch { return null; }
    }

    function formatShortDate(isoDate) {
        if (!isoDate) return { day: '', num: '', month: '' };
        const d = new Date(isoDate + 'T12:00:00');
        return {
            day: d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
            num: String(d.getDate()).padStart(2, '0'),
            month: d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
        };
    }

    function renderStats(resultsData, statsData) {
        const container = document.getElementById('home-stats');
        if (!container) return;

        const results = resultsData?.results || [];
        const batting = statsData?.stats?.batting || [];
        const bowling = statsData?.stats?.bowling || [];

        const total = results.filter(r => r.homeScore && r.homeScore !== '/').length;
        const wins = results.filter(r => inferResult(r) === 'won').length;

        // Find highest individual score across all batters
        let highScore = '-';
        if (batting.length > 0) {
            let best = batting[0];
            for (const b of batting) {
                if (b.top_score > best.top_score) best = b;
            }
            highScore = best.top_score;
        }

        // Find best bowling from bowling stats
        let bestBowling = '-';
        if (bowling.length > 0) {
            bestBowling = bowling[0].best_figures || (bowling[0].max_wickets + '/-');
        }

        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Games Played</div>
                <div class="stat-number">${total}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Games Won</div>
                <div class="stat-number">${wins}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Highest Score</div>
                <div class="stat-number">${highScore}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Best Bowling</div>
                <div class="stat-number">${bestBowling}</div>
            </div>`;
    }

    function renderFixtures(fixturesData) {
        const container = document.getElementById('home-fixtures');
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

        let html = '';
        for (const f of fixtures.slice(0, 3)) {
            const d = formatShortDate(f.date);
            html += `
                <div class="fixture-card">
                    <div class="fixture-date">
                        <span class="date-day">${d.day}</span>
                        <span class="date-number">${d.num}</span>
                        <span class="date-month">${d.month}</span>
                    </div>
                    <div class="fixture-details">
                        <div class="fixture-teams">
                            <span class="team-home">${f.homeTeam}</span>
                            <span class="vs">vs</span>
                            <span class="team-away">${f.awayTeam}</span>
                        </div>
                        <div class="fixture-meta">
                            <span class="fixture-time">${f.time || 'TBC'}</span>
                            <span class="fixture-venue">${f.venue || 'TBC'}</span>
                        </div>
                        <span class="fixture-type">${f.type}</span>
                    </div>
                </div>`;
        }
        container.innerHTML = html;
    }

    async function init() {
        // Load all-time stats for the homepage, plus current fixtures
        const [resultsData, fixturesData, statsData] = await Promise.all([
            fetchJSON('results_all.json'),
            fetchJSON('fixtures.json'),
            fetchJSON('stats_all.json'),
        ]);

        renderStats(resultsData, statsData);
        renderFixtures(fixturesData);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
