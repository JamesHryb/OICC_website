/**
 * Simple Manual PlayCricket Data Entry
 *
 * This is a simpler alternative to web scraping.
 * Just manually enter your fixtures and results in this file,
 * then run it to generate the JSON files.
 *
 * Perfect if:
 * - You only update fixtures weekly
 * - The HTML scraping is too complex
 * - You want full control over the data
 */

const fs = require('fs');
const path = require('path');

// ===================================
// EDIT YOUR FIXTURES HERE
// ===================================
const fixtures = [
    {
        date: "2026-02-22",           // Format: YYYY-MM-DD
        homeTeam: "Old Imperials CC",
        awayTeam: "London Business School CC",
        venue: "Battersea Park",
        time: "1:00 PM",
        type: "Friendly"              // League, Cup, or Friendly
    },
    {
        date: "2026-02-23",
        homeTeam: "Old Imperials CC",
        awayTeam: "UCL Alumni CC",
        venue: "Regent's Park",
        time: "11:00 AM",
        type: "League"
    },
    // Add more fixtures here...
];

// ===================================
// EDIT YOUR RESULTS HERE
// ===================================
const results = [
    {
        date: "12 February 2026",
        homeTeam: "Old Imperials CC",
        homeScore: "247/7 (40 overs)",
        awayTeam: "Oxford Alumni CC",
        awayScore: "244/10 (39.4 overs)",
        result: "won",                 // won, lost, or tie
        venue: "Battersea Park",
        type: "League",
        margin: "Won by 3 wickets",    // Optional
        potm: "J. Henderson (78*)"     // Optional - Player of the Match
    },
    {
        date: "5 February 2026",
        homeTeam: "Old Imperials CC",
        homeScore: "168/10 (35.2 overs)",
        awayTeam: "LSE Alumni CC",
        awayScore: "172/6 (36.5 overs)",
        result: "lost",
        venue: "Regent's Park",
        type: "Friendly",
        margin: "Lost by 4 wickets",
        potm: "S. Mitchell (62)"
    },
    // Add more results here...
];

// ===================================
// HELPER: Copy from PlayCricket
// ===================================
/**
 * Quick copy-paste format from PlayCricket:
 *
 * 1. Visit: https://oldimperials.play-cricket.com/home
 * 2. Copy a fixture/result text
 * 3. Paste here and fill in the object manually
 *
 * Example from PlayCricket:
 * "AUG SUNDAY 9th, 13:00, Old Imperials vs Opponent, Venue Name"
 *
 * Becomes:
 * {
 *   date: "2026-08-09",
 *   homeTeam: "Old Imperials CC",
 *   awayTeam: "Opponent",
 *   venue: "Venue Name",
 *   time: "1:00 PM",
 *   type: "League"
 * }
 */

// ===================================
// SCRIPT - DON'T EDIT BELOW
// ===================================
const OUTPUT_DIR = path.join(__dirname, '../data');

function saveData() {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString();

    // Save fixtures
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'fixtures.json'),
        JSON.stringify({ fixtures, lastUpdated: timestamp }, null, 2)
    );

    // Save results
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'results.json'),
        JSON.stringify({ results, lastUpdated: timestamp }, null, 2)
    );

    console.log('✓ Data saved successfully!');
    console.log(`  - ${fixtures.length} fixtures`);
    console.log(`  - ${results.length} results`);
    console.log(`  - Last updated: ${new Date(timestamp).toLocaleString()}`);
    console.log('\nFiles updated:');
    console.log('  - data/fixtures.json');
    console.log('  - data/results.json');
}

// Run if executed directly
if (require.main === module) {
    saveData();
}

module.exports = { fixtures, results, saveData };
