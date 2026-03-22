(function () {
    'use strict';

    const isNewsPage = !!document.getElementById('news-grid');

    function formatDate(isoDate) {
        const [y, m, d] = isoDate.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function placeholderFor(category, large) {
        const c = category.toLowerCase();
        const size = large ? '800x500' : '400x250';
        if (c.includes('achton')) return `https://placehold.co/${size}/DC143C/FFD700?text=Achton+Villa`;
        if (c.includes('match')) return `https://placehold.co/${size}/003F87/FFD700?text=Match+Report`;
        return `https://placehold.co/${size}/003F87/FFD700?text=Club+News`;
    }

    function cardHtml(article, basePath) {
        const imgSrc = article.image ? basePath + article.image : placeholderFor(article.category, false);
        return `
            <article class="news-card">
                <div class="news-image">
                    <img src="${imgSrc}" alt="${article.title}">
                    <span class="news-category">${article.category}</span>
                </div>
                <div class="news-content">
                    <span class="news-date">${formatDate(article.date)}</span>
                    <h3 class="news-title">${article.title}</h3>
                    <p class="news-excerpt">${article.excerpt}</p>
                    <a href="#" class="news-link article-read-more"
                       data-file="${article.file}"
                       data-title="${article.title}"
                       data-category="${article.category}"
                       data-date="${article.date}"
                       data-author="${article.author}">Read more →</a>
                </div>
            </article>`;
    }

    // Strip header lines from raw article text and return only the body
    function extractBody(raw) {
        const headerKeys = new Set(['title', 'category', 'author', 'date', 'image', 'excerpt']);
        const lines = raw.split('\n');
        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();
            if (line === '') { i++; break; }
            const colon = line.indexOf(':');
            if (colon > 0 && headerKeys.has(line.slice(0, colon).toLowerCase())) {
                i++;
            } else {
                break; // first non-header line — body starts here
            }
        }
        return lines.slice(i).join('\n').trim();
    }

    function bodyToHtml(text) {
        return text.split(/\n{2,}/)
            .filter(p => p.trim())
            .map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
            .join('');
    }

    // ── Modal ──────────────────────────────────────────────────────────────

    function openModal(meta, rawContent) {
        document.getElementById('modal-category').textContent = meta.category;
        document.getElementById('modal-date').textContent = formatDate(meta.date);
        document.getElementById('modal-title').textContent = meta.title;
        document.getElementById('modal-author').textContent = meta.author ? 'By ' + meta.author : '';
        document.getElementById('modal-body').innerHTML = bodyToHtml(extractBody(rawContent));
        const modal = document.getElementById('article-modal');
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        document.getElementById('article-modal').classList.remove('active');
        document.body.style.overflow = '';
    }

    // ── News page ──────────────────────────────────────────────────────────

    async function initNewsPage() {
        const grid = document.getElementById('news-grid');
        const modal = document.getElementById('article-modal');

        document.getElementById('modal-close').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

        try {
            const articles = await fetch('../articles/index.json').then(r => r.json());

            if (!articles.length) {
                grid.innerHTML = '<p class="no-articles">No articles yet — check back soon!</p>';
                return;
            }

            grid.innerHTML = articles.map(a => cardHtml(a, '../')).join('');

            grid.addEventListener('click', async e => {
                const link = e.target.closest('.article-read-more');
                if (!link) return;
                e.preventDefault();
                const raw = await fetch('../articles/' + link.dataset.file).then(r => r.text());
                openModal(link.dataset, raw);
            });
        } catch {
            grid.innerHTML = '<p class="no-articles">Could not load articles.</p>';
        }
    }

    // ── Home page ──────────────────────────────────────────────────────────

    async function initHomePage() {
        const grid = document.getElementById('home-news-grid');
        const section = grid.closest('.news-section');

        try {
            const articles = await fetch('articles/index.json').then(r => r.json());

            if (!articles.length) {
                section.style.display = 'none';
                return;
            }

            // Populate featured article with the most recent entry
            const latest = articles[0];
            document.getElementById('featured-img').src = latest.image
                ? latest.image
                : placeholderFor(latest.category, true);
            document.getElementById('featured-category').textContent = latest.category;
            document.getElementById('featured-date').textContent = formatDate(latest.date);
            document.getElementById('featured-title').textContent = latest.title;
            document.getElementById('featured-excerpt').textContent = latest.excerpt;

            grid.innerHTML = articles.slice(0, 3).map(a => cardHtml(a, '')).join('');

            // Home page "Read more" → navigate to news page
            grid.querySelectorAll('.article-read-more').forEach(link => {
                link.href = 'pages/news.html';
            });
        } catch {
            section.style.display = 'none';
        }
    }

    // ── Boot ──────────────────────────────────────────────────────────────

    if (isNewsPage) {
        initNewsPage();
    } else if (document.getElementById('home-news-grid')) {
        initHomePage();
    }
})();
