(function () {
    const DATA_BASE = '../data/';

    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            // Simple CSV parse handling commas inside quotes
            const values = [];
            let current = '';
            let inQuotes = false;
            for (let c = 0; c < line.length; c++) {
                if (line[c] === '"') {
                    inQuotes = !inQuotes;
                } else if (line[c] === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += line[c];
                }
            }
            values.push(current.trim());
            const row = {};
            headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
            rows.push(row);
        }
        return rows;
    }

    async function fetchText(file) {
        try {
            const res = await fetch(DATA_BASE + file);
            if (!res.ok) return null;
            return res.text();
        } catch { return null; }
    }

    async function fetchJSON(file) {
        try {
            const res = await fetch(DATA_BASE + file);
            if (!res.ok) return null;
            return res.json();
        } catch { return null; }
    }

    function calcAge(dobStr) {
        if (!dobStr) return '';
        const dob = new Date(dobStr);
        if (isNaN(dob)) return '';
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age;
    }

    function lookupStats(name, statsData) {
        if (!statsData?.stats) return { matches: '-', runs: '-', wickets: '-' };

        const nameLower = name.toLowerCase();
        const batting = statsData.stats.batting || [];
        const bowling = statsData.stats.bowling || [];

        const batMatch = batting.find(b => (b.batsman_name || '').toLowerCase() === nameLower);
        const bowlMatch = bowling.find(b => (b.bowler_name || '').toLowerCase() === nameLower);

        const batMatches = batMatch?.match_id ?? 0;
        const bowlMatches = bowlMatch?.match_id ?? 0;
        const totalMatches = Math.max(batMatches, bowlMatches);

        return {
            matches: totalMatches > 0 ? totalMatches : '-',
            runs: batMatch ? (batMatch.runs ?? '-') : '-',
            wickets: bowlMatch ? (bowlMatch.wickets ?? '-') : '-'
        };
    }

    function renderSquad(players, statsData) {
        const grid = document.getElementById('squad-grid');
        if (!grid) return;

        if (!players.length) {
            grid.innerHTML = '<p class="no-data-message">No squad data available.</p>';
            return;
        }

        // Sort: captain first, then alphabetically
        players.sort((a, b) => {
            if (a.isCaptain === 'true' && b.isCaptain !== 'true') return -1;
            if (b.isCaptain === 'true' && a.isCaptain !== 'true') return 1;
            return a.name.localeCompare(b.name);
        });

        grid.innerHTML = players.map(p => {
            const isCaptain = p.isCaptain === 'true';
            const stats = lookupStats(p.name, statsData);

            const committeeBadge = p.committeeRole
                ? `<span class="committee-badge">${p.committeeRole}</span>`
                : '';

            const age = calcAge(p.dob);
            const details = [
                age !== '' ? `Age ${age}` : '',
                p.degree || '',
                p.yearGraduated ? `Graduated ${p.yearGraduated}` : ''
            ].filter(Boolean).join(' · ');

            return `
                <div class="player-card${isCaptain ? ' captain' : ''}">
                    <div class="player-info">
                        <div class="player-header">
                            <h3 class="player-name">${p.name}</h3>
                            ${committeeBadge}
                        </div>
                        ${p.cricketRole?.trim() ? `<p class="player-cricket-role">${p.cricketRole}</p>` : ''}
                        ${details ? `<p class="player-details">${details}</p>` : ''}
                        <div class="player-stat-row">
                            <div class="player-stat">
                                <span class="player-stat-value">${stats.matches}</span>
                                <span class="player-stat-label">Matches</span>
                            </div>
                            <div class="player-stat">
                                <span class="player-stat-value">${stats.runs}</span>
                                <span class="player-stat-label">Runs</span>
                            </div>
                            <div class="player-stat">
                                <span class="player-stat-value">${stats.wickets}</span>
                                <span class="player-stat-label">Wickets</span>
                            </div>
                        </div>
                        ${p.funFact?.trim() ? `<p class="player-fun-fact"><strong>Fun fact:</strong> ${p.funFact}</p>` : ''}
                        ${p.quote?.trim() ? `<p class="player-quote">"${p.quote}"</p>` : ''}
                    </div>
                </div>`;
        }).join('');
    }

    async function init() {
        const [csvText, statsData] = await Promise.all([
            fetchText('squad.csv'),
            fetchJSON('stats_all.json')
        ]);

        const players = csvText ? parseCSV(csvText) : [];
        renderSquad(players, statsData);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
