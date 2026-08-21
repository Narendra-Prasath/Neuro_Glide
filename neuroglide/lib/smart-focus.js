/**
 * NeuroGlide — Smart Focus Mode
 * Removes or minimizes irrelevant menus, ads, sidebars, notifications
 * and secondary information according to the user's current task.
 */

const NeuroGlideSmartFocus = (() => {

  let _isActive = false;
  let _hiddenElements = [];
  let _dimmedElements = [];

  /**
   * Identify distractions on the page.
   * @param {Object} pageData - Output from DOM analyzer
   * @param {string} taskContext - Description of the user's current task
   * @returns {Object} { hide[], dim[], keep[] }
   */
  function identifyDistractions(pageData, taskContext = '') {
    const hide = [];
    const dim = [];
    const keep = [];
    const task = taskContext.toLowerCase();

    // ─── Always hide: Ads & Promotional ──────────────────────
    _findAds().forEach(el => hide.push({ element: el, reason: 'Advertisement' }));

    // ─── Always hide: Cookie banners ─────────────────────────
    _findCookieBanners().forEach(el => hide.push({ element: el, reason: 'Cookie banner' }));

    // ─── Always hide: Social media widgets ───────────────────
    _findSocialWidgets().forEach(el => hide.push({ element: el, reason: 'Social media widget' }));

    // ─── Always hide: Newsletter/popup modals ────────────────
    _findNewsletterPopups().forEach(el => hide.push({ element: el, reason: 'Newsletter popup' }));

    // ─── Dim: Secondary navigation ───────────────────────────
    // Keep primary nav but dim secondary/footer nav
    const navs = document.querySelectorAll('nav, [role="navigation"]');
    navs.forEach((nav, i) => {
      if (i > 0) { // Dim non-primary navs
        dim.push({ element: nav, reason: 'Secondary navigation' });
      }
    });

    // ─── Dim: Sidebars ───────────────────────────────────────
    document.querySelectorAll('aside, [role="complementary"], [class*="sidebar"], [class*="side-bar"]').forEach(el => {
      dim.push({ element: el, reason: 'Sidebar content' });
    });

    // ─── Dim: Footer ─────────────────────────────────────────
    document.querySelectorAll('footer, [role="contentinfo"]').forEach(el => {
      dim.push({ element: el, reason: 'Footer' });
    });

    // ─── Keep: Main content ──────────────────────────────────
    document.querySelectorAll('main, [role="main"], article, .content, #content').forEach(el => {
      keep.push({ element: el, reason: 'Main content' });
    });

    // ─── Task-specific focus ─────────────────────────────────
    if (task) {
      // If task is about forms, keep forms and hide everything else extra
      if (task.match(/form|apply|register|sign up|submit|fill/i)) {
        document.querySelectorAll('.related-articles, .recommendations, .suggested, .trending').forEach(el => {
          hide.push({ element: el, reason: 'Unrelated content' });
        });
      }
    }

    return {
      hide: _deduplicateElements(hide),
      dim: _deduplicateElements(dim),
      keep: _deduplicateElements(keep)
    };
  }

  /**
   * Activate Smart Focus Mode.
   * @param {Object} pageData
   * @param {string} taskContext
   */
  function activate(pageData, taskContext = '') {
    if (_isActive) deactivate();

    const { hide, dim } = identifyDistractions(pageData, taskContext);

    // Apply hide
    hide.forEach(({ element, reason }) => {
      if (element && !element.classList.contains('neuroglide-hidden')) {
        element.classList.add('neuroglide-hidden');
        element.setAttribute('data-neuroglide-reason', reason);
        _hiddenElements.push(element);
      }
    });

    // Apply dim
    dim.forEach(({ element, reason }) => {
      if (element && !element.classList.contains('neuroglide-dimmed')) {
        element.classList.add('neuroglide-dimmed');
        element.setAttribute('data-neuroglide-reason', reason);
        _dimmedElements.push(element);
      }
    });

    // Add focus highlight to main content
    const mainContent = document.querySelector('main, [role="main"], article, .content, #content');
    if (mainContent) {
      mainContent.classList.add('neuroglide-focused');
    }

    _isActive = true;

    return {
      hiddenCount: _hiddenElements.length,
      dimmedCount: _dimmedElements.length
    };
  }

  /**
   * Deactivate Smart Focus Mode.
   */
  function deactivate() {
    _hiddenElements.forEach(el => {
      el.classList.remove('neuroglide-hidden');
      el.removeAttribute('data-neuroglide-reason');
    });
    _dimmedElements.forEach(el => {
      el.classList.remove('neuroglide-dimmed');
      el.removeAttribute('data-neuroglide-reason');
    });

    document.querySelectorAll('.neuroglide-focused').forEach(el => {
      el.classList.remove('neuroglide-focused');
    });

    _hiddenElements = [];
    _dimmedElements = [];
    _isActive = false;
  }

  function isActive() {
    return _isActive;
  }

  // ─── Detection Helpers ───────────────────────────────────────────
  function _findAds() {
    const adSelectors = [
      '[class*="ad-"]', '[class*="ad_"]', '[class*="advert"]', '[class*="sponsor"]',
      '[class*="promo"]', '[class*="banner-ad"]', '[id*="ad-"]', '[id*="ad_"]',
      '[id*="advert"]', '[data-ad]', '[data-ad-slot]', '[data-google-query-id]',
      'ins.adsbygoogle', '[class*="google-ad"]', '[aria-label*="advertisement"]',
      '[aria-label*="sponsored"]', 'iframe[src*="doubleclick"]',
      'iframe[src*="googlesyndication"]', 'iframe[src*="facebook.com/plugins"]'
    ];

    const ads = new Set();
    adSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => ads.add(el));
      } catch (e) { /* Invalid selector */ }
    });
    return Array.from(ads);
  }

  function _findCookieBanners() {
    const selectors = [
      '[class*="cookie"]', '[id*="cookie"]', '[class*="consent"]', '[id*="consent"]',
      '[class*="gdpr"]', '[id*="gdpr"]', '[class*="privacy-banner"]',
      '[aria-label*="cookie"]', '[aria-label*="consent"]',
      '[class*="cc-banner"]', '[class*="cc_banner"]'
    ];

    const banners = new Set();
    selectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          // Only match if it looks like a banner (fixed/sticky position or overlay)
          const style = getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky' ||
              el.textContent.toLowerCase().includes('cookie') ||
              el.textContent.toLowerCase().includes('consent')) {
            banners.add(el);
          }
        });
      } catch (e) { /* Invalid selector */ }
    });
    return Array.from(banners);
  }

  function _findSocialWidgets() {
    const selectors = [
      '[class*="social-share"]', '[class*="share-buttons"]', '[class*="social-media"]',
      '[class*="social-icons"]', '[class*="share-widget"]',
      'iframe[src*="twitter.com"]', 'iframe[src*="facebook.com"]',
      '.fb-like', '.twitter-share', '[class*="sharethis"]'
    ];

    const widgets = new Set();
    selectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => widgets.add(el));
      } catch (e) { /* Invalid selector */ }
    });
    return Array.from(widgets);
  }

  function _findNewsletterPopups() {
    const selectors = [
      '[class*="newsletter"]', '[class*="subscribe-popup"]', '[class*="popup-overlay"]',
      '[class*="modal-overlay"]', '[class*="notification-bar"]',
      '[class*="announcement-bar"]', '[class*="sticky-bar"]'
    ];

    const popups = new Set();
    selectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          const style = getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky' || style.zIndex > 100) {
            popups.add(el);
          }
        });
      } catch (e) { /* Invalid selector */ }
    });
    return Array.from(popups);
  }

  function _deduplicateElements(items) {
    const seen = new Set();
    return items.filter(item => {
      if (seen.has(item.element)) return false;
      seen.add(item.element);
      return true;
    });
  }

  return { identifyDistractions, activate, deactivate, isActive };
})();

if (typeof window !== 'undefined') {
  window.NeuroGlideSmartFocus = NeuroGlideSmartFocus;
}
