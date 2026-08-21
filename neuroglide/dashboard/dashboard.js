/**
 * NeuroGlide — Analytics Dashboard Logic
 * Reads analytics data from chrome.storage and renders charts, tables, and metrics.
 */

document.addEventListener('DOMContentLoaded', async () => {

  const els = {
    ovPages: document.getElementById('ov-pages'),
    ovAvgScore: document.getElementById('ov-avg-score'),
    ovBestScore: document.getElementById('ov-best-score'),
    ovWorstScore: document.getElementById('ov-worst-score'),
    scoreDistribution: document.getElementById('score-distribution'),
    factorsChart: document.getElementById('factors-chart'),
    pagesTbody: document.getElementById('pages-tbody'),
    emptyState: document.getElementById('empty-state'),
    pagesTable: document.getElementById('pages-table'),
    btnExport: document.getElementById('btn-export'),
    btnClear: document.getElementById('btn-clear')
  };

  // ─── Load Data ──────────────────────────────────────────────
  const analytics = await _getAnalytics();
  _renderDashboard(analytics);

  // ─── Event Listeners ────────────────────────────────────────
  els.btnExport.addEventListener('click', () => _exportData(analytics));
  els.btnClear.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all analytics data?')) {
      await chrome.storage.local.set({
        neuroglideAnalytics: {
          pagesAnalyzed: 0,
          totalScoreBefore: 0,
          totalScoreAfter: 0,
          pageHistory: [],
          formCompletions: 0,
          formDropoffs: 0
        }
      });
      location.reload();
    }
  });

  // ─── Render Dashboard ───────────────────────────────────────
  function _renderDashboard(data) {
    const history = data.pageHistory || [];

    if (history.length === 0) {
      els.emptyState.hidden = false;
      els.pagesTable.hidden = true;
      return;
    }

    els.emptyState.hidden = true;
    els.pagesTable.hidden = false;

    // Overview metrics
    els.ovPages.textContent = data.pagesAnalyzed || history.length;

    const scores = history.map(p => p.score).filter(s => typeof s === 'number');
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const bestScore = scores.length > 0 ? Math.min(...scores) : 0;
    const worstScore = scores.length > 0 ? Math.max(...scores) : 0;

    els.ovAvgScore.textContent = avgScore;
    els.ovBestScore.textContent = bestScore;
    els.ovWorstScore.textContent = worstScore;

    // Color coding for overview values
    els.ovAvgScore.style.color = _scoreColor(avgScore);
    els.ovBestScore.style.color = _scoreColor(bestScore);
    els.ovWorstScore.style.color = _scoreColor(worstScore);

    // Score distribution chart
    _renderDistributionChart(scores);

    // Common factors
    _renderFactorsChart(history);

    // Page history table
    _renderPagesTable(history);
  }

  // ─── Distribution Chart ─────────────────────────────────────
  function _renderDistributionChart(scores) {
    const buckets = [
      { label: '0-10', min: 0, max: 10, count: 0, color: '#10b981' },
      { label: '11-20', min: 11, max: 20, count: 0, color: '#10b981' },
      { label: '21-30', min: 21, max: 30, count: 0, color: '#10b981' },
      { label: '31-40', min: 31, max: 40, count: 0, color: '#fbbf24' },
      { label: '41-50', min: 41, max: 50, count: 0, color: '#fbbf24' },
      { label: '51-60', min: 51, max: 60, count: 0, color: '#f97316' },
      { label: '61-70', min: 61, max: 70, count: 0, color: '#f97316' },
      { label: '71-80', min: 71, max: 80, count: 0, color: '#ef4444' },
      { label: '81-90', min: 81, max: 90, count: 0, color: '#ef4444' },
      { label: '91-100', min: 91, max: 100, count: 0, color: '#ef4444' }
    ];

    scores.forEach(score => {
      const bucket = buckets.find(b => score >= b.min && score <= b.max);
      if (bucket) bucket.count++;
    });

    const maxCount = Math.max(1, ...buckets.map(b => b.count));

    els.scoreDistribution.innerHTML = buckets.map(bucket => {
      const height = Math.max(4, (bucket.count / maxCount) * 180);
      return `
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
          <div class="dash-bar" 
               style="height: ${height}px; background: ${bucket.color}; width: 100%;" 
               data-count="${bucket.count}"
               title="${bucket.label}: ${bucket.count} pages"></div>
          <div class="dash-bar-label">${bucket.label}</div>
        </div>
      `;
    }).join('');
  }

  // ─── Factors Chart ──────────────────────────────────────────
  function _renderFactorsChart(history) {
    // Aggregate factor scores across all pages
    const factorTotals = {};
    let pageCount = 0;

    history.forEach(page => {
      if (!page.factors) return;
      pageCount++;
      Object.entries(page.factors).forEach(([key, factor]) => {
        if (!factorTotals[key]) {
          factorTotals[key] = { label: factor.label || key, totalScore: 0, count: 0 };
        }
        factorTotals[key].totalScore += factor.score || 0;
        factorTotals[key].count++;
      });
    });

    // Calculate averages and sort
    const factors = Object.values(factorTotals)
      .map(f => ({
        label: f.label,
        avgScore: Math.round(f.totalScore / Math.max(f.count, 1))
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    if (factors.length === 0) {
      els.factorsChart.innerHTML = '<div style="text-align: center; color: #64748b; padding: 24px;">No factor data available yet.</div>';
      return;
    }

    els.factorsChart.innerHTML = factors.map(factor => {
      const color = _scoreColor(factor.avgScore);
      return `
        <div class="dash-factor-row">
          <span class="dash-factor-name">${factor.label}</span>
          <div class="dash-factor-bar-track">
            <div class="dash-factor-bar-fill" style="width: ${factor.avgScore}%; background: ${color};"></div>
          </div>
          <span class="dash-factor-value" style="color: ${color};">${factor.avgScore}/100</span>
        </div>
      `;
    }).join('');
  }

  // ─── Pages Table ────────────────────────────────────────────
  function _renderPagesTable(history) {
    els.pagesTbody.innerHTML = history.map(page => {
      const score = page.score || 0;
      const gradeClass = score <= 30 ? 'easy' : score <= 55 ? 'moderate' : score <= 75 ? 'difficult' : 'hard';
      const gradeLabel = score <= 30 ? 'Easy' : score <= 55 ? 'Moderate' : score <= 75 ? 'Difficult' : 'Very Hard';
      const date = page.timestamp ? new Date(page.timestamp).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '—';

      return `
        <tr>
          <td>
            <div class="dash-page-title">${_escapeHtml(page.title || 'Unknown')}</div>
            <div class="dash-page-url">${_escapeHtml(page.url || '')}</div>
          </td>
          <td><span class="dash-score-badge dash-grade-${gradeClass}">${score}/100</span></td>
          <td>${gradeLabel}</td>
          <td style="color: #64748b; white-space: nowrap;">${date}</td>
        </tr>
      `;
    }).join('');
  }

  // ─── Helpers ────────────────────────────────────────────────
  function _scoreColor(score) {
    if (score <= 30) return '#10b981';
    if (score <= 55) return '#fbbf24';
    if (score <= 75) return '#f97316';
    return '#ef4444';
  }

  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function _getAnalytics() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_ANALYTICS' }, (response) => {
        resolve(response || { pagesAnalyzed: 0, pageHistory: [] });
      });
    });
  }

  function _exportData(analytics) {
    const blob = new Blob([JSON.stringify(analytics, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neuroglide-analytics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
});
