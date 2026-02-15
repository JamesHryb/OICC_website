# How to Inspect Your PlayCricket Page

Since PlayCricket uses dynamic JavaScript rendering, here's a step-by-step guide to find the data patterns.

## Method 1: Inspect the Rendered HTML (Easiest)

### Step 1: Open Developer Tools

1. **Visit**: https://oldimperials.play-cricket.com/home
2. **Press F12** (or Right-click → Inspect)
3. **Go to "Elements" tab** (Chrome) or "Inspector" tab (Firefox)

### Step 2: Find a Fixture

1. **On the page**, visually locate an upcoming fixture
2. **Right-click on it** → "Inspect" or "Inspect Element"
3. **Browser will highlight the HTML** for that fixture

### Step 3: Identify the Pattern

Look for patterns like:

```html
<!-- Example structure (yours may differ) -->
<div class="match-fixture">
  <div class="match-date">AUG SUNDAY 9th</div>
  <div class="match-time">13:00</div>
  <div class="teams">
    <div class="home-team">Old Imperials CC - Sunday 1st XI</div>
    <div class="away-team">Opponent Name</div>
  </div>
  <div class="venue">
    <a href="/grounds/12345">Venue Name</a>
  </div>
</div>
```

**What to note:**
- ✅ Container class name (e.g., `class="match-fixture"`)
- ✅ Date element class/structure
- ✅ Team name classes
- ✅ Venue format
- ✅ How elements are nested

### Step 4: Check a Result

Repeat the same process for a past result:

```html
<!-- Example result structure -->
<div class="match-result">
  <div class="match-date">AUG SUNDAY 31st</div>
  <div class="result-status">WON BY 6 WICKETS</div>
  <div class="teams-score">
    <div class="home">Old Imperials CC - 247/7 (40.0)</div>
    <div class="away">Opponent CC - 244/10 (39.4)</div>
  </div>
</div>
```

---

## Method 2: Check for API Calls (Better)

PlayCricket might load data via API calls, which is easier to parse!

### Step 1: Open Network Tab

1. **Press F12** → **"Network" tab**
2. **Refresh the page** (Ctrl+R or F5)
3. **Look for XHR/Fetch requests** (filter by XHR)

### Step 2: Find Match Data Requests

Look for requests to URLs like:
- `/api/fixtures`
- `/api/matches`
- `/api/results`
- Anything containing JSON data

### Step 3: Inspect the Response

1. **Click on the request**
2. **Go to "Preview" or "Response" tab**
3. **Look for JSON data** with fixtures/results

**If you find JSON data, this is MUCH better!** Example:

```json
{
  "fixtures": [
    {
      "date": "2026-08-09",
      "homeTeam": "Old Imperials CC",
      "awayTeam": "Opponent",
      "venue": "Ground Name",
      "time": "13:00"
    }
  ]
}
```

If you find this, we can scrape the API endpoint directly instead of parsing HTML!

---

## Method 3: Use PlayCricket's RSS Feed (If Available)

Some PlayCricket sites have RSS feeds:

**Try these URLs:**
- `https://oldimperials.play-cricket.com/rss`
- `https://oldimperials.play-cricket.com/feed`
- `https://oldimperials.play-cricket.com/fixtures.rss`

If any work, this is the easiest option!

---

## Method 4: Copy HTML Source

### Manual Method:

1. **Right-click on page** → "View Page Source" (Ctrl+U)
2. **Search for** (Ctrl+F):
   - Your team name: "Old Imperials"
   - A recent opponent name
   - A match date
3. **Look at surrounding HTML** to see the structure

### Example search terms:
- `Old Imperials CC`
- `match-fixture`
- `result`
- `fixture`

---

## What to Send Me

Once you've inspected the page, send me:

### Option A: HTML Structure
Copy 2-3 examples of fixture/result HTML blocks. For example:

```
Found this for fixtures:
<div class="fixture-row">...</div>

Found this for results:
<div class="result-item">...</div>
```

### Option B: API Endpoint
If you found an API call:

```
URL: https://oldimperials.play-cricket.com/api/fixtures
Response: { "data": [...] }
```

### Option C: Screenshot
Take a screenshot of:
- The HTML structure in Developer Tools (showing a fixture element)
- The Network tab showing any API calls

---

## Alternative: Use PlayCricket Widgets

PlayCricket provides embed widgets you can add directly to your site:

### Widget Method:

1. **Contact PlayCricket support** or check your club admin panel
2. **Look for "Website Integration" or "Embed Code"**
3. **Copy the embed code** they provide
4. **Add to your fixtures page**

This works immediately without scraping!

Example widget code (if available):
```html
<iframe src="https://oldimperials.play-cricket.com/widget/fixtures"
        width="100%" height="600"></iframe>
```

---

## Quick Actions for You

**Do this now:**

1. ⬜ Open https://oldimperials.play-cricket.com/home
2. ⬜ Press F12 → Network tab
3. ⬜ Refresh page and look for API calls
4. ⬜ If no API, go to Elements tab and inspect a fixture
5. ⬜ Screenshot or copy the HTML structure
6. ⬜ Share findings with me

I'll then customize the scraper exactly for your page!

---

## Need Help?

Send me:
1. Screenshot of the HTML structure, OR
2. API endpoint URL if you found one, OR
3. RSS feed URL if it exists

And I'll update the scraper for you immediately! 🏏
