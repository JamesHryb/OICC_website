# PlayCricket Data Scraper

This scraper fetches fixtures and results from the Old Imperials PlayCricket page.

## Setup Methods

### Option 1: Automatic Updates with GitHub Actions (Recommended)

The GitHub Actions workflow will automatically run daily and update your fixtures/results data.

1. **Enable GitHub Actions**:
   - Go to your repository: https://github.com/JamesHryb/OICC_website
   - Navigate to "Settings" → "Actions" → "General"
   - Enable "Allow all actions and reusable workflows"

2. **Manual Trigger** (for immediate update):
   - Go to "Actions" tab in your repository
   - Click "Update PlayCricket Data"
   - Click "Run workflow"

The workflow will automatically commit updated data to `data/fixtures.json` and `data/results.json`.

### Option 2: Manual Local Execution

1. **Install Node.js** (if not already installed):
   ```bash
   # Download from: https://nodejs.org/
   ```

2. **Run the scraper**:
   ```bash
   cd scraper
   node playcricket-scraper.js
   ```

3. **Commit the updated data**:
   ```bash
   git add ../data/fixtures.json ../data/results.json
   git commit -m "Update PlayCricket data"
   git push
   ```

### Option 3: Serverless Function (for Real-time Data)

If hosting on Netlify or Vercel, you can deploy this as a serverless function.

#### Netlify Setup:

1. Create `netlify/functions/playcricket.js`:
```javascript
const { scrapePlayCricket } = require('../../scraper/playcricket-scraper');

exports.handler = async function(event, context) {
    try {
        const data = await scrapePlayCricket();
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
```

2. Update your frontend to call: `/.netlify/functions/playcricket`

## Important: Customizing the Scraper

⚠️ **The scraper needs customization based on PlayCricket's actual HTML structure.**

### How to Inspect and Update:

1. **Open PlayCricket page** in browser:
   ```
   https://oldimperials.play-cricket.com/home
   ```

2. **Inspect the HTML** (Right-click → Inspect):
   - Find fixture elements (likely in divs or table rows)
   - Note the class names and structure
   - Look for patterns in date, team names, scores

3. **Update the regex patterns** in `playcricket-scraper.js`:
   ```javascript
   // Example: If fixtures are in <div class="match-item">
   const fixturePattern = /<div class="match-item[^>]*>(.*?)<\/div>/gs;
   ```

4. **Test locally**:
   ```bash
   node playcricket-scraper.js
   ```

5. **Check output** in `data/fixtures.json` and `data/results.json`

## Alternative: Using PlayCricket API

If you can obtain API credentials from PlayCricket/ECB:

1. **Request API access**:
   - Contact PlayCricket support
   - Request API key for your club

2. **Update scraper to use API**:
   ```javascript
   const API_KEY = process.env.PLAYCRICKET_API_KEY;
   const CLUB_ID = 'your-club-id';

   // Use official endpoints
   const fixturesUrl = `https://api.playcricket.com/v1/fixtures?club_id=${CLUB_ID}`;
   ```

## Troubleshooting

### Scraper returns empty data
- Inspect the PlayCricket HTML structure
- Update regex patterns in the scraper
- Check console logs for errors

### GitHub Actions not running
- Check Actions permissions in repository settings
- Verify workflow file is in `.github/workflows/`
- Check Actions tab for error logs

### CORS errors when fetching data
- Use GitHub Actions method (no CORS issues)
- OR deploy serverless function
- OR use a CORS proxy

## Data Format

### Fixtures (`data/fixtures.json`):
```json
{
  "fixtures": [
    {
      "date": "22 Feb 2026",
      "homeTeam": "Old Imperials CC",
      "awayTeam": "Opponent CC",
      "venue": "Battersea Park",
      "time": "1:00 PM",
      "type": "League"
    }
  ],
  "lastUpdated": "2026-02-15T10:00:00Z"
}
```

### Results (`data/results.json`):
```json
{
  "results": [
    {
      "date": "12 Feb 2026",
      "homeTeam": "Old Imperials CC",
      "homeScore": "247/7",
      "awayTeam": "Opponent CC",
      "awayScore": "244/10",
      "result": "won",
      "venue": "Battersea Park"
    }
  ],
  "lastUpdated": "2026-02-15T10:00:00Z"
}
```
