/**
 * NeuroGlide — Text Simplifier
 * Rewrites complex content into simpler language.
 * Uses Chrome's Prompt API when available, falls back to heuristic simplification.
 */

const NeuroGlideTextSimplifier = (() => {

  let _aiSession = null;

  /**
   * Simplify a block of text.
   * @param {string} text - Complex text to simplify
   * @param {string} targetLevel - 'simple' | 'standard' | 'detailed'
   * @returns {Promise<string>} Simplified text
   */
  async function simplifyText(text, targetLevel = 'simple') {
    if (!text || text.trim().length < 10) return text;

    if (await _isAIAvailable()) {
      try {
        return await _aiSimplify(text, targetLevel);
      } catch (err) {
        console.warn('AI simplification failed:', err.message);
      }
    }

    return _heuristicSimplify(text, targetLevel);
  }

  /**
   * Explain a technical term in plain language.
   * @param {string} term - The term to explain
   * @param {string} context - Surrounding text for context
   * @returns {Promise<string>} Plain-language explanation
   */
  async function explainTerm(term, context = '') {
    if (await _isAIAvailable()) {
      try {
        return await _aiExplain(term, context);
      } catch (err) {
        console.warn('AI explanation failed:', err.message);
      }
    }

    return _heuristicExplain(term);
  }

  // ─── AI-Powered Simplification ───────────────────────────────────
  async function _aiSimplify(text, targetLevel) {
    const session = await _getAISession();

    const levelInstructions = {
      simple: 'Use very short sentences (under 10 words each). Use everyday words a 10-year-old would understand. Remove all jargon.',
      standard: 'Use clear, concise sentences. Replace jargon with plain language. Keep it professional but accessible.',
      detailed: 'Simplify complex language but preserve important details. Add brief explanations for technical terms.'
    };

    const prompt = `Simplify this text for better accessibility.
Instructions: ${levelInstructions[targetLevel] || levelInstructions.standard}
Keep the same meaning. Do not add new information. Only output the simplified text.

Original text:
${text.slice(0, 1000)}`;

    return await session.prompt(prompt);
  }

  async function _aiExplain(term, context) {
    const session = await _getAISession();

    const prompt = `Explain the term "${term}" in one simple sentence that anyone can understand.
${context ? `Context: "${context.slice(0, 200)}"` : ''}
Only output the explanation, nothing else.`;

    return await session.prompt(prompt);
  }

  // ─── Heuristic Simplification ────────────────────────────────────
  function _heuristicSimplify(text, targetLevel) {
    let simplified = text;

    // Replace common complex words/phrases
    const replacements = [
      [/\bpursuant to\b/gi, 'following'],
      [/\bnotwithstanding\b/gi, 'despite'],
      [/\bhereinafter\b/gi, 'from now on'],
      [/\baforementioned\b/gi, 'mentioned earlier'],
      [/\bin accordance with\b/gi, 'following'],
      [/\bfor the purpose of\b/gi, 'to'],
      [/\bin the event that\b/gi, 'if'],
      [/\bwith respect to\b/gi, 'about'],
      [/\bin order to\b/gi, 'to'],
      [/\bdue to the fact that\b/gi, 'because'],
      [/\bat this point in time\b/gi, 'now'],
      [/\bprior to\b/gi, 'before'],
      [/\bsubsequent to\b/gi, 'after'],
      [/\butilize\b/gi, 'use'],
      [/\bfacilitate\b/gi, 'help'],
      [/\bcommence\b/gi, 'start'],
      [/\bterminate\b/gi, 'end'],
      [/\bindicate\b/gi, 'show'],
      [/\bsufficient\b/gi, 'enough'],
      [/\bapproximate(ly)?\b/gi, 'about'],
      [/\bin lieu of\b/gi, 'instead of'],
      [/\bascertain\b/gi, 'find out'],
      [/\bendeavor\b/gi, 'try'],
      [/\bnevertheless\b/gi, 'but'],
      [/\bfurthermore\b/gi, 'also'],
      [/\bconsequently\b/gi, 'so'],
      [/\bsubstantiate\b/gi, 'prove'],
      [/\bcompensation\b/gi, 'pay'],
      [/\bremuneration\b/gi, 'pay'],
      [/\bdiscrepancy\b/gi, 'difference'],
      [/\bmethodology\b/gi, 'method'],
      [/\bimplementation\b/gi, 'setup'],
      [/\brequirement\b/gi, 'what you need'],
      [/\bproceed\b/gi, 'go ahead'],
      [/\bascertain\b/gi, 'find out'],
      [/\bhereby\b/gi, 'by this'],
      [/\bthereof\b/gi, 'of it'],
      [/\btherein\b/gi, 'in it'],
      [/\bwhereby\b/gi, 'by which'],
      [/\bhereunder\b/gi, 'under this'],
    ];

    replacements.forEach(([pattern, replacement]) => {
      simplified = simplified.replace(pattern, replacement);
    });

    // Break very long sentences (over 30 words)
    if (targetLevel === 'simple') {
      simplified = _breakLongSentences(simplified);
    }

    return simplified;
  }

  function _breakLongSentences(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.map(sentence => {
      const words = sentence.trim().split(/\s+/);
      if (words.length <= 25) return sentence.trim();

      // Try to break at conjunctions or comma boundaries
      const breakPoints = [', and ', ', but ', ', however ', ', which ', '; ', ', or '];
      for (const bp of breakPoints) {
        const idx = sentence.indexOf(bp);
        if (idx > 15 && idx < sentence.length - 15) {
          return sentence.slice(0, idx + 1).trim() + '\n' +
                 sentence.slice(idx + bp.length).trim().charAt(0).toUpperCase() +
                 sentence.slice(idx + bp.length + 1).trim();
        }
      }

      return sentence.trim();
    }).join(' ');
  }

  // ─── Heuristic Term Explanation ──────────────────────────────────
  function _heuristicExplain(term) {
    const explanations = {
      'pursuant': 'Following a rule or agreement',
      'hereinafter': 'From this point forward in the document',
      'aforementioned': 'Something that was already mentioned',
      'notwithstanding': 'In spite of; even though',
      'indemnify': 'To promise to cover someone\'s losses or damages',
      'jurisdiction': 'The area or authority where laws apply',
      'authentication': 'Proving that you are who you say you are',
      'authorization': 'Getting permission to do something',
      'encryption': 'Scrambling data so only the right person can read it',
      'compliance': 'Following the rules and regulations',
      'fiduciary': 'Having a legal duty to act in someone\'s best interest',
      'amortization': 'Spreading the cost of something over time',
      'collateral': 'Something valuable you promise if you can\'t repay a loan',
      'deductible': 'The amount you pay before insurance starts paying',
      'copayment': 'A fixed amount you pay for a medical service',
      'prerequisite': 'Something you must complete before you can do the next thing',
      'prognosis': 'A prediction about how a medical condition will develop',
      'beneficiary': 'The person who receives benefits or money',
      'underwriting': 'Evaluating risk to decide whether to provide insurance or loans',
      'disbursement': 'A payment sent to someone',
      'matriculation': 'The process of enrolling in a university or college',
      'accreditation': 'Official recognition that an organization meets quality standards'
    };

    const key = term.toLowerCase().trim();
    return explanations[key] || `"${term}" is a specialized term. Look for more context on the page.`;
  }

  // ─── AI Session Management ──────────────────────────────────────
  async function _isAIAvailable() {
    try {
      if (typeof LanguageModel !== 'undefined' && LanguageModel.availability) {
        const availability = await LanguageModel.availability();
        return availability === 'available' || availability === 'downloadable';
      }
    } catch (e) { /* Not available */ }
    return false;
  }

  async function _getAISession() {
    if (_aiSession) return _aiSession;
    _aiSession = await LanguageModel.create({
      systemPrompt: 'You are a plain-language translator. Make complex text easy to understand. Be concise.'
    });
    return _aiSession;
  }

  return { simplifyText, explainTerm };
})();

if (typeof window !== 'undefined') {
  window.NeuroGlideTextSimplifier = NeuroGlideTextSimplifier;
}
