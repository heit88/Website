// Common JavaScript utilities for MOTOVICTUS website
// Header and footer are inlined directly into each page for SEO.
// Page-specific scripts (mobile menu, footer year) run inline alongside the markup.

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

// Back-compat no-op so any old <script>initPage()</script> blocks don't error.
function initPage() {}

// ---------------------------------------------------------------------------
// Shopping cart (client-side, persisted in localStorage)
// ---------------------------------------------------------------------------
// Cart item shape: { sku, name, cents, qty }. The Worker is the source of
// truth for the actual charge; name/cents here are only for on-screen display.
const MVCart = (function () {
  const KEY = 'mv_cart_v1';
  const MAX_QTY = 10;

  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  function write(cart) {
    localStorage.setItem(KEY, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent('mv-cart-changed'));
  }
  function clampQty(n) {
    n = parseInt(n, 10);
    if (!n || n < 1) n = 1;
    if (n > MAX_QTY) n = MAX_QTY;
    return n;
  }

  return {
    MAX_QTY,
    get() { return read(); },
    count() { return read().reduce((sum, i) => sum + i.qty, 0); },
    subtotalCents() { return read().reduce((sum, i) => sum + i.cents * i.qty, 0); },
    totalUnits() { return read().reduce((sum, i) => sum + i.qty, 0); },
    add(item) {
      const cart = read();
      const existing = cart.find((i) => i.sku === item.sku);
      if (existing) {
        existing.qty = clampQty(existing.qty + (item.qty || 1));
      } else {
        cart.push({ sku: item.sku, name: item.name, cents: item.cents, qty: clampQty(item.qty || 1) });
      }
      write(cart);
    },
    setQty(sku, qty) {
      const cart = read();
      const it = cart.find((i) => i.sku === sku);
      if (it) { it.qty = clampQty(qty); write(cart); }
    },
    remove(sku) { write(read().filter((i) => i.sku !== sku)); },
    clear() { write([]); },
  };
})();
window.MVCart = MVCart;

// Path to cart.html relative to the current page (blog posts live one level down).
function cartHref() {
  return (location.pathname.indexOf('/blog/') !== -1 ? '../' : '') + 'cart.html';
}

// Inject a "Cart" link with a live count into the header nav (desktop + mobile).
function initCartBadge() {
  const href = cartHref();
  const desktop = document.getElementById('menu');
  const mobile = document.getElementById('mobile-menu');

  if (desktop && !document.getElementById('cartLink')) {
    const a = document.createElement('a');
    a.id = 'cartLink';
    a.href = href;
    a.className = 'hover:text-[#a27200] transition-colors relative group flex items-center gap-1';
    a.innerHTML =
      '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>' +
      '<span id="cartCount" class="bg-[#a27200] text-white text-xs font-bold rounded-full px-2 py-0.5 hidden">0</span>';
    desktop.appendChild(a);
  }
  if (mobile && !document.getElementById('cartLinkMobile')) {
    const a = document.createElement('a');
    a.id = 'cartLinkMobile';
    a.href = href;
    a.className = 'hover:text-[#a27200] hover:bg-[#2a2a2a] block py-2 px-3 rounded transition-all';
    a.innerHTML = 'Cart (<span id="cartCountMobile">0</span>)';
    mobile.appendChild(a);
  }
  renderCartBadge();
}

function renderCartBadge() {
  const n = MVCart.count();
  const badge = document.getElementById('cartCount');
  if (badge) {
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  }
  const mob = document.getElementById('cartCountMobile');
  if (mob) mob.textContent = n;
}

// Brief toast confirmation, e.g. after adding to the cart.
function showCartToast(message) {
  let toast = document.getElementById('mvToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mvToast';
    toast.className =
      'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-black text-white px-5 py-3 rounded-lg shadow-xl ' +
      'flex items-center gap-3 text-sm font-medium opacity-0 transition-opacity duration-300';
    document.body.appendChild(toast);
  }
  toast.innerHTML =
    '<span>' + message + '</span>' +
    '<a href="' + cartHref() + '" class="text-[#d39b1f] font-bold hover:underline">View cart →</a>';
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  clearTimeout(showCartToast._t);
  showCartToast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}
window.showCartToast = showCartToast;

// Initialize common features when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  initSmoothScroll();
  initCartBadge();
});
document.addEventListener('mv-cart-changed', renderCartBadge);
