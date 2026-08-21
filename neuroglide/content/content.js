/**
 * NeuroGlide — Content Script
 * Main orchestrator running on every page. Connects all engines and handles
 * messages from the side panel and service worker.
 */

(() => {
  // Ensure we don't double-initialize
  if (window._neuroglideContentInitialized) return;
  window._neuroglideContentInitialized = true;

  let _pageData = null;
  let _cognitiveLoad = null;
  let _heatmapActive = false;

  // ─── Auto-analyze on page load ─────────────────────────────────
  _analyzeCurrentPage();

  // ─── Message Listener ──────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    switch (message.type) {
      case 'ANALYZE_PAGE':
        (async () => {
          const result = await _analyzeCurrentPage();
          sendResponse(result);
        })();
        return true;

      case 'GET_ANALYSIS':
        sendResponse(_getSerializableAnalysis());
        return true;

      case 'TOGGLE_HEATMAP':
        _toggleHeatmap(message.enabled);
        sendResponse({ success: true, enabled: _heatmapActive });
        return true;

      case 'TOGGLE_SMART_FOCUS':
        (async () => {
          const result = _toggleSmartFocus(message.enabled, message.taskContext);
          sendResponse(result);
        })();
        return true;

      case 'TOGGLE_GUIDED_FORM':
        (async () => {
          const result = _toggleGuidedForm(message.enabled);
          sendResponse(result);
        })();
        return true;

      case 'TOGGLE_ERROR_PREVENTION':
        _toggleErrorPrevention(message.enabled);
        sendResponse({ success: true });
        return true;

      case 'PARSE_TASK_INTENT':
        (async () => {
          try {
            const result = await NeuroGlideTaskIntent.parseTaskIntent(message.goal, _pageData);
            sendResponse(result);
          } catch (err) {
            sendResponse({ error: err.message, steps: [] });
          }
        })();
        return true;

      case 'SIMPLIFY_TEXT':
        (async () => {
          try {
            const result = await NeuroGlideTextSimplifier.simplifyText(message.text, message.level);
            sendResponse({ simplified: result });
          } catch (err) {
            sendResponse({ error: err.message });
          }
        })();
        return true;

      case 'SIMPLIFY_SELECTION':
        (async () => {
          await _simplifySelectedText(message.text);
          sendResponse({ success: true });
        })();
        return true;

      case 'EXPLAIN_TERM':
        (async () => {
          try {
            const explanation = await NeuroGlideTextSimplifier.explainTerm(message.term, message.context);
            _showExplanationTooltip(message.term, explanation);
            sendResponse({ explanation });
          } catch (err) {
            sendResponse({ error: err.message });
          }
        })();
        return true;

      case 'SIMPLIFY_PAGE':
        (async () => {
          await _simplifyPageContent(message.level);
          sendResponse({ success: true });
        })();
        return true;

      case 'TRANSLATE_STEPS':
        (async () => {
          try {
            const translated = await NeuroGlideMultilingual.translateTaskGuidance(
              message.steps, message.targetLang
            );
            sendResponse({ steps: translated });
          } catch (err) {
            sendResponse({ error: err.message });
          }
        })();
        return true;

      default:
        sendResponse({ error: 'Unknown message type' });
        return false;
    }
  });

  // ─── Page Analysis ─────────────────────────────────────────────
  async function _analyzeCurrentPage() {
    try {
      _pageData = NeuroGlideDOMAnalyzer.analyzePage();
      _cognitiveLoad = NeuroGlideCognitiveLoad.calculateCognitiveLoad(_pageData);

      const result = _getSerializableAnalysis();

      // Send results to service worker for storage and side panel access
      try {
        chrome.runtime.sendMessage({
          type: 'ANALYSIS_RESULT',
          data: result
        });
      } catch (err) {
        // Side panel might not be open
      }

      return result;
    } catch (err) {
      console.error('NeuroGlide analysis failed:', err);
      return { error: err.message };
    }
  }

  function _getSerializableAnalysis() {
    if (!_pageData || !_cognitiveLoad) return null;

    // Remove DOM element references for message passing
    return {
      cognitiveLoad: {
        score: _cognitiveLoad.score,
        grade: _cognitiveLoad.grade,
        factors: Object.fromEntries(
          Object.entries(_cognitiveLoad.factors).map(([key, factor]) => [
            key,
            { ...factor, element: undefined }
          ])
        ),
        sectionScores: _cognitiveLoad.sectionScores.map(s => ({
          tag: s.tag, id: s.id, score: s.score, difficulty: s.difficulty
        })),
        recommendations: _cognitiveLoad.recommendations
      },
      pageInfo: {
        title: _pageData.meta?.title || document.title,
        url: _pageData.meta?.url || location.href,
        hostname: _pageData.meta?.hostname || location.hostname,
        lang: _pageData.meta?.lang || 'en'
      },
      stats: {
        headings: _pageData.headings.length,
        links: _pageData.links.length,
        buttons: _pageData.buttons.length,
        forms: _pageData.forms.length,
        formFields: _pageData.forms.reduce((sum, f) => sum + f.fieldCount, 0),
        textBlocks: _pageData.textBlocks.length,
        images: _pageData.images.length,
        totalElements: _pageData.stats?.totalElements || 0,
        interactiveElements: _pageData.stats?.interactiveElements || 0
      }
    };
  }

  // ─── Heatmap ───────────────────────────────────────────────────
  function _toggleHeatmap(enabled) {
    if (enabled && !_heatmapActive) {
      _activateHeatmap();
    } else if (!enabled && _heatmapActive) {
      _deactivateHeatmap();
    }
  }

  function _activateHeatmap() {
    if (!_cognitiveLoad) return;

    _cognitiveLoad.sectionScores.forEach(section => {
      const el = section.element;
      if (!el) return;

      el.classList.add('neuroglide-heatmap');
      el.classList.add(`neuroglide-heatmap-${section.difficulty}`);

      // Add score badge
      const badge = document.createElement('div');
      badge.className = `neuroglide-heatmap-badge neuroglide-badge-${section.difficulty}`;
      badge.textContent = `${section.score}/100`;
      badge.title = `Cognitive load: ${section.difficulty} (${section.score}/100)`;
      el.style.position = el.style.position || 'relative';
      el.appendChild(badge);
    });

    _heatmapActive = true;
  }

  function _deactivateHeatmap() {
    document.querySelectorAll('.neuroglide-heatmap').forEach(el => {
      el.classList.remove('neuroglide-heatmap', 'neuroglide-heatmap-easy',
        'neuroglide-heatmap-medium', 'neuroglide-heatmap-hard');
    });
    document.querySelectorAll('.neuroglide-heatmap-badge').forEach(el => el.remove());
    _heatmapActive = false;
  }

  // ─── Smart Focus ───────────────────────────────────────────────
  function _toggleSmartFocus(enabled, taskContext) {
    if (enabled) {
      const result = NeuroGlideSmartFocus.activate(_pageData, taskContext);
      return { success: true, ...result };
    } else {
      NeuroGlideSmartFocus.deactivate();
      return { success: true, hiddenCount: 0, dimmedCount: 0 };
    }
  }

  // ─── Guided Form ───────────────────────────────────────────────
  function _toggleGuidedForm(enabled) {
    if (enabled) {
      // Find the first significant form on the page
      const forms = _pageData?.forms || [];
      const significantForm = forms.find(f => f.fieldCount >= 3);
      if (significantForm) {
        NeuroGlideGuidedForm.activate(significantForm.element);
        return { success: true, formFound: true, fields: significantForm.fieldCount };
      }
      return { success: false, formFound: false, message: 'No significant form found on this page' };
    } else {
      NeuroGlideGuidedForm.deactivate();
      return { success: true };
    }
  }

  // ─── Error Prevention ──────────────────────────────────────────
  function _toggleErrorPrevention(enabled) {
    if (enabled) {
      NeuroGlideErrorPrevention.activate();
    } else {
      NeuroGlideErrorPrevention.deactivate();
    }
  }

  // ─── Text Simplification ──────────────────────────────────────
  async function _simplifyPageContent(level = 'simple') {
    if (!_pageData) return;

    const textBlocks = _pageData.textBlocks || [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < Math.min(textBlocks.length, 20); i += BATCH_SIZE) {
      const batch = textBlocks.slice(i, i + BATCH_SIZE);

      await new Promise(resolve => requestAnimationFrame(async () => {
        for (const block of batch) {
          try {
            const el = block.element;
            if (!el || el.classList.contains('neuroglide-simplified')) continue;

            const originalText = el.textContent;
            const simplified = await NeuroGlideTextSimplifier.simplifyText(originalText, level);

            if (simplified !== originalText) {
              el.setAttribute('data-neuroglide-original', originalText);
              el.textContent = simplified;
              el.classList.add('neuroglide-simplified');

              // Add "show original" toggle
              const toggle = document.createElement('button');
              toggle.className = 'neuroglide-original-toggle';
              toggle.textContent = '📝 Show original';
              toggle.addEventListener('click', () => {
                if (el.textContent === simplified) {
                  el.textContent = originalText;
                  toggle.textContent = '✨ Show simplified';
                } else {
                  el.textContent = simplified;
                  toggle.textContent = '📝 Show original';
                }
                el.appendChild(toggle);
              });
              el.appendChild(toggle);
            }
          } catch (err) {
            console.warn('Simplification failed for element:', err.message);
          }
        }
        resolve();
      }));

      // Yield between batches
      if (typeof scheduler !== 'undefined' && scheduler.yield) {
        await scheduler.yield();
      }
    }
  }

  async function _simplifySelectedText(text) {
    const simplified = await NeuroGlideTextSimplifier.simplifyText(text, 'simple');
    _showSimplifiedOverlay(text, simplified);
  }

  function _showSimplifiedOverlay(original, simplified) {
    // Remove existing overlay
    document.querySelector('.neuroglide-simplify-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'neuroglide-simplify-overlay';
    overlay.innerHTML = `
      <div class="neuroglide-so-header">
        <span>✨ Simplified by NeuroGlide</span>
        <button class="neuroglide-so-close">✕</button>
      </div>
      <div class="neuroglide-so-content">${simplified}</div>
      <div class="neuroglide-so-original">
        <details>
          <summary>Show original text</summary>
          <p>${original}</p>
        </details>
      </div>
    `;

    document.body.appendChild(overlay);

    // Position near selection
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      overlay.style.top = `${window.scrollY + rect.bottom + 10}px`;
      overlay.style.left = `${Math.max(10, rect.left)}px`;
    }

    overlay.querySelector('.neuroglide-so-close').addEventListener('click', () => overlay.remove());

    // Auto-remove after 30 seconds
    setTimeout(() => overlay.remove(), 30000);
  }

  function _showExplanationTooltip(term, explanation) {
    document.querySelector('.neuroglide-explain-tooltip')?.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'neuroglide-explain-tooltip';
    tooltip.innerHTML = `
      <div class="neuroglide-et-header">
        <strong>💡 "${term}"</strong>
        <button class="neuroglide-et-close">✕</button>
      </div>
      <div class="neuroglide-et-content">${explanation}</div>
    `;

    document.body.appendChild(tooltip);

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      tooltip.style.top = `${window.scrollY + rect.bottom + 8}px`;
      tooltip.style.left = `${Math.max(10, rect.left)}px`;
    }

    tooltip.querySelector('.neuroglide-et-close').addEventListener('click', () => tooltip.remove());
    setTimeout(() => tooltip.remove(), 15000);
  }

  // Announce ready
  chrome.runtime.sendMessage({ type: 'CONTENT_READY' });
})();
