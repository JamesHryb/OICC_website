/**
 * PlayCricket Web Scraper
 * Fetches fixtures and results from Old Imperials PlayCricket page
 * Can be run as a Node.js script or deployed as a serverless function
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const PLAYCRICKET_URL = 'https://oldimperials.play-cricket.com/home';
const OUTPUT_DIR = path.join(__dirname, '../data');

/**
 * Fetch HTML from PlayCricket page
 */
function fetchPlayCricketHTML() {
    return new Promise((resolve, reject) => {
        https.get(PLAYCRICKET_URL, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Parse fixtures from HTML
 * Note: This is a simplified parser - you'll need to inspect the actual PlayCricket HTML
 * and adjust the selectors accordingly
 */
function parseFixtures(html) {
    const fixtures = [];

    // PlayCricket typically uses classes like 'fixture-row', 'match-date', etc.
    // This is a template - inspect the actual HTML and update regex patterns

    // Example pattern for fixture data
    const fixturePattern = /<div class="fixture[^>]*>(.*?)<\/div>/gs;
    const matches = html.matchAll(fixturePattern);

    for (const match of matches) {
        const fixtureHTML = match[1];

        // Extract date
        const dateMatch = fixtureHTML.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/);

        // Extract teams
        const teamsMatch = fixtureHTML.match(/Old Imperials[^<]*vs[^<]*([^<]+)/);

        // Extract venue
        const venueMatch = fixtureHTML.match(/venue[^>]*>([^<]+)/i);

        if (dateMatch && teamsMatch) {
            fixtures.push({
                date: dateMatch[0],
                homeTeam: 'Old Imperials CC',
                awayTeam: teamsMatch[1].trim(),
                venue: venueMatch ? venueMatch[1].trim() : 'TBC',
                time: 'TBC',
                type: 'League' // You'll need to extract this from the HTML
            });
        }
    }

    return fixtures;
}

/**
 * Parse recent results from HTML
 */
function parseResults(html) {
    const results = [];

    // Similar to fixtures, adjust patterns based on actual HTML structure
    const resultPattern = /<div class="result[^>]*>(.*?)<\/div>/gs;
    const matches = html.matchAll(resultPattern);

    for (const match of matches) {
        const resultHTML = match[1];

        // Extract match details
        const dateMatch = resultHTML.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/);

        // Extract scores
        const scorePattern = /(\d+)\/(\d+)/g;
        const scores = [...resultHTML.matchAll(scorePattern)];

        // Extract result
        const wonMatch = resultHTML.match(/won by/i);
        const lostMatch = resultHTML.match(/lost by/i);

        if (dateMatch && scores.length >= 2) {
            results.push({
                date: dateMatch[0],
                homeTeam: 'Old Imperials CC',
                homeScore: scores[0][0],
                awayTeam: 'Opponent', // Extract from HTML
                awayScore: scores[1][0],
                result: wonMatch ? 'won' : lostMatch ? 'lost' : 'tie',
                venue: 'TBC'
            });
        }
    }

    return results;
}

/**
 * Main scraper function
 */
async function scrapePlayCricket() {
    try {
        console.log('Fetching data from PlayCricket...');
        const html = await fetchPlayCricketHTML();

        console.log('Parsing fixtures...');
        const fixtures = parseFixtures(html);

        console.log('Parsing results...');
        const results = parseResults(html);

        // Save to JSON files
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        fs.writeFileSync(
            path.join(OUTPUT_DIR, 'fixtures.json'),
            JSON.stringify({ fixtures, lastUpdated: new Date().toISOString() }, null, 2)
        );

        fs.writeFileSync(
            path.join(OUTPUT_DIR, 'results.json'),
            JSON.stringify({ results, lastUpdated: new Date().toISOString() }, null, 2)
        );

        console.log(`✓ Scraped ${fixtures.length} fixtures and ${results.length} results`);
        console.log('✓ Data saved to data/ directory');

        return { fixtures, results };

    } catch (error) {
        console.error('Error scraping PlayCricket:', error);
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    scrapePlayCricket()
        .then(() => console.log('Scraping complete!'))
        .catch(err => {
            console.error('Scraping failed:', err);
            process.exit(1);
        });
}

module.exports = { scrapePlayCricket, parseFixtures, parseResults };
