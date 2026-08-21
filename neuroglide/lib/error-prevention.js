/**
 * NeuroGlide — Error Prevention Engine
 * Detects missing or incorrect form information and explains how to correct it
 * before the user submits.
 */

const NeuroGlideErrorPrevention = (() => {

  let _isActive = false;
  let _watchedForms = new Map();

  /**
   * Validate a form and return errors, warnings, and suggestions.
   * @param {HTMLFormElement} formElement
   * @returns {Object} { errors[], warnings[], suggestions[], isValid }
   */
  function validateForm(formElement) {
    if (!formElement) return { errors: [], warnings: [], suggestions: [], isValid: true };

    const errors = [];
    const warnings = [];
    const suggestions = [];

    const fields = formElement.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
    );

    fields.forEach(field => {
      const label = _getFieldLabel(field);
      const value = field.value.trim();

      // ─── Required field check ──────────────────────────────
      if ((field.required || field.hasAttribute('aria-required')) && !value) {
        errors.push({
          element: field,
          type: 'required',
          message: `"${label}" is required — please fill this in`,
          fix: `Enter a value for ${label}`
        });
        return; // Skip further checks if empty
      }

      if (!value) return; // Skip validation for empty optional fields

      // ─── Email validation ──────────────────────────────────
      if (field.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors.push({
            element: field,
            type: 'format',
            message: `"${label}" doesn't look like a valid email address`,
            fix: 'Use the format: name@example.com'
          });
        }
      }

      // ─── Phone validation ──────────────────────────────────
      if (field.type === 'tel' || field.name.match(/phone|tel|mobile/i)) {
        const phoneClean = value.replace(/[\s\-\(\)\+\.]/g, '');
        if (phoneClean.length < 7 || phoneClean.length > 15 || !/^\d+$/.test(phoneClean)) {
          warnings.push({
            element: field,
            type: 'format',
            message: `"${label}" may not be a valid phone number`,
            fix: 'Enter a phone number with 7-15 digits'
          });
        }
      }

      // ─── URL validation ────────────────────────────────────
      if (field.type === 'url') {
        try {
          new URL(value);
        } catch {
          errors.push({
            element: field,
            type: 'format',
            message: `"${label}" is not a valid URL`,
            fix: 'Start with http:// or https://'
          });
        }
      }

      // ─── Number range validation ───────────────────────────
      if (field.type === 'number') {
        const num = parseFloat(value);
        if (isNaN(num)) {
          errors.push({
            element: field,
            type: 'format',
            message: `"${label}" must be a number`,
            fix: 'Enter a numeric value'
          });
        } else {
          if (field.min && num < parseFloat(field.min)) {
            errors.push({
              element: field,
              type: 'range',
              message: `"${label}" must be at least ${field.min}`,
              fix: `Enter a number ${field.min} or higher`
            });
          }
          if (field.max && num > parseFloat(field.max)) {
            errors.push({
              element: field,
              type: 'range',
              message: `"${label}" must be no more than ${field.max}`,
              fix: `Enter a number ${field.max} or lower`
            });
          }
        }
      }

      // ─── Date validation ───────────────────────────────────
      if (field.type === 'date') {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          errors.push({
            element: field,
            type: 'format',
            message: `"${label}" is not a valid date`,
            fix: 'Use the format YYYY-MM-DD'
          });
        }
        // Check for future dates (common for birth dates)
        if (field.name.match(/birth|dob/i) && date > new Date()) {
          errors.push({
            element: field,
            type: 'logic',
            message: `"${label}" cannot be in the future`,
            fix: 'Enter your actual date of birth'
          });
        }
      }

      // ─── Min/Max length ────────────────────────────────────
      if (field.minLength > 0 && value.length < field.minLength) {
        errors.push({
          element: field,
          type: 'length',
          message: `"${label}" is too short (minimum ${field.minLength} characters)`,
          fix: `Enter at least ${field.minLength} characters`
        });
      }
      if (field.maxLength > 0 && value.length > field.maxLength) {
        warnings.push({
          element: field,
          type: 'length',
          message: `"${label}" may be too long (maximum ${field.maxLength} characters)`,
          fix: `Keep it under ${field.maxLength} characters`
        });
      }

      // ─── Pattern validation ────────────────────────────────
      if (field.pattern) {
        try {
          const regex = new RegExp(field.pattern);
          if (!regex.test(value)) {
            errors.push({
              element: field,
              type: 'pattern',
              message: `"${label}" doesn't match the required format`,
              fix: field.title || 'Check the required format and try again'
            });
          }
        } catch (e) { /* Invalid pattern */ }
      }

      // ─── Password strength ─────────────────────────────────
      if (field.type === 'password' && !field.name.match(/confirm|repeat/i)) {
        const strength = _checkPasswordStrength(value);
        if (strength.score < 3) {
          suggestions.push({
            element: field,
            type: 'security',
            message: `Password strength: ${strength.label}`,
            fix: strength.suggestions.join('. ')
          });
        }
      }

      // ─── Password confirmation ─────────────────────────────
      if (field.name.match(/confirm|repeat/i) && field.type === 'password') {
        const passwordField = formElement.querySelector('input[type="password"]:not([name*="confirm"]):not([name*="repeat"])');
        if (passwordField && passwordField.value !== value) {
          errors.push({
            element: field,
            type: 'match',
            message: 'Passwords do not match',
            fix: 'Make sure both password fields are the same'
          });
        }
      }

      // ─── Select with no selection ──────────────────────────
      if (field.tagName === 'SELECT' && (value === '' || value === '0' || value === 'select')) {
        if (field.required) {
          errors.push({
            element: field,
            type: 'required',
            message: `Please select an option for "${label}"`,
            fix: 'Choose one of the available options'
          });
        }
      }
    });

    return {
      errors,
      warnings,
      suggestions,
      isValid: errors.length === 0
    };
  }

  /**
   * Activate error prevention on all forms in the page.
   */
  function activate() {
    if (_isActive) return;

    document.querySelectorAll('form').forEach(form => {
      const handler = (e) => {
        const result = validateForm(form);
        if (!result.isValid) {
          e.preventDefault();
          e.stopPropagation();
          _showValidationSummary(form, result);
        }
      };

      form.addEventListener('submit', handler, true);
      _watchedForms.set(form, handler);

      // Also add real-time validation on blur
      form.querySelectorAll('input, select, textarea').forEach(field => {
        field.addEventListener('blur', () => {
          if (_isActive) _validateSingleField(field, form);
        });
      });
    });

    _isActive = true;
  }

  /**
   * Deactivate error prevention.
   */
  function deactivate() {
    _watchedForms.forEach((handler, form) => {
      form.removeEventListener('submit', handler, true);
    });
    _watchedForms.clear();

    // Remove all error indicators
    document.querySelectorAll('.neuroglide-field-error, .neuroglide-error-tooltip').forEach(el => {
      el.classList.remove('neuroglide-field-error');
    });
    document.querySelectorAll('.neuroglide-error-tooltip').forEach(el => el.remove());
    document.querySelectorAll('.neuroglide-validation-summary').forEach(el => el.remove());

    _isActive = false;
  }

  function isActive() {
    return _isActive;
  }

  // ─── UI Helpers ──────────────────────────────────────────────────
  function _validateSingleField(field, form) {
    // Remove existing error
    field.classList.remove('neuroglide-field-error');
    const existing = field.parentElement?.querySelector('.neuroglide-error-tooltip');
    if (existing) existing.remove();

    const result = validateForm(form);
    const fieldError = result.errors.find(e => e.element === field);
    const fieldWarning = result.warnings.find(w => w.element === field);

    if (fieldError) {
      field.classList.add('neuroglide-field-error');
      _showFieldTooltip(field, fieldError.message, 'error');
    } else if (fieldWarning) {
      _showFieldTooltip(field, fieldWarning.message, 'warning');
    }
  }

  function _showFieldTooltip(field, message, type = 'error') {
    const tooltip = document.createElement('div');
    tooltip.className = `neuroglide-error-tooltip neuroglide-tooltip-${type}`;
    tooltip.textContent = message;

    field.parentElement?.appendChild(tooltip);

    // Remove after 5 seconds
    setTimeout(() => tooltip.remove(), 5000);
  }

  function _showValidationSummary(form, result) {
    // Remove existing summary
    form.querySelector('.neuroglide-validation-summary')?.remove();

    const summary = document.createElement('div');
    summary.className = 'neuroglide-validation-summary';

    let html = `<div class="neuroglide-vs-header">
      <span class="neuroglide-vs-icon">⚠️</span>
      <span class="neuroglide-vs-title">Please fix ${result.errors.length} issue${result.errors.length !== 1 ? 's' : ''} before submitting</span>
      <button class="neuroglide-vs-close">✕</button>
    </div><ul class="neuroglide-vs-list">`;

    result.errors.forEach(error => {
      html += `<li class="neuroglide-vs-item neuroglide-vs-error">
        <strong>${error.message}</strong>
        <span class="neuroglide-vs-fix">💡 ${error.fix}</span>
      </li>`;
      error.element?.classList.add('neuroglide-field-error');
    });

    result.warnings.forEach(warning => {
      html += `<li class="neuroglide-vs-item neuroglide-vs-warning">
        <strong>${warning.message}</strong>
        <span class="neuroglide-vs-fix">💡 ${warning.fix}</span>
      </li>`;
    });

    html += '</ul>';
    summary.innerHTML = html;

    // Insert at top of form
    form.insertBefore(summary, form.firstChild);
    summary.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Close button
    summary.querySelector('.neuroglide-vs-close').addEventListener('click', () => summary.remove());

    // Click on error to scroll to field
    summary.querySelectorAll('.neuroglide-vs-item').forEach((item, i) => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        const allIssues = [...result.errors, ...result.warnings];
        if (allIssues[i]?.element) {
          allIssues[i].element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          allIssues[i].element.focus();
        }
      });
    });
  }

  // ─── Password Strength ──────────────────────────────────────────
  function _checkPasswordStrength(password) {
    let score = 0;
    const suggestions = [];

    if (password.length >= 8) score++;
    else suggestions.push('Use at least 8 characters');

    if (password.length >= 12) score++;

    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    else suggestions.push('Mix uppercase and lowercase letters');

    if (/\d/.test(password)) score++;
    else suggestions.push('Add a number');

    if (/[^a-zA-Z0-9]/.test(password)) score++;
    else suggestions.push('Add a special character (!@#$%^&*)');

    const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    return {
      score,
      label: labels[Math.min(score, 4)],
      suggestions
    };
  }

  function _getFieldLabel(field) {
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (label) return label.textContent.trim();
    }
    const parent = field.closest('label');
    if (parent) return parent.textContent.replace(field.value, '').trim();
    return field.getAttribute('aria-label') || field.placeholder || field.name || 'This field';
  }

  return { validateForm, activate, deactivate, isActive };
})();

if (typeof window !== 'undefined') {
  window.NeuroGlideErrorPrevention = NeuroGlideErrorPrevention;
}
