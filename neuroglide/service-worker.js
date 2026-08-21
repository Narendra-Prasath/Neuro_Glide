/* NeuroGlide — Service Worker (Background) */

// Open side panel when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ─── Installation & Context Menu Setup ───────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  // Set default user profile on first install
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      neuroglideProfile: {
        preferredLanguage: 'en',
        difficultyLevel: 'standard',   // simple | standard | detailed
        smartFocusEnabled: false,
        guidedFormEnabled: false,
        heatmapEnabled: false,
        createdAt: Date.now()
      },
      neuroglideAnalytics: {
        pagesAnalyzed: 0,
        totalScoreBefore: 0,
        totalScoreAfter: 0,
        pageHistory: [],
        formCompletions: 0,
        formDropoffs: 0
      }
    });
  }

  // Create context menu items
  chrome.contextMenus.create({
    id: 'neuroglide-analyze',
    title: 'Analyze with NeuroGlide',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'neuroglide-simplify',
    title: 'Simplify selected text',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'neuroglide-explain',
    title: 'Explain this term',
    contexts: ['selection']
  });
});

// ─── Context Menu Handlers ───────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'neuroglide-analyze') {
    // Open the side panel and trigger analysis
    await chrome.sidePanel.open({ windowId: tab.windowId });
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE_PAGE' });
    } catch (err) {
      console.warn('Content script not ready:', err.message);
    }
  }

  if (info.menuItemId === 'neuroglide-simplify' && info.selectionText) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SIMPLIFY_SELECTION',
        text: info.selectionText
      });
    } catch (err) {
      console.warn('Could not simplify:', err.message);
    }
  }

  if (info.menuItemId === 'neuroglide-explain' && info.selectionText) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'EXPLAIN_TERM',
        term: info.selectionText
      });
    } catch (err) {
      console.warn('Could not explain:', err.message);
    }
  }
});

// ─── Message Routing ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Forward content script analysis results to side panel
  if (message.type === 'ANALYSIS_RESULT') {
    (async () => {
      // Store latest analysis for the side panel to read
      await chrome.storage.session.set({
        latestAnalysis: message.data,
        analysisTabId: sender.tab?.id,
        analysisTimestamp: Date.now()
      });

      // Update analytics
      const { neuroglideAnalytics = {} } = await chrome.storage.local.get('neuroglideAnalytics');
      neuroglideAnalytics.pagesAnalyzed = (neuroglideAnalytics.pagesAnalyzed || 0) + 1;
      neuroglideAnalytics.totalScoreBefore = (neuroglideAnalytics.totalScoreBefore || 0) + (message.data.cognitiveLoad?.score || 0);

      // Keep last 50 pages in history
      const history = neuroglideAnalytics.pageHistory || [];
      history.unshift({
        url: sender.tab?.url || 'unknown',
        title: sender.tab?.title || 'Unknown Page',
        score: message.data.cognitiveLoad?.score || 0,
        factors: message.data.cognitiveLoad?.factors || {},
        timestamp: Date.now()
      });
      neuroglideAnalytics.pageHistory = history.slice(0, 50);

      await chrome.storage.local.set({ neuroglideAnalytics });
      sendResponse({ success: true });
    })();
    return true;
  }

  // Forward side panel commands to content script
  if (message.type === 'COMMAND_TO_CONTENT') {
    (async () => {
      const { analysisTabId } = await chrome.storage.session.get('analysisTabId');
      if (!analysisTabId) {
        // Try active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          try {
            const response = await chrome.tabs.sendMessage(tab.id, message.command);
            sendResponse(response);
          } catch (err) {
            sendResponse({ error: err.message });
          }
        }
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(analysisTabId, message.command);
        sendResponse(response);
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  // Get analytics data
  if (message.type === 'GET_ANALYTICS') {
    (async () => {
      const { neuroglideAnalytics = {} } = await chrome.storage.local.get('neuroglideAnalytics');
      sendResponse(neuroglideAnalytics);
    })();
    return true;
  }

  // Update user profile
  if (message.type === 'UPDATE_PROFILE') {
    (async () => {
      const { neuroglideProfile = {} } = await chrome.storage.local.get('neuroglideProfile');
      Object.assign(neuroglideProfile, message.updates);
      await chrome.storage.local.set({ neuroglideProfile });
      sendResponse({ success: true });
    })();
    return true;
  }

  // Get user profile
  if (message.type === 'GET_PROFILE') {
    (async () => {
      const { neuroglideProfile = {} } = await chrome.storage.local.get('neuroglideProfile');
      sendResponse(neuroglideProfile);
    })();
    return true;
  }
});

// ─── Tab Update Handler ──────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  // Clear stale analysis when tab navigates
  const { analysisTabId } = await chrome.storage.session.get('analysisTabId');
  if (tabId === analysisTabId) {
    await chrome.storage.session.remove(['latestAnalysis', 'analysisTimestamp']);
  }
});
