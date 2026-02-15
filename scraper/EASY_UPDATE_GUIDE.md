# 📝 Easy Update Guide - Manual Method

Can't get the scraper working? No problem! Here's the **easiest way** to keep your fixtures and results updated.

## 🎯 Quick Method (5 minutes)

### Option 1: Edit JSON Files Directly

**This is the simplest approach - no coding required!**

1. **Open** `data/fixtures.json` in any text editor
2. **Copy the format** of an existing fixture
3. **Add your new fixture** with the correct dates and teams
4. **Save the file**
5. **Commit and push** to GitHub

**Example:**
```json
{
  "fixtures": [
    {
      "date": "2026-02-22",
      "homeTeam": "Old Imperials CC",
      "awayTeam": "Your Opponent Here",
      "venue": "Battersea Park",
      "time": "1:00 PM",
      "type": "League"
    }
  ],
  "lastUpdated": "2026-02-15T18:30:00Z"
}
```

**That's it!** Your website will automatically show the new data.

---

### Option 2: Use the Simple Manual Scraper

**For those comfortable with minimal coding:**

1. **Open** `scraper/simple-manual-scraper.js`

2. **Edit the fixtures array:**
   ```javascript
   const fixtures = [
       {
           date: "2026-02-22",
           homeTeam: "Old Imperials CC",
           awayTeam: "Opponent Name",
           venue: "Ground Name",
           time: "1:00 PM",
           type: "League"
       },
       // Add more here...
   ];
   ```

3. **Edit the results array:**
   ```javascript
   const results = [
       {
           date: "12 February 2026",
           homeTeam: "Old Imperials CC",
           homeScore: "247/7 (40 overs)",
           awayTeam: "Opponent",
           awayScore: "244/10 (39.4 overs)",
           result: "won",
           venue: "Ground",
           type: "League"
       },
       // Add more here...
   ];
   ```

4. **Run the script:**
   ```bash
   cd scraper
   node simple-manual-scraper.js
   ```

5. **Commit and push:**
   ```bash
   git add ../data/*.json
   git commit -m "Update fixtures and results"
   git push
   ```

---

## 📅 Weekly Update Workflow

**Every Monday morning (or after a match):**

### Update Fixtures:
1. Visit https://oldimperials.play-cricket.com/home
2. Copy upcoming fixture details
3. Add to `data/fixtures.json`
4. Commit & push

### Update Results:
1. Get match results from PlayCricket
2. Add to `data/results.json`
3. Commit & push

**Time: 5-10 minutes per week**

---

## 🎨 Data Format Reference

### Fixtures
```json
{
  "date": "2026-03-15",              // YYYY-MM-DD format
  "homeTeam": "Old Imperials CC",     // Always "Old Imperials CC" for home
  "awayTeam": "Opponent CC",          // Opposition team name
  "venue": "Battersea Park",          // Ground name
  "time": "2:00 PM",                  // Match start time
  "type": "League"                    // League, Cup, or Friendly
}
```

### Results
```json
{
  "date": "15 March 2026",            // Human-readable format
  "homeTeam": "Old Imperials CC",
  "homeScore": "247/7 (40 overs)",    // Runs/Wickets (Overs)
  "awayTeam": "Opponent CC",
  "awayScore": "244/10 (39.4 overs)",
  "result": "won",                    // won, lost, or tie
  "venue": "Battersea Park",
  "type": "League",
  "margin": "Won by 3 wickets",       // Optional - description
  "potm": "J. Henderson (78*)"        // Optional - Player of Match
}
```

---

## 🔄 Git Commands Cheat Sheet

```bash
# Navigate to project
cd OICC

# Check what changed
git status

# Add updated files
git add data/fixtures.json data/results.json

# Commit with message
git commit -m "Update fixtures and results for week of Feb 15"

# Push to GitHub
git push

# Done! Website updates automatically
```

---

## ✨ Tips

### Copy from PlayCricket Efficiently

1. **Open PlayCricket page side-by-side** with your JSON file
2. **Copy team names exactly** as they appear
3. **Use consistent date format** (YYYY-MM-DD for fixtures)
4. **Don't forget the comma** after each entry (except the last one)

### Date Format Examples

**Fixtures** (machine-readable):
- `"2026-02-22"` ✅
- `"22 Feb 2026"` ❌
- `"2026-02-22T13:00:00Z"` ✅ (with time)

**Results** (human-readable):
- `"22 February 2026"` ✅
- `"Feb 22, 2026"` ✅
- `"2026-02-22"` ✅ (also works)

### Avoid JSON Errors

Common mistakes:
```json
{
  "fixtures": [
    {
      "date": "2026-02-22",
      "team": "Opponent"
    }, // ✅ Comma here
    {
      "date": "2026-02-23",
      "team": "Another"
    }  // ❌ No comma on last item
  ]
}
```

**Validate your JSON**: Use https://jsonlint.com/ to check for errors.

---

## 🚀 Advantages of Manual Updates

- ✅ **Simple** - No scraping complexity
- ✅ **Fast** - 5-10 minutes per week
- ✅ **Reliable** - Never breaks
- ✅ **Full control** - Choose exactly what to display
- ✅ **No dependencies** - Works without Node.js on production

---

## 📊 When to Use Automatic Scraping

Consider automatic scraping if:
- You play 3+ matches per week
- You want real-time updates
- You have someone technical on the team
- You update fixtures very frequently

Otherwise, **manual updates are perfectly fine!**

---

## Need Help?

### JSON Validation Error?
- Use https://jsonlint.com/ to find the issue
- Check for missing commas or quotes
- Make sure dates are in quotes: `"2026-02-22"`

### Git Push Error?
- Make sure you committed first: `git commit -m "message"`
- Check you're in the OICC directory: `cd OICC`

### Data Not Showing on Website?
- Clear browser cache (Ctrl+Shift+R)
- Check the JSON file was pushed to GitHub
- Wait 1-2 minutes for GitHub Pages to update

---

**Remember**: Simple is better than broken! Manual updates work great for most club websites. 🏏
