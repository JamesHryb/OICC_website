/**
 * PlayCricket Data Loader
 * Loads fixtures and results from scraped JSON data
 */

class PlayCricketLoader {
    constructor() {
        this.fixturesData = null;
        this.resultsData = null;
        this.dataPath = './data/';
    }

    /**
     * Load fixtures from JSON file
     */
    async loadFixtures() {
        try {
            const response = await fetch(`${this.dataPath}fixtures.json`);
            if (!response.ok) {
                console.warn('Fixtures data not found, using fallback');
                return null;
            }
            this.fixturesData = await response.json();
            return this.fixturesData;
        } catch (error) {
            console.error('Error loading fixtures:', error);
            return null;
        }
    }

    /**
     * Load results from JSON file
     */
    async loadResults() {
        try {
            const response = await fetch(`${this.dataPath}results.json`);
            if (!response.ok) {
                console.warn('Results data not found, using fallback');
                return null;
            }
            this.resultsData = await response.json();
            return this.resultsData;
        } catch (error) {
            console.error('Error loading results:', error);
            return null;
        }
    }

    /**
     * Render fixtures to the page
     */
    renderFixtures(containerId = 'fixtures-container') {
        const container = document.getElementById(containerId);
        if (!container || !this.fixturesData) return;

        const { fixtures, lastUpdated } = this.fixturesData;

        if (!fixtures || fixtures.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--gray);">No upcoming fixtures at this time.</p>';
            return;
        }

        // Add last updated timestamp
        const updateInfo = document.createElement('p');
        updateInfo.style.cssText = 'text-align: right; color: var(--gray); font-size: 0.9rem; margin-bottom: 1rem;';
        updateInfo.textContent = `Last updated: ${new Date(lastUpdated).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}`;
        container.appendChild(updateInfo);

        // Render fixtures
        const fixturesGrid = document.createElement('div');
        fixturesGrid.className = 'fixtures-grid';

        fixtures.slice(0, 5).forEach(fixture => {
            const card = this.createFixtureCard(fixture);
            fixturesGrid.appendChild(card);
        });

        container.appendChild(fixturesGrid);
    }

    /**
     * Create a fixture card element
     */
    createFixtureCard(fixture) {
        const card = document.createElement('div');
        card.className = 'fixture-card';

        const date = new Date(fixture.date);
        const dateElement = document.createElement('div');
        dateElement.className = 'fixture-date';
        dateElement.innerHTML = `
            <span class="date-day">${date.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</span>
            <span class="date-number">${date.getDate()}</span>
            <span class="date-month">${date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</span>
        `;

        const details = document.createElement('div');
        details.className = 'fixture-details';
        details.innerHTML = `
            <div class="fixture-teams">
                <span class="team-home">${fixture.homeTeam}</span>
                <span class="vs">vs</span>
                <span class="team-away">${fixture.awayTeam}</span>
            </div>
            <div class="fixture-meta">
                <span class="fixture-time">⏰ ${fixture.time || 'TBC'}</span>
                <span class="fixture-venue">📍 ${fixture.venue || 'TBC'}</span>
            </div>
            <span class="fixture-type">${fixture.type || 'Friendly'}</span>
        `;

        card.appendChild(dateElement);
        card.appendChild(details);

        return card;
    }

    /**
     * Render results to the page
     */
    renderResults(containerId = 'results-container') {
        const container = document.getElementById(containerId);
        if (!container || !this.resultsData) return;

        const { results, lastUpdated } = this.resultsData;

        if (!results || results.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--gray);">No recent results available.</p>';
            return;
        }

        // Add last updated timestamp
        const updateInfo = document.createElement('p');
        updateInfo.style.cssText = 'text-align: right; color: var(--gray); font-size: 0.9rem; margin-bottom: 1rem;';
        updateInfo.textContent = `Last updated: ${new Date(lastUpdated).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}`;
        container.appendChild(updateInfo);

        // Render results
        results.slice(0, 10).forEach(result => {
            const card = this.createResultCard(result);
            container.appendChild(card);
        });
    }

    /**
     * Create a result card element
     */
    createResultCard(result) {
        const card = document.createElement('div');
        card.className = `result-card ${result.result}`;

        const header = document.createElement('div');
        header.className = 'result-header';
        header.innerHTML = `
            <span class="result-date">${result.date} • ${result.type || 'Match'}</span>
            <span class="result-badge ${result.result}">${result.result.toUpperCase()}</span>
        `;

        const teams = document.createElement('div');
        teams.className = 'result-teams';
        teams.innerHTML = `
            <div class="team-score">
                <span class="team-name">${result.homeTeam}</span>
                <span class="score">${result.homeScore}</span>
            </div>
            <span class="vs-separator">vs</span>
            <div class="team-score">
                <span class="team-name">${result.awayTeam}</span>
                <span class="score">${result.awayScore}</span>
            </div>
        `;

        const details = document.createElement('div');
        details.className = 'match-details';
        details.innerHTML = `
            <span class="match-detail">📍 ${result.venue}</span>
            ${result.margin ? `<span class="match-detail">🏆 ${result.margin}</span>` : ''}
            ${result.potm ? `<span class="match-detail">⭐ POTM: ${result.potm}</span>` : ''}
        `;

        card.appendChild(header);
        card.appendChild(teams);
        card.appendChild(details);

        return card;
    }

    /**
     * Initialize and load all data
     */
    async init() {
        try {
            await Promise.all([
                this.loadFixtures(),
                this.loadResults()
            ]);

            // Auto-render if containers exist
            if (document.getElementById('fixtures-container')) {
                this.renderFixtures();
            }

            if (document.getElementById('results-container')) {
                this.renderResults();
            }

            // Emit custom event for other scripts
            document.dispatchEvent(new CustomEvent('playcricket-data-loaded', {
                detail: {
                    fixtures: this.fixturesData,
                    results: this.resultsData
                }
            }));

        } catch (error) {
            console.error('Error initializing PlayCricket data:', error);
        }
    }

    /**
     * Get data for external use
     */
    getData() {
        return {
            fixtures: this.fixturesData,
            results: this.resultsData
        };
    }
}

// Initialize when DOM is ready
if (typeof window !== 'undefined') {
    window.PlayCricketLoader = PlayCricketLoader;

    // Auto-initialize if on fixtures page
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.pathname.includes('fixtures')) {
            const loader = new PlayCricketLoader();
            loader.init();
        }
    });
}
