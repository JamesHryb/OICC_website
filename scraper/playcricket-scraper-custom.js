/**
 * Custom PlayCricket Scraper for Old Imperials CC
 * Designed specifically for oldimperials.play-cricket.com format
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
 * Parse date from PlayCricket format
 * Example: "Saturday 16 August 2025" → "2025-08-16"
 */
function parseDate(dateString) {
    const months = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };

    // Match pattern: "Saturday 16 August 2025"
    const match = dateString.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = months[match[2]];
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
    return dateString;
}

/**
 * Parse results from HTML text content
 * Based on the format you showed me
 */
function parseResults(htmlText) {
    const results = [];

    // Split by "assignment" markers (each match starts with this)
    const matchBlocks = htmlText.split('assignment');

    for (const block of matchBlocks) {
        if (block.trim().length < 20) continue; // Skip empty blocks

        try {
            // Extract date - pattern: "Saturday 16 August 2025"
            const dateMatch = block.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}\s+\w+\s+\d{4}/);
            if (!dateMatch) continue;

            const dateStr = dateMatch[0];
            const isoDate = parseDate(dateStr);

            // Extract result text - pattern: "TEAM NAME WON BY X RUNS/WICKETS"
            const resultMatch = block.match(/([A-Z\s]+)\s+WON BY\s+(\d+)\s+(RUNS|WICKETS?)/i);
            if (!resultMatch) continue;

            const winningTeam = resultMatch[1].trim();
            const margin = resultMatch[0];

            // Determine if Old Imperials won or lost
            const isOICCMatch = block.includes('Old Imperials');
            const oiccWon = winningTeam.toLowerCase().includes('old imperials');
            const result = oiccWon ? 'won' : 'lost';

            // Extract team names and scores
            // Pattern: "Team Name\n123 / 4 (20)"
            const scorePattern = /([^\n]+)\n(\d+)\s*\/\s*(\d+|All out)\s*\(([^)]+)\)/g;
            const scores = [...block.matchAll(scorePattern)];

            if (scores.length >= 2) {
                const team1 = scores[0][1].trim();
                const team1Score = `${scores[0][2]}/${scores[0][3]} (${scores[0][4]})`;

                const team2 = scores[1][1].trim();
                const team2Score = `${scores[1][2]}/${scores[1][3]} (${scores[1][4]})`;

                // Determine which team is Old Imperials
                let homeTeam, homeScore, awayTeam, awayScore;

                if (team1.includes('Old Imperials')) {
                    homeTeam = 'Old Imperials CC';
                    homeScore = team1Score;
                    awayTeam = team2;
                    awayScore = team2Score;
                } else {
                    homeTeam = team2.includes('Old Imperials') ? 'Old Imperials CC' : team2;
                    homeScore = team2Score;
                    awayTeam = team1;
                    awayScore = team1Score;
                }

                // Determine match type from team name
                let matchType = 'League';
                if (team1.includes('Twenty20') || team2.includes('Twenty20')) {
                    matchType = 'T20';
                } else if (team1.includes('Sunday') || team2.includes('Sunday')) {
                    matchType = 'League';
                }

                results.push({
                    date: new Date(isoDate).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                    }),
                    homeTeam: homeTeam,
                    homeScore: homeScore,
                    awayTeam: awayTeam,
                    awayScore: awayScore,
                    result: result,
                    venue: 'TBC', // Not in the text format
                    type: matchType,
                    margin: margin
                });
            }
        } catch (error) {
            console.error('Error parsing match block:', error);
            continue;
        }
    }

    return results;
}

/**
 * Parse fixtures from HTML
 * Note: Fixtures might be in a different format than results
 */
function parseFixtures(htmlText) {
    const fixtures = [];

    // Look for upcoming match patterns
    // This might need adjustment based on how PlayCricket shows future matches
    const fixturePattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}\s+\w+\s+\d{4}/g;
    const dates = [...htmlText.matchAll(fixturePattern)];

    // For now, return empty - we'll add fixture parsing once we see the format
    // You can manually add fixtures using the simple-manual-scraper.js

    return fixtures;
}

/**
 * Main scraper function
 */
async function scrapePlayCricket() {
    try {
        console.log('🏏 Fetching data from PlayCricket...');
        const html = await fetchPlayCricketHTML();

        // Get the text content (similar to what you did in console)
        const htmlText = html;

        console.log('📊 Parsing results...');
        const results = parseResults(htmlText);

        console.log('📅 Parsing fixtures...');
        const fixtures = parseFixtures(htmlText);

        // Save to JSON files
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        const timestamp = new Date().toISOString();

        fs.writeFileSync(
            path.join(OUTPUT_DIR, 'results.json'),
            JSON.stringify({ results, lastUpdated: timestamp }, null, 2)
        );

        console.log(`\n✅ Success!`);
        console.log(`   📋 Scraped ${results.length} results`);
        console.log(`   📅 Scraped ${fixtures.length} fixtures`);
        console.log(`   🕐 Last updated: ${new Date(timestamp).toLocaleString()}`);
        console.log(`\n💾 Files saved:`);
        console.log(`   - data/results.json`);

        // If no fixtures found, remind about manual entry
        if (fixtures.length === 0) {
            console.log(`\n📝 Note: No upcoming fixtures found in HTML.`);
            console.log(`   Use scraper/simple-manual-scraper.js to add fixtures manually.`);
        }

        return { fixtures, results };

    } catch (error) {
        console.error('❌ Error scraping PlayCricket:', error);
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    scrapePlayCricket()
        .then(() => {
            console.log('\n✨ Scraping complete!');
            console.log('📤 Now run: git add ../data/*.json && git commit -m "Update results" && git push');
        })
        .catch(err => {
            console.error('\n💥 Scraping failed:', err.message);
            process.exit(1);
        });
}

module.exports = { scrapePlayCricket, parseResults, parseFixtures };
