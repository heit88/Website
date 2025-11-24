// Common JavaScript utilities for MOTOVICTUS website

// Load header and footer HTML
async function loadHTML(id, url) {
  const container = document.getElementById(id);
  const resp = await fetch(url);
  const html = await resp.text();
  container.innerHTML = html;
  container.classList.remove('invisible');
}

// Initialize mobile menu toggle
function initMobileMenu() {
  const menuBtn = document.getElementById('menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
      mobileMenu.classList.toggle('flex');
    });
  }
}

// Initialize page with header and footer
function initPage() {
  loadHTML('header', 'header.html').then(() => {
    initMobileMenu();
  });
  loadHTML('footer', 'footer.html');
}

// Add fade-in animation on scroll
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in-visible');
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  document.querySelectorAll('.fade-in-on-scroll').forEach(el => {
    observer.observe(el);
  });
}

// Smooth scroll to anchor links
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href !== '#' && href.length > 1) {
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
}

// Initialize common features when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  initSmoothScroll();
});
