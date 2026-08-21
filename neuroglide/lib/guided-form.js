/**
 * NeuroGlide — Guided Form Mode
 * Converts long, complicated forms into one-question-at-a-time steps.
 * Ideal for government, banking, insurance, healthcare, university and job applications.
 */

const NeuroGlideGuidedForm = (() => {

  let _activeForm = null;
  let _currentStep = 0;
  let _steps = [];
  let _overlay = null;

  /**
   * Decompose a form into guided steps.
   * @param {HTMLFormElement} formElement - The form to guide through
   * @returns {Object} { steps[], totalFields, groups[] }
   */
  function decomposeForm(formElement) {
    if (!formElement) return { steps: [], totalFields: 0, groups: [] };

    const fields = _extractVisibleFields(formElement);
    const groups = _groupRelatedFields(fields);
    const steps = groups.map((group, i) => ({
      number: i + 1,
      fields: group,
      label: _generateGroupLabel(group),
      completed: false,
      hasErrors: false
    }));

    return { steps, totalFields: fields.length, groups };
  }

  /**
   * Activate guided form mode on a specific form.
   * @param {HTMLFormElement} formElement
   */
  function activate(formElement) {
    if (_activeForm) deactivate();

    const { steps } = decomposeForm(formElement);
    if (steps.length === 0) return;

    _activeForm = formElement;
    _steps = steps;
    _currentStep = 0;

    // Hide the original form fields and show the guided overlay
    _createOverlay();
    _showStep(0);

    // Prevent default form submission and add our validation
    _activeForm.addEventListener('submit', _handleSubmit, true);
  }

  /**
   * Deactivate guided form mode.
   */
  function deactivate() {
    if (_overlay) {
      _overlay.remove();
      _overlay = null;
    }
    if (_activeForm) {
      _activeForm.removeEventListener('submit', _handleSubmit, true);
      // Show all fields again
      _activeForm.querySelectorAll('.neuroglide-field-hidden').forEach(el => {
        el.classList.remove('neuroglide-field-hidden');
      });
      _activeForm = null;
    }
    _steps = [];
    _currentStep = 0;
  }

  /**
   * Check if guided form mode is active.
   */
  function isActive() {
    return _activeForm !== null;
  }

  // ─── Field Extraction ──────────────────────────────────────────
  function _extractVisibleFields(form) {
    const fields = [];
    const inputs = form.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), ' +
      'select, textarea'
    );

    inputs.forEach(input => {
      const style = getComputedStyle(input);
      if (style.display === 'none' || style.visibility === 'hidden') return;

      const label = _findFieldLabel(input, form);
      fields.push({
        element: input,
        type: input.type || input.tagName.toLowerCase(),
        name: input.name || '',
        id: input.id || '',
        label: label,
        required: input.required || input.hasAttribute('aria-required'),
        placeholder: input.placeholder || '',
        helpText: _findHelpText(input)
      });
    });

    return fields;
  }

  function _findFieldLabel(input, form) {
    if (input.id) {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label) return label.textContent.trim();
    }
    const parentLabel = input.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
      return clone.textContent.trim();
    }
    return input.getAttribute('aria-label') || input.placeholder || input.name || 'Field';
  }

  function _findHelpText(input) {
    const describedBy = input.getAttribute('aria-describedby');
    if (describedBy) {
      const el = document.getElementById(describedBy);
      if (el) return el.textContent.trim();
    }
    // Check for sibling help text
    const next = input.nextElementSibling;
    if (next && (next.classList.contains('help') || next.classList.contains('hint') ||
        next.classList.contains('description') || next.tagName === 'SMALL')) {
      return next.textContent.trim();
    }
    return '';
  }

  // ─── Field Grouping ────────────────────────────────────────────
  function _groupRelatedFields(fields) {
    const groups = [];
    let currentGroup = [];
    let currentCategory = '';

    fields.forEach(field => {
      const category = _categorizeField(field);

      if (category !== currentCategory && currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }

      currentGroup.push(field);
      currentCategory = category;

      // Also split if group gets too large
      if (currentGroup.length >= 4) {
        groups.push([...currentGroup]);
        currentGroup = [];
        currentCategory = '';
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  function _categorizeField(field) {
    const name = (field.name + ' ' + field.label + ' ' + field.id).toLowerCase();

    if (name.match(/name|first|last|middle|salutation|title/)) return 'name';
    if (name.match(/email|mail/)) return 'contact';
    if (name.match(/phone|tel|mobile|fax/)) return 'contact';
    if (name.match(/address|street|city|state|zip|postal|country|apt|suite/)) return 'address';
    if (name.match(/password|confirm|secret/)) return 'security';
    if (name.match(/date|birth|dob|age|year|month|day/)) return 'dates';
    if (name.match(/card|cvv|expiry|billing|payment/)) return 'payment';
    if (name.match(/upload|file|attachment|document|resume|cv/)) return 'documents';
    return 'other';
  }

  function _generateGroupLabel(group) {
    if (group.length === 0) return 'Information';

    const category = _categorizeField(group[0]);
    const labels = {
      name: '👤 Your Name',
      contact: '📧 Contact Information',
      address: '📍 Address',
      security: '🔒 Security',
      dates: '📅 Dates',
      payment: '💳 Payment',
      documents: '📎 Documents',
      other: '📝 Additional Information'
    };

    return labels[category] || '📝 Information';
  }

  // ─── Overlay UI ────────────────────────────────────────────────
  function _createOverlay() {
    _overlay = document.createElement('div');
    _overlay.className = 'neuroglide-guided-form-overlay';
    _overlay.innerHTML = `
      <div class="neuroglide-gf-container">
        <div class="neuroglide-gf-header">
          <div class="neuroglide-gf-logo">✦ NeuroGlide</div>
          <div class="neuroglide-gf-progress">
            <div class="neuroglide-gf-progress-bar">
              <div class="neuroglide-gf-progress-fill" style="width: 0%"></div>
            </div>
            <span class="neuroglide-gf-progress-text">Step 1 of ${_steps.length}</span>
          </div>
          <button class="neuroglide-gf-close" title="Exit Guided Mode">✕</button>
        </div>
        <div class="neuroglide-gf-step-label"></div>
        <div class="neuroglide-gf-fields-container"></div>
        <div class="neuroglide-gf-help"></div>
        <div class="neuroglide-gf-nav">
          <button class="neuroglide-gf-btn neuroglide-gf-prev" disabled>← Previous</button>
          <button class="neuroglide-gf-btn neuroglide-gf-next">Next →</button>
        </div>
      </div>
    `;

    // Position near the form
    const formRect = _activeForm.getBoundingClientRect();
    _overlay.style.top = `${window.scrollY + formRect.top}px`;

    document.body.appendChild(_overlay);

    // Event listeners
    _overlay.querySelector('.neuroglide-gf-close').addEventListener('click', deactivate);
    _overlay.querySelector('.neuroglide-gf-prev').addEventListener('click', () => _goToStep(_currentStep - 1));
    _overlay.querySelector('.neuroglide-gf-next').addEventListener('click', () => _goToStep(_currentStep + 1));

    // Hide original form fields
    _activeForm.querySelectorAll('input, select, textarea, label, fieldset, .form-group, .form-field')
      .forEach(el => el.classList.add('neuroglide-field-hidden'));
  }

  function _showStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= _steps.length) return;

    _currentStep = stepIndex;
    const step = _steps[stepIndex];

    // Update progress
    const progress = ((stepIndex + 1) / _steps.length) * 100;
    _overlay.querySelector('.neuroglide-gf-progress-fill').style.width = `${progress}%`;
    _overlay.querySelector('.neuroglide-gf-progress-text').textContent = `Step ${stepIndex + 1} of ${_steps.length}`;

    // Update step label
    _overlay.querySelector('.neuroglide-gf-step-label').textContent = step.label;

    // Update fields container
    const container = _overlay.querySelector('.neuroglide-gf-fields-container');
    container.innerHTML = '';

    step.fields.forEach(field => {
      const fieldWrapper = document.createElement('div');
      fieldWrapper.className = 'neuroglide-gf-field';

      const label = document.createElement('label');
      label.className = 'neuroglide-gf-label';
      label.textContent = field.label;
      if (field.required) {
        const req = document.createElement('span');
        req.className = 'neuroglide-gf-required';
        req.textContent = ' *';
        label.appendChild(req);
      }

      // Clone the original input into our overlay
      const inputClone = field.element.cloneNode(true);
      inputClone.className = 'neuroglide-gf-input ' + (inputClone.className || '');
      inputClone.classList.remove('neuroglide-field-hidden');

      // Sync value from clone back to original
      inputClone.addEventListener('input', (e) => {
        field.element.value = e.target.value;
        field.element.dispatchEvent(new Event('input', { bubbles: true }));
        field.element.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Copy current value
      inputClone.value = field.element.value;

      fieldWrapper.appendChild(label);
      fieldWrapper.appendChild(inputClone);

      if (field.helpText) {
        const help = document.createElement('div');
        help.className = 'neuroglide-gf-field-help';
        help.textContent = field.helpText;
        fieldWrapper.appendChild(help);
      }

      container.appendChild(fieldWrapper);
    });

    // Focus first input
    const firstInput = container.querySelector('input, select, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);

    // Update navigation buttons
    const prevBtn = _overlay.querySelector('.neuroglide-gf-prev');
    const nextBtn = _overlay.querySelector('.neuroglide-gf-next');
    prevBtn.disabled = stepIndex === 0;

    if (stepIndex === _steps.length - 1) {
      nextBtn.textContent = '✓ Submit';
      nextBtn.classList.add('neuroglide-gf-submit');
    } else {
      nextBtn.textContent = 'Next →';
      nextBtn.classList.remove('neuroglide-gf-submit');
    }

    // Show help text
    const helpArea = _overlay.querySelector('.neuroglide-gf-help');
    const helpTexts = step.fields.filter(f => f.helpText).map(f => f.helpText);
    helpArea.textContent = helpTexts.length > 0 ? `💡 ${helpTexts[0]}` : '';
  }

  function _goToStep(stepIndex) {
    if (stepIndex < 0) return;

    // If going forward, validate current step
    if (stepIndex > _currentStep) {
      const currentFields = _steps[_currentStep].fields;
      const invalid = currentFields.find(f => f.required && !f.element.value.trim());
      if (invalid) {
        // Highlight the missing field
        const input = _overlay.querySelector(`[name="${invalid.name}"], [id="${invalid.id}"]`);
        if (input) {
          input.classList.add('neuroglide-gf-error');
          input.focus();
        }
        return;
      }
      _steps[_currentStep].completed = true;
    }

    // If last step, submit form
    if (stepIndex >= _steps.length) {
      _steps[_currentStep].completed = true;
      // Trigger original form submission
      if (_activeForm) {
        const submitBtn = _activeForm.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.click();
        } else {
          _activeForm.submit();
        }
      }
      return;
    }

    _showStep(stepIndex);
  }

  function _handleSubmit(e) {
    // Let the guided form handle submission logic
    // Don't prevent if we explicitly triggered it
  }

  return { decomposeForm, activate, deactivate, isActive };
})();

if (typeof window !== 'undefined') {
  window.NeuroGlideGuidedForm = NeuroGlideGuidedForm;
}
