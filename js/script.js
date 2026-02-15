// ========================================
// OICC Website - Main JavaScript
// ========================================

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {

    // === Mobile Menu Toggle ===
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navMenu = document.getElementById('navMenu');

    if (mobileMenuToggle && navMenu) {
        mobileMenuToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            navMenu.classList.toggle('active');
            document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
        });

        // Close menu when clicking on a link
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                mobileMenuToggle.classList.remove('active');
                navMenu.classList.remove('active');
                document.body.style.overflow = '';
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            const isClickInsideNav = navMenu.contains(event.target);
            const isClickOnToggle = mobileMenuToggle.contains(event.target);

            if (!isClickInsideNav && !isClickOnToggle && navMenu.classList.contains('active')) {
                mobileMenuToggle.classList.remove('active');
                navMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // === Navbar Scroll Effect ===
    const navbar = document.getElementById('navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    });

    // === Smooth Scroll for Anchor Links ===
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href !== '#!') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // === Intersection Observer for Fade-in Animations ===
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe elements for fade-in effect
    const animatedElements = document.querySelectorAll('.stat-card, .fixture-card, .news-card, .article-card');
    animatedElements.forEach(el => {
        observer.observe(el);
    });

    // === Active Navigation Link Based on Current Page ===
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinksAll = document.querySelectorAll('.nav-link');

    navLinksAll.forEach(link => {
        const linkPage = link.getAttribute('href').split('/').pop();
        if (linkPage === currentPage) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // === Form Validation (for contact/join forms) ===
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            const requiredFields = form.querySelectorAll('[required]');
            let isValid = true;

            requiredFields.forEach(field => {
                if (!field.value.trim()) {
                    isValid = false;
                    field.classList.add('error');

                    // Remove error class on input
                    field.addEventListener('input', function() {
                        this.classList.remove('error');
                    }, { once: true });
                }
            });

            if (!isValid) {
                e.preventDefault();
                showNotification('Please fill in all required fields', 'error');
            }
        });
    });

    // === Notification System ===
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: ${type === 'error' ? '#C8102E' : '#003F87'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            animation: slideInRight 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // === Image Lazy Loading ===
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
            }
        });
    });

    images.forEach(img => imageObserver.observe(img));

    // === Stats Counter Animation ===
    function animateCounter(element, target, duration = 2000) {
        const start = 0;
        const increment = target / (duration / 16);
        let current = start;

        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                element.textContent = target;
                clearInterval(timer);
            } else {
                element.textContent = Math.floor(current);
            }
        }, 16);
    }

    // Animate stat numbers when visible
    const statNumbers = document.querySelectorAll('.stat-number');
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const value = parseInt(target.textContent);
                if (!isNaN(value)) {
                    animateCounter(target, value);
                }
                statsObserver.unobserve(target);
            }
        });
    }, { threshold: 0.5 });

    statNumbers.forEach(num => statsObserver.observe(num));

    // === Back to Top Button ===
    const backToTopButton = document.createElement('button');
    backToTopButton.innerHTML = '↑';
    backToTopButton.className = 'back-to-top';
    backToTopButton.setAttribute('aria-label', 'Back to top');
    backToTopButton.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 50px;
        height: 50px;
        background: linear-gradient(135deg, #003F87, #FFD700);
        color: white;
        border: none;
        border-radius: 50%;
        font-size: 1.5rem;
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        z-index: 1000;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    `;

    document.body.appendChild(backToTopButton);

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTopButton.style.opacity = '1';
            backToTopButton.style.visibility = 'visible';
        } else {
            backToTopButton.style.opacity = '0';
            backToTopButton.style.visibility = 'hidden';
        }
    });

    backToTopButton.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    backToTopButton.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-5px)';
    });

    backToTopButton.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
    });

});

// === Filter/Search Functionality (for fixtures, squad, etc.) ===
function filterItems(searchTerm, items, searchFields) {
    items.forEach(item => {
        let matchFound = false;

        searchFields.forEach(field => {
            const element = item.querySelector(field);
            if (element && element.textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
                matchFound = true;
            }
        });

        item.style.display = matchFound ? '' : 'none';
    });
}

// === PlayCricket Data Integration (Placeholder) ===
async function fetchPlayCricketData() {
    // This is a placeholder for future PlayCricket API integration
    // For now, return mock data
    console.log('PlayCricket integration ready for implementation');

    // When implementing, you'll need to:
    // 1. Get API credentials from PlayCricket
    // 2. Make requests to their API endpoints
    // 3. Parse and display the data

    // Example structure:
    /*
    try {
        const response = await fetch('API_ENDPOINT_HERE');
        const data = await response.json();
        displayFixtures(data.fixtures);
        displayResults(data.results);
    } catch (error) {
        console.error('Error fetching PlayCricket data:', error);
    }
    */
}

// === Gallery Lightbox ===
function initGalleryLightbox() {
    const galleryImages = document.querySelectorAll('.gallery-image');

    galleryImages.forEach(img => {
        img.addEventListener('click', function() {
            const lightbox = document.createElement('div');
            lightbox.className = 'lightbox';
            lightbox.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                cursor: pointer;
            `;

            const lightboxImg = document.createElement('img');
            lightboxImg.src = this.src;
            lightboxImg.style.cssText = `
                max-width: 90%;
                max-height: 90%;
                object-fit: contain;
            `;

            lightbox.appendChild(lightboxImg);
            document.body.appendChild(lightbox);

            lightbox.addEventListener('click', function() {
                document.body.removeChild(lightbox);
            });

            // Close on Escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && document.querySelector('.lightbox')) {
                    document.body.removeChild(document.querySelector('.lightbox'));
                }
            });
        });
    });
}

// Initialize gallery if gallery images exist
if (document.querySelector('.gallery-image')) {
    initGalleryLightbox();
}

// === Add animations CSS ===
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    .fade-in {
        animation: fadeInUp 0.6s ease-out;
    }

    .back-to-top:hover {
        transform: translateY(-5px) !important;
        box-shadow: 0 6px 15px rgba(0, 0, 0, 0.3) !important;
    }

    .error {
        border-color: #C8102E !important;
        animation: shake 0.3s;
    }

    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }
`;
document.head.appendChild(style);
