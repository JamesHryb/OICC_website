# 🏏 PlayCricket Integration Setup Guide

This guide will help you integrate live data from your PlayCricket page into your OICC website.

## ✅ Quick Start (Recommended for GitHub Pages)

### Step 1: Inspect PlayCricket Page Structure

1. **Visit your PlayCricket page**:
   ```
   https://oldimperials.play-cricket.com/home
   ```

2. **Open browser developer tools** (F12 or Right-click → Inspect)

3. **Find fixture/result elements**:
   - Look for divs or tables containing matches
   - Note the class names (e.g., `class="fixture-row"`, `class="match-result"`)
   - Look at the HTML structure

4. **Example of what you're looking for**:
   ```html
   <div class="fixture">
     <span class="date">22 Feb 2026</span>
     <span class="team-home">Old Imperials</span>
     <span class="team-away">Opponent CC</span>
     ...
   </div>
   ```

### Step 2: Update the Scraper

1. **Open** `scraper/playcricket-scraper.js`

2. **Update the regex patterns** based on what you found:
   ```javascript
   // Example: If fixtures are in <div class="match-fixture">
   const fixturePattern = /<div class="match-fixture[^>]*>(.*?)<\/div>/gs;

   // Update team extraction pattern
   const homeTeamMatch = fixtureHTML.match(/class="home-team[^>]*>([^<]+)/);
   const awayTeamMatch = fixtureHTML.match(/class="away-team[^>]*>([^<]+)/);
   ```

3. **Test locally**:
   ```bash
   cd scraper
   node playcricket-scraper.js
   ```

4. **Check output** in `data/fixtures.json` and `data/results.json`

### Step 3: Enable GitHub Actions

1. **Push the scraper files** to GitHub:
   ```bash
   git add .
   git commit -m "Add PlayCricket scraper and automation"
   git push
   ```

2. **Enable GitHub Actions**:
   - Go to: https://github.com/JamesHryb/OICC_website/settings/actions
   - Under "Actions permissions", select "Allow all actions"
   - Save

3. **Manually trigger first run**:
   - Go to: https://github.com/JamesHryb/OICC_website/actions
   - Click "Update PlayCricket Data" workflow
   - Click "Run workflow" → "Run workflow"

4. **Check for errors**:
   - Click on the running workflow
   - View logs to see if scraping succeeded
   - If errors occur, update the scraper patterns and retry

### Step 4: Automatic Updates

Once working, the scraper will automatically run daily at 6 AM UTC, keeping your fixtures and results up to date!

---

## 🚀 Alternative: Manual HTML Inspection Method

If the scraper is complex, you can manually inspect and create JSON:

1. **Visit PlayCricket page**
2. **Copy fixture/result data**
3. **Update `data/fixtures.json` and `data/results.json` manually**
4. **Commit and push changes**

This works well if you only need to update weekly.

---

## 🔧 Testing the Integration

### Test Locally

1. **Start a local server** (required to avoid CORS issues):
   ```bash
   # Using Python 3
   cd OICC
   python -m http.server 8000

   # OR using Node.js
   npx http-server
   ```

2. **Open in browser**:
   ```
   http://localhost:8000/pages/fixtures.html
   ```

3. **Check browser console** (F12 → Console):
   - Should see "PlayCricket data loaded" messages
   - Check for any errors

### Test on GitHub Pages

1. **Push to GitHub** (if not already done)

2. **Enable GitHub Pages**:
   - Settings → Pages
   - Source: Deploy from branch → `main` → `/ (root)`
   - Save

3. **Visit your live site**:
   ```
   https://jameshryb.github.io/OICC_website/pages/fixtures.html
   ```

---

## 📊 Data Format Reference

### Fixtures JSON (`data/fixtures.json`)

```json
{
  "fixtures": [
    {
      "date": "2026-02-22",              // ISO date format
      "homeTeam": "Old Imperials CC",
      "awayTeam": "Opponent CC",
      "venue": "Battersea Park",
      "time": "1:00 PM",
      "type": "League"                   // League, Cup, or Friendly
    }
  ],
  "lastUpdated": "2026-02-15T18:30:00Z" // ISO timestamp
}
```

### Results JSON (`data/results.json`)

```json
{
  "results": [
    {
      "date": "12 February 2026",
      "homeTeam": "Old Imperials CC",
      "homeScore": "247/7 (40 overs)",
      "awayTeam": "Opponent CC",
      "awayScore": "244/10 (39.4 overs)",
      "result": "won",                   // won, lost, or tie
      "venue": "Battersea Park",
      "type": "League",
      "margin": "Won by 3 wickets",      // Optional
      "potm": "J. Henderson (78*)"       // Optional - Player of the Match
    }
  ],
  "lastUpdated": "2026-02-15T18:30:00Z"
}
```

---

## 🛠️ Troubleshooting

### Issue: Scraper returns empty data

**Solution**:
1. Inspect PlayCricket HTML structure has changed
2. Update regex patterns in `playcricket-scraper.js`
3. Test locally with `node playcricket-scraper.js`
4. Check output in `data/` folder

### Issue: GitHub Actions failing

**Solution**:
1. Check Actions tab for error logs
2. Ensure workflow file is in `.github/workflows/`
3. Verify Actions are enabled in repository settings
4. Check Node.js version compatibility (currently set to v18)

### Issue: Data not showing on website

**Solution**:
1. Check browser console for errors
2. Verify JSON files exist in `data/` folder
3. Ensure `playcricket-loader.js` is included in fixtures.html
4. Check file paths are correct (relative paths)

### Issue: CORS errors

**Solution**:
- Use local server (Python/Node.js) for testing, never `file://` protocol
- On production, ensure GitHub Pages is properly configured
- Data files must be in same domain as website

---

## 🎯 Advanced: Real-time Scraping with Serverless

For real-time data updates (instead of daily), deploy as a serverless function:

### Option A: Netlify

1. **Create** `netlify/functions/playcricket.js`:
   ```javascript
   const { scrapePlayCricket } = require('../../scraper/playcricket-scraper');

   exports.handler = async () => {
       const data = await scrapePlayCricket();
       return {
           statusCode: 200,
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(data)
       };
   };
   ```

2. **Deploy to Netlify**:
   - Connect GitHub repo to Netlify
   - Auto-deploys on push

3. **Call from frontend**:
   ```javascript
   fetch('/.netlify/functions/playcricket')
       .then(res => res.json())
       .then(data => console.log(data));
   ```

### Option B: Vercel

Similar to Netlify, create `api/playcricket.js` in project root.

---

## 📝 Next Steps

1. ✅ Inspect your PlayCricket page HTML
2. ✅ Update scraper regex patterns
3. ✅ Test locally
4. ✅ Enable GitHub Actions
5. ✅ Verify automatic updates work
6. ✅ Monitor for any PlayCricket structure changes

---

## 🆘 Need Help?

- **PlayCricket HTML changed?** Update the scraper patterns
- **Want real-time data?** Use Netlify/Vercel serverless functions
- **Prefer manual updates?** Just edit the JSON files directly

The scraper is flexible and can be adapted to any changes PlayCricket makes to their website!
