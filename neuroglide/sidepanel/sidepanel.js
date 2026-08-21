/**
 * NeuroGlide — Side Panel Logic
 * Connects the side panel UI to content script engines via message passing.
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ─── DOM References ──────────────────────────────────────────
  const els = {
    pageTitle: document.getElementById('page-title'),
    pageUrl: document.getElementById('page-url'),
    scoreNumber: document.getElementById('score-number'),
    gaugeFill: document.getElementById('gauge-fill'),
    scoreGrade: document.getElementById('score-grade'),
    scoreDesc: document.getElementById('score-desc'),
    btnBreakdown: document.getElementById('btn-breakdown'),
    breakdownContent: document.getElementById('breakdown-content'),
    statsGrid: document.getElementById('stats-grid'),
    toggleHeatmap: document.getElementById('toggle-heatmap'),
    toggleFocus: document.getElementById('toggle-focus'),
    toggleForm: document.getElementById('toggle-form'),
    toggleErrors: document.getElementById('toggle-errors'),
    btnSimplify: document.getElementById('btn-simplify'),
    taskInput: document.getElementById('task-input'),
    btnTask: document.getElementById('btn-task'),
    taskResult: document.getElementById('task-result'),
    taskSummary: document.getElementById('task-summary'),
    taskSteps: document.getElementById('task-steps'),
    langSelect: document.getElementById('lang-select'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnSettings: document.getElementById('btn-settings'),
    settingsPanel: document.getElementById('settings-panel'),
    difficultySelect: document.getElementById('difficulty-select'),
    btnDashboard: document.getElementById('btn-dashboard')
  };

  let currentAnalysis = null;
  let currentTaskSteps = [];

  // ─── Initialize ──────────────────────────────────────────────
  await _loadProfile();
  await _requestAnalysis();

  // Listen for storage changes (new analysis from content script)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.latestAnalysis) {
      const data = changes.latestAnalysis.newValue;
      if (data) _renderAnalysis(data);
    }
  });

  // Check for existing analysis
  const { latestAnalysis } = await chrome.storage.session.get('latestAnalysis');
  if (latestAnalysis) _renderAnalysis(latestAnalysis);

  // ─── Event Listeners ─────────────────────────────────────────

  // Refresh
  els.btnRefresh.addEventListener('click', async () => {
    els.btnRefresh.style.animation = 'ng-spin 0.5s ease';
    await _requestAnalysis();
    setTimeout(() => { els.btnRefresh.style.animation = ''; }, 500);
  });

  // Settings toggle
  els.btnSettings.addEventListener('click', () => {
    els.settingsPanel.hidden = !els.settingsPanel.hidden;
  });

  // Score breakdown toggle
  els.btnBreakdown.addEventListener('click', () => {
    const content = els.breakdownContent;
    const isExpanded = !content.hidden;
    content.hidden = isExpanded;
    els.btnBreakdown.setAttribute('aria-expanded', !isExpanded);
  });

  // Heatmap toggle
  els.toggleHeatmap.addEventListener('change', async (e) => {
    await _sendToContent({ type: 'TOGGLE_HEATMAP', enabled: e.target.checked });
    _showToast(e.target.checked ? '🗺️ Heatmap enabled' : 'Heatmap disabled');
  });

  // Smart Focus toggle
  els.toggleFocus.addEventListener('change', async (e) => {
    const taskContext = els.taskInput.value;
    const result = await _sendToContent({
      type: 'TOGGLE_SMART_FOCUS',
      enabled: e.target.checked,
      taskContext: taskContext
    });
    if (e.target.checked && result) {
      _showToast(`🎯 Focus mode: ${result.hiddenCount || 0} hidden, ${result.dimmedCount || 0} dimmed`);
    } else {
      _showToast('Focus mode disabled');
    }
  });

  // Guided Form toggle
  els.toggleForm.addEventListener('change', async (e) => {
    const result = await _sendToContent({
      type: 'TOGGLE_GUIDED_FORM',
      enabled: e.target.checked
    });
    if (e.target.checked) {
      if (result?.formFound) {
        _showToast(`📋 Guided form: ${result.fields} fields split into steps`);
      } else {
        _showToast('⚠️ No significant form found on this page');
        e.target.checked = false;
      }
    } else {
      _showToast('Guided form disabled');
    }
  });

  // Error Prevention toggle
  els.toggleErrors.addEventListener('change', async (e) => {
    await _sendToContent({
      type: 'TOGGLE_ERROR_PREVENTION',
      enabled: e.target.checked
    });
    _showToast(e.target.checked ? '🛡️ Error prevention active' : 'Error prevention disabled');
  });

  // Simplify Page
  els.btnSimplify.addEventListener('click', async () => {
    els.btnSimplify.textContent = 'Simplifying...';
    els.btnSimplify.classList.add('ng-loading');
    const profile = await _getProfile();
    await _sendToContent({
      type: 'SIMPLIFY_PAGE',
      level: profile.difficultyLevel || 'simple'
    });
    els.btnSimplify.textContent = '✓ Done';
    els.btnSimplify.classList.remove('ng-loading');
    _showToast('✨ Page text simplified');
    setTimeout(() => { els.btnSimplify.textContent = 'Simplify'; }, 2000);
  });

  // Task Intent
  els.btnTask.addEventListener('click', _handleTaskIntent);
  els.taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _handleTaskIntent();
  });

  // Language Selector
  els.langSelect.addEventListener('change', async (e) => {
    const lang = e.target.value;
    await _updateProfile({ preferredLanguage: lang });

    // Re-translate existing task steps if any
    if (currentTaskSteps.length > 0 && lang !== 'en') {
      const result = await _sendToContent({
        type: 'TRANSLATE_STEPS',
        steps: currentTaskSteps,
        targetLang: lang
      });
      if (result?.steps) {
        _renderTaskSteps(result.steps, true);
      }
    }
  });

  // Difficulty
  els.difficultySelect.addEventListener('change', async (e) => {
    await _updateProfile({ difficultyLevel: e.target.value });
    _showToast(`Difficulty set to ${e.target.value}`);
  });

  // Dashboard
  els.btnDashboard.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  // ─── Analysis Rendering ──────────────────────────────────────
  function _renderAnalysis(data) {
    currentAnalysis = data;

    // Page info
    els.pageTitle.textContent = data.pageInfo?.title || 'Unknown Page';
    els.pageUrl.textContent = data.pageInfo?.url || '';

    // Cognitive Load Score
    const score = data.cognitiveLoad?.score ?? 0;
    const grade = data.cognitiveLoad?.grade || { label: 'Unknown', color: '#94a3b8' };

    // Animate score
    _animateScore(score);

    els.scoreGrade.textContent = `${grade.emoji || ''} ${grade.label}`;
    els.scoreGrade.style.color = grade.color;

    // Description based on score
    if (score <= 30) {
      els.scoreDesc.textContent = 'This page is relatively simple and accessible.';
    } else if (score <= 55) {
      els.scoreDesc.textContent = 'This page has moderate complexity. Some users may need help.';
    } else if (score <= 75) {
      els.scoreDesc.textContent = 'This page is quite complex. NeuroGlide can simplify it.';
    } else {
      els.scoreDesc.textContent = 'This page is very complex. Consider using Focus or Guided modes.';
    }

    // Render breakdown factors
    _renderBreakdown(data.cognitiveLoad?.factors || {});

    // Render stats
    _renderStats(data.stats || {});
  }

  function _animateScore(targetScore) {
    const circumference = 326.7;
    const offset = circumference - (circumference * targetScore / 100);
    els.gaugeFill.style.strokeDashoffset = offset;

    // Color based on score
    let color;
    if (targetScore <= 30) color = '#10b981';
    else if (targetScore <= 55) color = '#fbbf24';
    else if (targetScore <= 75) color = '#f97316';
    else color = '#ef4444';
    els.gaugeFill.style.stroke = color;

    // Animate number
    let current = 0;
    const duration = 1200;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
      current = Math.round(eased * targetScore);
      els.scoreNumber.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  function _renderBreakdown(factors) {
    els.breakdownContent.innerHTML = '';

    Object.entries(factors).forEach(([key, factor]) => {
      let barColor;
      if (factor.score <= 30) barColor = '#10b981';
      else if (factor.score <= 60) barColor = '#fbbf24';
      else barColor = '#ef4444';

      const row = document.createElement('div');
      row.className = 'ng-factor-row';
      row.innerHTML = `
        <span class="ng-factor-label">${factor.label}</span>
        <span class="ng-factor-count">${factor.count}</span>
        <div class="ng-factor-bar">
          <div class="ng-factor-bar-fill" style="width: ${factor.score}%; background: ${barColor};"></div>
        </div>
      `;
      row.title = factor.description;
      els.breakdownContent.appendChild(row);
    });
  }

  function _renderStats(stats) {
    const items = [
      { value: stats.interactiveElements || 0, label: 'Interactive' },
      { value: stats.formFields || 0, label: 'Form Fields' },
      { value: stats.links || 0, label: 'Links' },
      { value: stats.buttons || 0, label: 'Buttons' },
      { value: stats.headings || 0, label: 'Headings' },
      { value: stats.forms || 0, label: 'Forms' }
    ];

    els.statsGrid.innerHTML = items.map(item => `
      <div class="ng-stat-card">
        <span class="ng-stat-value">${item.value}</span>
        <span class="ng-stat-label">${item.label}</span>
      </div>
    `).join('');
  }

  // ─── Task Intent ─────────────────────────────────────────────
  async function _handleTaskIntent() {
    const goal = els.taskInput.value.trim();
    if (!goal) return;

    els.btnTask.textContent = '...';
    els.btnTask.disabled = true;

    try {
      const result = await _sendToContent({
        type: 'PARSE_TASK_INTENT',
        goal: goal
      });

      if (result?.steps && result.steps.length > 0) {
        currentTaskSteps = result.steps;
        els.taskSummary.textContent = result.summary || '';
        _renderTaskSteps(result.steps, false);
        els.taskResult.hidden = false;

        // Translate if non-English language selected
        const lang = els.langSelect.value;
        if (lang !== 'en') {
          const translated = await _sendToContent({
            type: 'TRANSLATE_STEPS',
            steps: result.steps,
            targetLang: lang
          });
          if (translated?.steps) {
            _renderTaskSteps(translated.steps, true);
          }
        }
      } else {
        els.taskSummary.textContent = result?.summary || 'Could not generate a task plan for this page.';
        els.taskSteps.innerHTML = '';
        els.taskResult.hidden = false;
      }
    } catch (err) {
      _showToast('⚠️ Failed to generate task plan');
    }

    els.btnTask.textContent = '→';
    els.btnTask.disabled = false;
  }

  function _renderTaskSteps(steps, isTranslated) {
    els.taskSteps.innerHTML = '';

    steps.forEach((step, i) => {
      const li = document.createElement('li');
      li.className = `ng-task-step ${step.completed ? 'completed' : ''}`;
      li.innerHTML = `
        <div class="ng-step-check">
          <span class="ng-step-number">${step.number || i + 1}</span>
          ✓
        </div>
        <span class="ng-step-text">${isTranslated && step.translatedText ? step.translatedText : step.text}</span>
      `;

      // Click to toggle completion
      li.addEventListener('click', () => {
        step.completed = !step.completed;
        li.classList.toggle('completed', step.completed);
      });

      els.taskSteps.appendChild(li);
    });
  }

  // ─── Message Helpers ─────────────────────────────────────────
  async function _sendToContent(command) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'COMMAND_TO_CONTENT',
        command: command
      }, (response) => {
        resolve(response || {});
      });
    });
  }

  async function _requestAnalysis() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE_PAGE' });
    } catch (err) {
      // Content script may not be loaded yet
      els.pageTitle.textContent = 'Unable to analyze this page';
      els.scoreNumber.textContent = '—';
    }
  }

  // ─── Profile Management ──────────────────────────────────────
  async function _loadProfile() {
    const profile = await _getProfile();
    els.langSelect.value = profile.preferredLanguage || 'en';
    els.difficultySelect.value = profile.difficultyLevel || 'standard';
  }

  async function _getProfile() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (response) => {
        resolve(response || {});
      });
    });
  }

  async function _updateProfile(updates) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'UPDATE_PROFILE', updates }, (response) => {
        resolve(response);
      });
    });
  }

  // ─── Toast Notification ──────────────────────────────────────
  function _showToast(message) {
    // Remove existing toast
    document.querySelector('.ng-toast')?.remove();

    const toast = document.createElement('div');
    toast.className = 'ng-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }
});
