/**
 * NeuroGlide — Multilingual Task Guidance
 * Goes beyond translation by explaining what the user needs to do in their preferred language.
 * Uses Chrome's Prompt API for contextual translation, falls back to basic translations.
 */

const NeuroGlideMultilingual = (() => {

  let _aiSession = null;

  const SUPPORTED_LANGUAGES = {
    en: { name: 'English', nativeName: 'English' },
    es: { name: 'Spanish', nativeName: 'Español' },
    fr: { name: 'French', nativeName: 'Français' },
    de: { name: 'German', nativeName: 'Deutsch' },
    hi: { name: 'Hindi', nativeName: 'हिन्दी' },
    ar: { name: 'Arabic', nativeName: 'العربية', rtl: true },
    zh: { name: 'Chinese', nativeName: '中文' },
    ja: { name: 'Japanese', nativeName: '日本語' },
    pt: { name: 'Portuguese', nativeName: 'Português' },
    ko: { name: 'Korean', nativeName: '한국어' },
    ta: { name: 'Tamil', nativeName: 'தமிழ்' },
    te: { name: 'Telugu', nativeName: 'తెలుగు' },
    bn: { name: 'Bengali', nativeName: 'বাংলা' }
  };

  // Common UI labels translated for offline fallback
  const COMMON_LABELS = {
    es: {
      'Next': 'Siguiente', 'Previous': 'Anterior', 'Submit': 'Enviar',
      'Required': 'Obligatorio', 'Step': 'Paso', 'of': 'de',
      'Please fill in': 'Por favor complete', 'Review': 'Revisar',
      'Your Name': 'Su Nombre', 'Email': 'Correo electrónico',
      'Phone': 'Teléfono', 'Address': 'Dirección', 'Password': 'Contraseña',
      'Cognitive Load Score': 'Puntuación de Carga Cognitiva',
      'Easy': 'Fácil', 'Medium': 'Medio', 'Hard': 'Difícil',
      'Focus Mode': 'Modo Enfoque', 'Guided Form': 'Formulario Guiado'
    },
    fr: {
      'Next': 'Suivant', 'Previous': 'Précédent', 'Submit': 'Soumettre',
      'Required': 'Obligatoire', 'Step': 'Étape', 'of': 'de',
      'Please fill in': 'Veuillez remplir', 'Review': 'Vérifier',
      'Your Name': 'Votre Nom', 'Email': 'E-mail',
      'Phone': 'Téléphone', 'Address': 'Adresse', 'Password': 'Mot de passe',
      'Cognitive Load Score': 'Score de Charge Cognitive',
      'Easy': 'Facile', 'Medium': 'Moyen', 'Hard': 'Difficile',
      'Focus Mode': 'Mode Concentration', 'Guided Form': 'Formulaire Guidé'
    },
    de: {
      'Next': 'Weiter', 'Previous': 'Zurück', 'Submit': 'Absenden',
      'Required': 'Erforderlich', 'Step': 'Schritt', 'of': 'von',
      'Please fill in': 'Bitte ausfüllen', 'Review': 'Überprüfen',
      'Your Name': 'Ihr Name', 'Email': 'E-Mail',
      'Phone': 'Telefon', 'Address': 'Adresse', 'Password': 'Passwort',
      'Cognitive Load Score': 'Kognitive Belastung',
      'Easy': 'Einfach', 'Medium': 'Mittel', 'Hard': 'Schwer',
      'Focus Mode': 'Fokusmodus', 'Guided Form': 'Geführtes Formular'
    },
    hi: {
      'Next': 'अगला', 'Previous': 'पिछला', 'Submit': 'जमा करें',
      'Required': 'आवश्यक', 'Step': 'चरण', 'of': 'का',
      'Please fill in': 'कृपया भरें', 'Review': 'समीक्षा करें',
      'Your Name': 'आपका नाम', 'Email': 'ईमेल',
      'Phone': 'फ़ोन', 'Address': 'पता', 'Password': 'पासवर्ड',
      'Cognitive Load Score': 'संज्ञानात्मक भार स्कोर',
      'Easy': 'आसान', 'Medium': 'मध्यम', 'Hard': 'कठिन',
      'Focus Mode': 'फोकस मोड', 'Guided Form': 'गाइडेड फॉर्म'
    },
    ar: {
      'Next': 'التالي', 'Previous': 'السابق', 'Submit': 'إرسال',
      'Required': 'مطلوب', 'Step': 'خطوة', 'of': 'من',
      'Please fill in': 'يرجى ملء', 'Review': 'مراجعة',
      'Your Name': 'اسمك', 'Email': 'البريد الإلكتروني',
      'Phone': 'هاتف', 'Address': 'العنوان', 'Password': 'كلمة المرور',
      'Cognitive Load Score': 'درجة الحمل المعرفي',
      'Easy': 'سهل', 'Medium': 'متوسط', 'Hard': 'صعب',
      'Focus Mode': 'وضع التركيز', 'Guided Form': 'نموذج موجه'
    }
  };

  /**
   * Translate and contextualize task guidance steps.
   * @param {Array} steps - Array of { number, text } step objects
   * @param {string} targetLang - ISO 639-1 language code
   * @returns {Promise<Array>} Translated and contextualized steps
   */
  async function translateTaskGuidance(steps, targetLang) {
    if (!steps || steps.length === 0) return steps;
    if (targetLang === 'en') return steps;

    if (await _isAIAvailable()) {
      try {
        return await _aiTranslateSteps(steps, targetLang);
      } catch (err) {
        console.warn('AI translation failed:', err.message);
      }
    }

    // Fallback: return original steps with a note
    return steps.map(step => ({
      ...step,
      translatedText: step.text,
      languageNote: `Translation to ${SUPPORTED_LANGUAGES[targetLang]?.name || targetLang} requires AI features.`
    }));
  }

  /**
   * Translate a single UI label.
   * @param {string} label - English label
   * @param {string} targetLang - ISO 639-1 language code
   * @returns {string} Translated label (or original if unavailable)
   */
  function translateLabel(label, targetLang) {
    if (targetLang === 'en') return label;
    const langLabels = COMMON_LABELS[targetLang];
    if (langLabels && langLabels[label]) return langLabels[label];
    return label;
  }

  /**
   * Get list of supported languages.
   * @returns {Object} Map of language codes to language info
   */
  function getSupportedLanguages() {
    return { ...SUPPORTED_LANGUAGES };
  }

  // ─── AI Translation ──────────────────────────────────────────────
  async function _aiTranslateSteps(steps, targetLang) {
    const session = await _getAISession();
    const langName = SUPPORTED_LANGUAGES[targetLang]?.name || targetLang;

    const stepsText = steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n');

    const prompt = `Translate these task steps to ${langName}. 
Don't just translate — also adapt cultural context if needed.
Keep the same numbering. Output ONLY the translated steps, one per line.

Steps:
${stepsText}`;

    const response = await session.prompt(prompt);
    const translatedLines = response.split('\n').filter(l => l.match(/^\d+[\.\)]/));

    return steps.map((step, i) => ({
      ...step,
      translatedText: translatedLines[i]
        ? translatedLines[i].replace(/^\d+[\.\)]\s*/, '').trim()
        : step.text,
      originalText: step.text
    }));
  }

  // ─── AI Session ──────────────────────────────────────────────────
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
      systemPrompt: 'You are a multilingual accessibility assistant. Translate and adapt content for different languages while maintaining clarity and simplicity.'
    });
    return _aiSession;
  }

  return { translateTaskGuidance, translateLabel, getSupportedLanguages };
})();

if (typeof window !== 'undefined') {
  window.NeuroGlideMultilingual = NeuroGlideMultilingual;
}
