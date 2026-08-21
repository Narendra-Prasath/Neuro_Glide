/**
 * NeuroGlide — DOM Analyzer
 * Reads and structures the entire page DOM for cognitive analysis.
 * Runs as a content script.
 */

const NeuroGlideDOMAnalyzer = (() => {

  /**
   * Analyze the full page structure and return structured data.
   * @returns {Object} Complete page analysis
   */
  function analyzePage() {
    const body = document.body;
    if (!body) return _emptyAnalysis();

    return {
      headings: _extractHeadings(),
      links: _extractLinks(),
      buttons: _extractButtons(),
      forms: _extractForms(),
      images: _extractImages(),
      textBlocks: _extractTextBlocks(),
      navigation: _extractNavigation(),
      semanticSections: _extractSemanticSections(),
      meta: _extractMeta(),
      stats: _calculateStats()
    };
  }

  function _emptyAnalysis() {
    return {
      headings: [], links: [], buttons: [], forms: [],
      images: [], textBlocks: [], navigation: [],
      semanticSections: [], meta: {}, stats: {}
    };
  }

  // ─── Headings ────────────────────────────────────────────────────
  function _extractHeadings() {
    const headings = [];
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
      if (_isVisible(h)) {
        headings.push({
          level: parseInt(h.tagName[1]),
          text: h.textContent.trim().slice(0, 200),
          element: h
        });
      }
    });
    return headings;
  }

  // ─── Links ───────────────────────────────────────────────────────
  function _extractLinks() {
    const links = [];
    document.querySelectorAll('a[href]').forEach(a => {
      if (_isVisible(a)) {
        links.push({
          text: (a.textContent || a.title || '').trim().slice(0, 100),
          href: a.href,
          isExternal: a.hostname !== location.hostname,
          isNavigation: !!a.closest('nav, [role="navigation"]'),
          element: a
        });
      }
    });
    return links;
  }

  // ─── Buttons ─────────────────────────────────────────────────────
  function _extractButtons() {
    const buttons = [];
    const selectors = 'button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]';
    document.querySelectorAll(selectors).forEach(btn => {
      if (_isVisible(btn)) {
        buttons.push({
          text: (btn.textContent || btn.value || btn.title || '').trim().slice(0, 100),
          type: btn.type || 'button',
          isSubmit: btn.type === 'submit',
          element: btn
        });
      }
    });
    return buttons;
  }

  // ─── Forms & Fields ──────────────────────────────────────────────
  function _extractForms() {
    const forms = [];
    document.querySelectorAll('form').forEach(form => {
      const fields = [];
      const formInputs = form.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), ' +
        'select, textarea'
      );

      formInputs.forEach(input => {
        if (_isVisible(input)) {
          const label = _findLabel(input, form);
          fields.push({
            type: input.type || input.tagName.toLowerCase(),
            name: input.name || '',
            id: input.id || '',
            label: label,
            required: input.required || input.hasAttribute('aria-required'),
            placeholder: input.placeholder || '',
            pattern: input.pattern || '',
            minLength: input.minLength > 0 ? input.minLength : null,
            maxLength: input.maxLength > 0 ? input.maxLength : null,
            element: input
          });
        }
      });

      if (fields.length > 0) {
        forms.push({
          id: form.id || '',
          action: form.action || '',
          method: form.method || 'get',
          fields: fields,
          fieldCount: fields.length,
          element: form
        });
      }
    });
    return forms;
  }

  function _findLabel(input, form) {
    // Check for explicit label
    if (input.id) {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label) return label.textContent.trim().slice(0, 100);
    }
    // Check for wrapping label
    const parentLabel = input.closest('label');
    if (parentLabel) {
      const text = parentLabel.textContent.replace(input.value || '', '').trim();
      return text.slice(0, 100);
    }
    // Check aria-label
    if (input.getAttribute('aria-label')) {
      return input.getAttribute('aria-label').trim();
    }
    // Check aria-labelledby
    const labelledBy = input.getAttribute('aria-labelledby');
    if (labelledBy) {
      const el = document.getElementById(labelledBy);
      if (el) return el.textContent.trim().slice(0, 100);
    }
    // Fallback to name or placeholder
    return input.placeholder || input.name || '';
  }

  // ─── Images ──────────────────────────────────────────────────────
  function _extractImages() {
    const images = [];
    document.querySelectorAll('img').forEach(img => {
      if (_isVisible(img) && img.width > 50 && img.height > 50) {
        images.push({
          alt: img.alt || '',
          src: img.src,
          hasAlt: !!img.alt,
          width: img.width,
          height: img.height
        });
      }
    });
    return images;
  }

  // ─── Text Blocks ─────────────────────────────────────────────────
  function _extractTextBlocks() {
    const blocks = [];
    const selector = 'p, li, td, th, blockquote, figcaption, .text, [class*="content"], [class*="description"]';

    document.querySelectorAll(selector).forEach(el => {
      if (!_isVisible(el)) return;
      const text = el.textContent.trim();
      if (text.length < 20) return; // Skip very short blocks

      // Avoid duplicates from nested elements
      if (el.closest('[data-neuroglide-scanned]')) return;
      el.setAttribute('data-neuroglide-scanned', 'true');

      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

      blocks.push({
        text: text.slice(0, 500),
        sentenceCount: sentences.length,
        avgSentenceLength: Math.round(sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length),
        wordCount: text.split(/\s+/).length,
        element: el
      });
    });

    // Clean up scan markers
    document.querySelectorAll('[data-neuroglide-scanned]').forEach(el => {
      el.removeAttribute('data-neuroglide-scanned');
    });

    return blocks;
  }

  // ─── Navigation Elements ─────────────────────────────────────────
  function _extractNavigation() {
    const navElements = [];
    document.querySelectorAll('nav, [role="navigation"], [role="menubar"], [role="menu"]').forEach(nav => {
      if (_isVisible(nav)) {
        const links = nav.querySelectorAll('a');
        navElements.push({
          linkCount: links.length,
          text: Array.from(links).map(a => a.textContent.trim()).slice(0, 20),
          element: nav
        });
      }
    });
    return navElements;
  }

  // ─── Semantic Sections ───────────────────────────────────────────
  function _extractSemanticSections() {
    const sections = [];
    const sectionTags = ['header', 'nav', 'main', 'article', 'section', 'aside', 'footer'];

    sectionTags.forEach(tag => {
      document.querySelectorAll(tag).forEach(el => {
        if (_isVisible(el)) {
          const rect = el.getBoundingClientRect();
          sections.push({
            tag: tag,
            id: el.id || '',
            className: el.className || '',
            textLength: el.textContent.trim().length,
            childElements: el.children.length,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            element: el
          });
        }
      });
    });
    return sections;
  }

  // ─── Page Metadata ───────────────────────────────────────────────
  function _extractMeta() {
    return {
      title: document.title || '',
      url: location.href,
      hostname: location.hostname,
      lang: document.documentElement.lang || 'en',
      charset: document.characterSet || 'UTF-8'
    };
  }

  // ─── Statistics ──────────────────────────────────────────────────
  function _calculateStats() {
    const body = document.body;
    const allElements = body.querySelectorAll('*');
    const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [tabindex]';
    const interactiveElements = body.querySelectorAll(interactiveSelectors);

    // Count visible interactive elements
    let visibleInteractive = 0;
    interactiveElements.forEach(el => {
      if (_isVisible(el)) visibleInteractive++;
    });

    return {
      totalElements: allElements.length,
      interactiveElements: visibleInteractive,
      totalTextLength: body.textContent.trim().length,
      domDepth: _calculateDOMDepth(body),
      uniqueColors: _countUniqueColors()
    };
  }

  function _calculateDOMDepth(el, depth = 0) {
    let maxDepth = depth;
    // Only check first 100 children to avoid perf issues
    const children = Array.from(el.children).slice(0, 100);
    for (const child of children) {
      maxDepth = Math.max(maxDepth, _calculateDOMDepth(child, depth + 1));
      if (maxDepth > 30) break; // Cap at 30
    }
    return maxDepth;
  }

  function _countUniqueColors() {
    const colors = new Set();
    // Sample first 50 visible elements
    const elements = Array.from(document.body.querySelectorAll('*')).filter(_isVisible).slice(0, 50);
    elements.forEach(el => {
      const style = getComputedStyle(el);
      colors.add(style.color);
      colors.add(style.backgroundColor);
    });
    return colors.size;
  }

  // ─── Utility ─────────────────────────────────────────────────────
  function _isVisible(el) {
    if (!el || !el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           el.offsetWidth > 0 &&
           el.offsetHeight > 0;
  }

  return { analyzePage };
})();

// Make available globally for content script
if (typeof window !== 'undefined') {
  window.NeuroGlideDOMAnalyzer = NeuroGlideDOMAnalyzer;
}
