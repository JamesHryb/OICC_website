# Old Imperials Cricket Club Website

Official website for Old Imperials Cricket Club - the premier alumni cricket team for Imperial College London.

## 🏏 About

Old Imperials Cricket Club (OICC) was established in 1924 and represents the Imperial College London alumni community. Our website showcases our rich heritage, current squad, fixtures, results, and provides information for prospective members.

## 🎨 Design

The website features a modern, responsive design built with:
- **Color Scheme**: Royal Blue (#003F87), Gold (#FFD700), and Deep Red (#C8102E) - inspired by our club crest
- **Typography**: Merriweather (serif) for headings, Montserrat (sans-serif) for body text
- **Mobile-First**: Fully responsive design that works on all devices

## 📁 Project Structure

```
OICC/
├── index.html              # Home page
├── css/
│   └── style.css          # Main stylesheet
├── js/
│   └── script.js          # JavaScript functionality
├── images/
│   └── crest.png          # Club crest
├── pages/
│   ├── about.html         # Club history and values
│   ├── fixtures.html      # Fixtures & results
│   ├── squad.html         # Current squad
│   ├── news.html          # News & match reports
│   ├── gallery.html       # Photo gallery
│   ├── join.html          # Membership information
│   └── contact.html       # Contact form
└── data/
    └── squad.json         # Squad data
```

## ✨ Features

### Current Features
- ✅ Responsive navigation with mobile menu
- ✅ Hero section with club crest
- ✅ Upcoming fixtures display
- ✅ Recent results with expandable scorecards
- ✅ Squad profiles
- ✅ Membership application form
- ✅ Contact form with map
- ✅ Photo gallery with lightbox
- ✅ News and match reports
- ✅ Achton Villa (5-a-side football) section

### Planned Features
- 🔄 Live PlayCricket API integration
- 🔄 CMS for easy content updates
- 🔄 Real player photos and match images
- 🔄 Member login area
- 🔄 Online payment integration
- 🔄 Social media feed integration

## 🚀 Getting Started

### Prerequisites
- A modern web browser
- A web server (for local development)

### Local Development

1. Clone this repository:
```bash
git clone https://github.com/JamesHryb/OICC_website.git
cd OICC_website
```

2. Open with a local server:
```bash
# Using Python 3
python -m http.server 8000

# Using PHP
php -S localhost:8000

# Using Node.js (http-server)
npx http-server
```

3. Open your browser and navigate to `http://localhost:8000`

### Deployment

The website is static HTML/CSS/JS and can be deployed to:
- **GitHub Pages** (recommended for free hosting)
- **Netlify**
- **Vercel**
- Any web hosting service

#### GitHub Pages Deployment

1. Push to GitHub (already done)
2. Go to repository Settings > Pages
3. Select source branch (main)
4. Select folder (root)
5. Save and wait for deployment

Your site will be available at: `https://jameshryb.github.io/OICC_website/`

## 📝 Content Management

### Adding News Articles
Edit `pages/news.html` and add a new article card following the existing format.

### Updating Fixtures
Edit `pages/fixtures.html` to add new fixtures or results.

### Managing Squad
Update `data/squad.json` with player information.

### Changing Images
- Replace placeholder images in `images/` folder
- Update image paths in HTML files
- Recommended image sizes:
  - Hero images: 1920x1080px
  - Player photos: 400x400px
  - Gallery photos: 800x600px
  - News thumbnails: 400x250px

## 🎨 Customization

### Colors
Edit CSS variables in `css/style.css`:
```css
:root {
    --primary-blue: #003F87;
    --gold: #FFD700;
    --deep-red: #C8102E;
}
```

### Fonts
Current fonts are loaded from Google Fonts. To change:
1. Update the `<link>` tag in HTML files
2. Update font variables in CSS

## 📊 PlayCricket Integration

The website includes placeholders for PlayCricket integration. To implement:

1. Obtain API credentials from Play-Cricket
2. Update `js/script.js` with API endpoints
3. Parse and display data in fixtures/results pages

Example structure is provided in the `fetchPlayCricketData()` function.

## 🤝 Contributing

This is a private club website. For changes or updates:
1. Contact the club committee
2. Create a branch for your changes
3. Submit a pull request for review

## 📧 Contact

**Old Imperials Cricket Club**
- Email: info@oldimperials.cc
- Location: Battersea Park, London
- Play-Cricket: https://oldimperials.play-cricket.com/home

## 📄 License

© 2026 Old Imperials Cricket Club. All rights reserved.

## 🙏 Acknowledgments

- Imperial College London for our proud heritage
- All OICC members past and present
- Achton Villa FC for keeping us fit off the cricket field

---

**SCIENTIA IMPERII DECUS ET TUTAMEN**
*Knowledge is the ornament and protection of the Empire*
