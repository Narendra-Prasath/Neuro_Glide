/**
 * NeuroGlide — Cognitive Load Scoring Engine
 * Measures webpage difficulty with an explainable score out of 100.
 * Higher score = more difficult = more cognitive load.
 */

const NeuroGlideCognitiveLoad = (() => {

  // ─── Jargon / Technical Terms Dictionary ──────────────────────────
  const TECHNICAL_TERMS = new Set([
    'pursuant', 'hereinafter', 'aforementioned', 'notwithstanding', 'heretofore',
    'thereof', 'therein', 'wherein', 'whereby', 'hereunder', 'indemnify',
    'indemnification', 'arbitration', 'adjudication', 'stipulation',
    'jurisdiction', 'subpoena', 'affidavit', 'deposition', 'plaintiff',
    'defendant', 'appellant', 'appellee', 'amicus', 'certiorari',
    'authentication', 'authorization', 'encryption', 'decryption', 'protocol',
    'middleware', 'api', 'sdk', 'deprecated', 'polymorphism', 'asynchronous',
    'synchronous', 'serialization', 'deserialization', 'instantiation',
    'algorithm', 'heuristic', 'paradigm', 'methodology', 'implementation',
    'infrastructure', 'scalability', 'interoperability', 'compliance',
    'fiduciary', 'amortization', 'depreciation', 'collateral', 'derivative',
    'equity', 'liability', 'disbursement', 'remittance', 'beneficiary',
    'underwriting', 'premium', 'deductible', 'copayment', 'coinsurance',
    'formulary', 'preauthorization', 'prerequisite', 'corequisite',
    'matriculation', 'accreditation', 'prognosis', 'contraindication',
    'pharmacokinetics', 'bioavailability', 'comorbidity', 'etiology',
    'pathogenesis', 'prophylaxis', 'idiopathic', 'parenchyma',
    'cryptocurrency', 'blockchain', 'tokenization', 'decentralized',
    'smart contract', 'governance', 'referendum', 'statutory',
    'promulgate', 'supersede', 'ratify', 'rescind', 'annex'
  ]);

  /**
   * Calculate cognitive load score from page analysis data.
   * @param {Object} pageData - Output from NeuroGlideDOMAnalyzer.analyzePage()
   * @returns {Object} { score, grade, factors, sectionScores, recommendations }
   */
  function calculateCognitiveLoad(pageData) {
    const factors = {};
    let totalWeight = 0;
    let weightedScore = 0;

    // ─── Factor 1: Interactive Element Density ───────────────────
    const interactiveCount = pageData.stats?.interactiveElements || 0;
    const interactiveScore = _clamp(_mapRange(interactiveCount, 5, 60, 0, 100));
    factors.interactiveElements = {
      label: 'Interactive Elements',
      count: interactiveCount,
      score: interactiveScore,
      weight: 15,
      description: `${interactiveCount} clickable elements (buttons, links, inputs)`,
      recommendation: interactiveCount > 30 ? 'Too many choices can overwhelm users' : null
    };
    weightedScore += interactiveScore * 15;
    totalWeight += 15;

    // ─── Factor 2: Navigation Choices ────────────────────────────
    const navChoices = pageData.navigation?.reduce((sum, nav) => sum + nav.linkCount, 0) || 0;
    const navScore = _clamp(_mapRange(navChoices, 3, 30, 0, 100));
    factors.navigationChoices = {
      label: 'Navigation Choices',
      count: navChoices,
      score: navScore,
      weight: 12,
      description: `${navChoices} navigation links to decide between`,
      recommendation: navChoices > 15 ? 'Consider simplifying navigation' : null
    };
    weightedScore += navScore * 12;
    totalWeight += 12;

    // ─── Factor 3: Form Field Count ──────────────────────────────
    const totalFields = pageData.forms?.reduce((sum, f) => sum + f.fieldCount, 0) || 0;
    const formScore = _clamp(_mapRange(totalFields, 3, 25, 0, 100));
    factors.formFields = {
      label: 'Form Fields',
      count: totalFields,
      score: formScore,
      weight: 18,
      description: `${totalFields} form fields to complete`,
      recommendation: totalFields > 10 ? 'Long forms increase drop-off rate' : null
    };
    weightedScore += formScore * 18;
    totalWeight += 18;

    // ─── Factor 4: Long Sentences ────────────────────────────────
    const textBlocks = pageData.textBlocks || [];
    const longSentences = textBlocks.filter(b => b.avgSentenceLength > 20).length;
    const totalSentences = textBlocks.reduce((sum, b) => sum + b.sentenceCount, 0);
    const longSentenceRatio = totalSentences > 0 ? longSentences / Math.max(textBlocks.length, 1) : 0;
    const sentenceScore = _clamp(longSentenceRatio * 100);
    factors.longSentences = {
      label: 'Long Sentences',
      count: longSentences,
      total: textBlocks.length,
      score: sentenceScore,
      weight: 15,
      description: `${longSentences} of ${textBlocks.length} text blocks have long sentences (avg >20 words)`,
      recommendation: longSentences > 5 ? 'Shorter sentences improve comprehension' : null
    };
    weightedScore += sentenceScore * 15;
    totalWeight += 15;

    // ─── Factor 5: Technical Terms / Jargon ──────────────────────
    const allText = (document.body?.textContent || '').toLowerCase();
    const words = allText.split(/\s+/);
    let technicalCount = 0;
    const foundTerms = new Set();
    words.forEach(word => {
      const cleaned = word.replace(/[^a-z]/g, '');
      if (TECHNICAL_TERMS.has(cleaned) && !foundTerms.has(cleaned)) {
        technicalCount++;
        foundTerms.add(cleaned);
      }
    });
    const jargonScore = _clamp(_mapRange(technicalCount, 2, 15, 0, 100));
    factors.technicalTerms = {
      label: 'Technical Terms',
      count: technicalCount,
      terms: Array.from(foundTerms).slice(0, 10),
      score: jargonScore,
      weight: 15,
      description: `${technicalCount} technical or jargon terms found`,
      recommendation: technicalCount > 5 ? 'Explain technical terms in plain language' : null
    };
    weightedScore += jargonScore * 15;
    totalWeight += 15;

    // ─── Factor 6: Visual Complexity ─────────────────────────────
    const domDepth = pageData.stats?.domDepth || 0;
    const elementCount = pageData.stats?.totalElements || 0;
    const visualComplexity = _clamp(_mapRange(elementCount, 100, 2000, 0, 100));
    factors.visualComplexity = {
      label: 'Visual Complexity',
      count: elementCount,
      score: visualComplexity,
      weight: 10,
      description: `${elementCount} DOM elements, ${domDepth} levels deep`,
      recommendation: elementCount > 1000 ? 'Page has very high visual density' : null
    };
    weightedScore += visualComplexity * 10;
    totalWeight += 10;

    // ─── Factor 7: Information Density ───────────────────────────
    const textLength = pageData.stats?.totalTextLength || 0;
    const densityScore = _clamp(_mapRange(textLength, 500, 10000, 0, 100));
    factors.informationDensity = {
      label: 'Information Density',
      count: textLength,
      score: densityScore,
      weight: 15,
      description: `${textLength.toLocaleString()} characters of content`,
      recommendation: textLength > 8000 ? 'Consider breaking content into smaller sections' : null
    };
    weightedScore += densityScore * 15;
    totalWeight += 15;

    // ─── Calculate Final Score ───────────────────────────────────
    const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
    const grade = _getGrade(score);

    // ─── Section-Level Scores (for Heatmap) ──────────────────────
    const sectionScores = _calculateSectionScores(pageData);

    // ─── Recommendations ─────────────────────────────────────────
    const recommendations = Object.values(factors)
      .filter(f => f.recommendation)
      .map(f => ({ factor: f.label, recommendation: f.recommendation, score: f.score }))
      .sort((a, b) => b.score - a.score);

    return { score, grade, factors, sectionScores, recommendations };
  }

  /**
   * Calculate per-section cognitive load scores for heatmap.
   */
  function _calculateSectionScores(pageData) {
    const sections = [];
    const allSections = pageData.semanticSections || [];

    allSections.forEach(section => {
      const el = section.element;
      if (!el) return;

      // Count interactive elements in this section
      const interactive = el.querySelectorAll('a, button, input, select, textarea').length;
      // Count form fields
      const fields = el.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
      // Text complexity
      const text = el.textContent.trim();
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
      const avgLen = sentences.length > 0
        ? sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length
        : 0;

      // Calculate section score
      let sScore = 0;
      sScore += _clamp(_mapRange(interactive, 3, 20, 0, 100)) * 0.3;
      sScore += _clamp(_mapRange(fields, 2, 15, 0, 100)) * 0.3;
      sScore += _clamp(_mapRange(avgLen, 10, 30, 0, 100)) * 0.2;
      sScore += _clamp(_mapRange(text.length, 200, 3000, 0, 100)) * 0.2;

      const difficulty = sScore < 33 ? 'easy' : sScore < 66 ? 'medium' : 'hard';

      sections.push({
        tag: section.tag,
        id: section.id,
        score: Math.round(sScore),
        difficulty: difficulty,
        element: el
      });
    });

    return sections;
  }

  // ─── Utilities ───────────────────────────────────────────────────
  function _clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  function _mapRange(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
  }

  function _getGrade(score) {
    if (score <= 20) return { label: 'Very Easy', color: '#10B981', emoji: '🟢' };
    if (score <= 40) return { label: 'Easy', color: '#34D399', emoji: '🟢' };
    if (score <= 55) return { label: 'Moderate', color: '#FBBF24', emoji: '🟡' };
    if (score <= 70) return { label: 'Difficult', color: '#F97316', emoji: '🟠' };
    if (score <= 85) return { label: 'Very Difficult', color: '#EF4444', emoji: '🔴' };
    return { label: 'Extremely Difficult', color: '#DC2626', emoji: '🔴' };
  }

  return { calculateCognitiveLoad };
})();

if (typeof window !== 'undefined') {
  window.NeuroGlideCognitiveLoad = NeuroGlideCognitiveLoad;
}
