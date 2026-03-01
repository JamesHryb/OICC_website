/**
 * Test the scraper with sample data
 * This lets you test the parser without hitting PlayCricket
 */

const { parseResults } = require('./playcricket-scraper-custom');

// Sample data from your screenshot
const sampleData = `
assignment
Saturday 16 August 2025

GROSUPLЈЕ CRICKET CLUB WON BY 37 RUNS

Grosuplje Cricket Club
169 / 6 (20)

Vs

Old Imperials CC - Twenty20
132 / All out (20)
`;

console.log('🧪 Testing scraper with sample data...\n');

const results = parseResults(sampleData);

console.log('📊 Parsed results:');
console.log(JSON.stringify(results, null, 2));

if (results.length > 0) {
    console.log('\n✅ Parser working correctly!');
    console.log('   You can now run the full scraper with:');
    console.log('   node playcricket-scraper-custom.js');
} else {
    console.log('\n❌ Parser failed - no results found');
}
