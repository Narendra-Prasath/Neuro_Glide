/**
 * NeuroGlide — Task Intent Engine
 * Understands the user's goal and creates a task plan based on page structure.
 * Uses Chrome's built-in Prompt API (LanguageModel) when available, falls back to heuristics.
 */

const NeuroGlideTaskIntent = (() => {

  let _aiSession = null;

  /**
   * Parse the user's stated goal and generate a step-by-step task plan.
   * @param {string} userGoal - What the user wants to accomplish
   * @param {Object} pageData - Output from DOM analyzer
   * @returns {Promise<Object>} { steps[], relevantElements[], summary }
   */
  async function parseTaskIntent(userGoal, pageData) {
    if (!userGoal || !userGoal.trim()) {
      return { steps: [], relevantElements: [], summary: 'Please describe what you want to accomplish.' };
    }

    const pageContext = _buildPageContext(pageData);

    // Try AI-powered understanding first
    if (await _isAIAvailable()) {
      try {
        return await _aiParseIntent(userGoal, pageContext, pageData);
      } catch (err) {
        console.warn('NeuroGlide AI intent failed, using heuristics:', err.message);
      }
    }

    // Fallback to heuristic-based intent parsing
    return _heuristicParseIntent(userGoal, pageData);
  }

  // ─── AI-Powered Intent Parsing ───────────────────────────────────
  async function _aiParseIntent(userGoal, pageContext, pageData) {
    const session = await _getAISession();

    const prompt = `You are NeuroGlide, a cognitive accessibility assistant. A user is on a webpage and needs help.

PAGE CONTEXT:
${pageContext}

USER'S GOAL: "${userGoal}"

Generate a numbered step-by-step plan (max 8 steps) to help the user accomplish their goal on this page.
Each step should be short (under 15 words), specific, and actionable.
If a step involves a form field or button, mention its label.
If the goal seems impossible on this page, say so and suggest what the user might look for.

Respond in this exact JSON format:
{
  "summary": "One sentence summary of the task",
  "steps": ["Step 1 text", "Step 2 text", ...],
  "relevantSections": ["section names or IDs that are relevant"]
}`;

    const response = await session.prompt(prompt);

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const relevantElements = _findRelevantElements(parsed.relevantSections || [], pageData);
        return {
          steps: (parsed.steps || []).map((text, i) => ({
            number: i + 1,
            text: text,
            completed: false,
            elementHint: null
          })),
          relevantElements: relevantElements,
          summary: parsed.summary || `Plan for: ${userGoal}`
        };
      }
    } catch (e) {
      // JSON parse failed, extract steps from plain text
    }

    // Fallback: parse numbered list from response
    const lines = response.split('\n').filter(l => l.match(/^\d+[\.\)]/));
    return {
      steps: lines.map((text, i) => ({
        number: i + 1,
        text: text.replace(/^\d+[\.\)]\s*/, '').trim(),
        completed: false,
        elementHint: null
      })),
      relevantElements: [],
      summary: `Plan for: ${userGoal}`
    };
  }

  // ─── Heuristic Intent Parsing ────────────────────────────────────
  function _heuristicParseIntent(userGoal, pageData) {
    const goal = userGoal.toLowerCase();
    const steps = [];

    // Detect intent patterns
    const isFormTask = goal.match(/\b(apply|register|sign up|submit|fill|complete|enroll|create account)\b/);
    const isSearchTask = goal.match(/\b(find|search|look for|locate|where)\b/);
    const isPaymentTask = goal.match(/\b(pay|purchase|buy|checkout|order|subscribe)\b/);
    const isInfoTask = goal.match(/\b(learn|understand|read|information|about|details|check|view|see)\b/);
    const isLoginTask = goal.match(/\b(log in|login|sign in|signin|access|authenticate)\b/);

    if (isFormTask && pageData.forms.length > 0) {
      const form = pageData.forms[0];
      steps.push({ number: 1, text: 'Locate the relevant form on the page', completed: false });

      // Group fields logically
      const groups = _groupFormFields(form.fields);
      groups.forEach((group, i) => {
        const labels = group.map(f => f.label || f.name).filter(Boolean).join(', ');
        steps.push({
          number: steps.length + 1,
          text: `Fill in: ${labels || 'required fields'}`,
          completed: false,
          elementHint: group[0]?.element
        });
      });

      steps.push({
        number: steps.length + 1,
        text: 'Review all information for accuracy',
        completed: false
      });
      steps.push({
        number: steps.length + 1,
        text: 'Submit the form',
        completed: false
      });

    } else if (isSearchTask) {
      steps.push({ number: 1, text: 'Look for a search bar or search button', completed: false });
      steps.push({ number: 2, text: 'Type your search query', completed: false });
      steps.push({ number: 3, text: 'Review the search results', completed: false });
      steps.push({ number: 4, text: 'Click on the most relevant result', completed: false });

    } else if (isPaymentTask) {
      steps.push({ number: 1, text: 'Find the item or service you want', completed: false });
      steps.push({ number: 2, text: 'Add it to your cart or selection', completed: false });
      steps.push({ number: 3, text: 'Proceed to checkout', completed: false });
      steps.push({ number: 4, text: 'Enter payment information', completed: false });
      steps.push({ number: 5, text: 'Review your order details', completed: false });
      steps.push({ number: 6, text: 'Confirm and submit payment', completed: false });

    } else if (isLoginTask) {
      steps.push({ number: 1, text: 'Find the login or sign-in section', completed: false });
      steps.push({ number: 2, text: 'Enter your email or username', completed: false });
      steps.push({ number: 3, text: 'Enter your password', completed: false });
      steps.push({ number: 4, text: 'Click the sign-in button', completed: false });

    } else if (isInfoTask) {
      steps.push({ number: 1, text: 'Scan the main headings to find relevant sections', completed: false });

      const relevantHeadings = pageData.headings.filter(h =>
        goal.split(/\s+/).some(word => h.text.toLowerCase().includes(word))
      );

      if (relevantHeadings.length > 0) {
        steps.push({
          number: 2,
          text: `Check section: "${relevantHeadings[0].text}"`,
          completed: false,
          elementHint: relevantHeadings[0].element
        });
      }

      steps.push({
        number: steps.length + 1,
        text: 'Read the relevant content carefully',
        completed: false
      });
      steps.push({
        number: steps.length + 1,
        text: 'Note down any important information',
        completed: false
      });

    } else {
      // Generic task plan
      steps.push({ number: 1, text: 'Read the main heading to confirm you\'re on the right page', completed: false });
      steps.push({ number: 2, text: 'Scan the page for sections related to your goal', completed: false });
      steps.push({ number: 3, text: 'Click on the most relevant section or link', completed: false });
      steps.push({ number: 4, text: 'Follow any instructions provided', completed: false });
      steps.push({ number: 5, text: 'Complete any required forms or actions', completed: false });
    }

    return {
      steps: steps,
      relevantElements: [],
      summary: `Task plan for: ${userGoal}`
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────
  function _buildPageContext(pageData) {
    const parts = [];
    parts.push(`Title: ${pageData.meta?.title || 'Unknown'}`);
    parts.push(`URL: ${pageData.meta?.url || 'Unknown'}`);

    if (pageData.headings.length > 0) {
      parts.push(`Headings: ${pageData.headings.slice(0, 10).map(h => `H${h.level}: ${h.text}`).join(' | ')}`);
    }

    if (pageData.forms.length > 0) {
      parts.push(`Forms: ${pageData.forms.length} form(s) with fields: ${
        pageData.forms.flatMap(f => f.fields.map(field => field.label || field.name)).filter(Boolean).slice(0, 15).join(', ')
      }`);
    }

    if (pageData.buttons.length > 0) {
      parts.push(`Buttons: ${pageData.buttons.slice(0, 10).map(b => b.text).filter(Boolean).join(', ')}`);
    }

    if (pageData.navigation.length > 0) {
      parts.push(`Navigation: ${pageData.navigation[0].text.slice(0, 10).join(', ')}`);
    }

    return parts.join('\n');
  }

  function _groupFormFields(fields) {
    const groups = [];
    let currentGroup = [];
    const GROUP_SIZE = 3;

    fields.forEach((field, i) => {
      currentGroup.push(field);
      if (currentGroup.length >= GROUP_SIZE || i === fields.length - 1) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
    });

    return groups;
  }

  function _findRelevantElements(sectionNames, pageData) {
    if (!sectionNames || sectionNames.length === 0) return [];

    return pageData.semanticSections
      .filter(s => sectionNames.some(name =>
        s.id?.toLowerCase().includes(name.toLowerCase()) ||
        s.tag?.toLowerCase().includes(name.toLowerCase())
      ))
      .map(s => s.element)
      .filter(Boolean);
  }

  async function _isAIAvailable() {
    try {
      if (typeof LanguageModel !== 'undefined' && LanguageModel.availability) {
        const availability = await LanguageModel.availability();
        return availability === 'available' || availability === 'downloadable';
      }
    } catch (e) {
      // Not available
    }
    return false;
  }

  async function _getAISession() {
    if (_aiSession) return _aiSession;
    _aiSession = await LanguageModel.create({
      systemPrompt: 'You are NeuroGlide, a cognitive accessibility assistant that helps people navigate complex websites. Always respond with clear, actionable guidance.'
    });
    return _aiSession;
  }

  return { parseTaskIntent };
})();

if (typeof window !== 'undefined') {
  window.NeuroGlideTaskIntent = NeuroGlideTaskIntent;
}
