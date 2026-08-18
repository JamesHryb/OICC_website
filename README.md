# Old Imperials Cricket Club Website

Official website for Old Imperials Cricket Club — the alumni cricket team for Imperial College London.

Live site: **https://jameshryb.github.io/OICC_website/**

## About

Old Imperials Cricket Club (OICC) was founded in 2023 and represents the Imperial College London alumni community. The website covers the squad, fixtures and results, news and match reports, kit shop, and contact information.

## Tech Stack

Static HTML/CSS/JS — no framework, no build step. Data is loaded from JSON files in `/data/` at runtime.

- **Fonts**: Merriweather (headings) + Montserrat (body) via Google Fonts
- **Colours**: Navy Blue `#003F87`, Gold `#FFD700`
- **Data scraping**: Python scripts using the `pyplaycricket` library, run via GitHub Actions daily

## Project Structure

```
├── index.html                  # Home page
├── css/
│   └── style.css               # Main stylesheet
├── js/
│   ├── script.js               # Shared navigation/UI
│   ├── home-page.js            # Home page dynamic content
│   ├── fixtures-page.js        # Fixtures & results loader
│   ├── squad-page.js           # Squad card renderer
│   ├── news-loader.js          # News/articles loader
│   └── super-sixes-page.js     # Imperial Super Sixes page renderer
├── images/
│   └── crest.png               # Club crest
├── pages/
│   ├── about.html
│   ├── fixtures.html
│   ├── squad.html
│   ├── super-sixes.html        # Imperial Super Sixes tournament page
│   ├── faq.html
│   ├── news.html
│   ├── gallery.html
│   ├── shop.html
│   ├── join.html
│   └── contact.html
├── data/
│   ├── squad.csv               # Squad roster (source of truth)
│   ├── fixtures.json           # Upcoming fixtures (auto-updated)
│   ├── results.json            # Past results (auto-updated)
│   ├── stats.json              # Player statistics (auto-updated)
│   ├── achton_villa.json       # Achton Villa 5-a-side data
│   └── super_sixes.json        # Imperial Super Sixes data (auto-updated)
├── articles/                   # Match reports and news (JSON)
├── scraper/
│   ├── oicc_playcricket.py     # PlayCricket data scraper
│   ├── super_sixes_manual.py   # Super Sixes spreadsheet → JSON pipeline
│   ├── sample_data/            # Local sample CSVs for offline testing
│   ├── templates/              # Starter spreadsheet for scorers
│   └── SUPER_SIXES_GUIDE.md    # Setup guide + scoring instructions
├── .github/workflows/
│   ├── deploy.yml                    # GitHub Pages deployment
│   ├── update-playcricket-data.yml   # Daily data scrape
│   └── update-super-sixes.yml        # Super Sixes data refresh (23 Aug)
└── run_scrapers.py             # Local scraper runner
```

## Local Development

Requires a local server (not just opening the HTML file) because the JS fetches JSON data files.

```bash
git clone https://github.com/JamesHryb/OICC_website.git
cd OICC_website
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Content Updates

### Squad
Edit `data/squad.csv`. Columns: `name, committeeRole, cricketRole, dob, yearGraduated, degree, funFact, quote, isCaptain`.

### Fixtures & Results
Updated automatically each day via GitHub Actions (scraping PlayCricket). Can also be edited manually in `data/fixtures.json` and `data/results.json`.

### News & Match Reports
Add a new JSON file to `articles/`. The news page loads all articles in that folder automatically.

### Gallery
Add images to `images/gallery/` and reference them in `pages/gallery.html`.

## Deployment

The site is deployed automatically to GitHub Pages on every push to `main`. The live URL is:

**https://jameshryb.github.io/OICC_website/**

## Contact

- Email: oldimperialscc@gmail.com
- Twitter/X: [@OldImperialsCC](https://x.com/OldImperialsCC)
- Instagram: [@oldimperials](https://www.instagram.com/oldimperials)
- Play-Cricket: https://oldimperials.play-cricket.com/home
- Location: Battersea Park, London

---

© 2026 Old Imperials Cricket Club. All rights reserved.
