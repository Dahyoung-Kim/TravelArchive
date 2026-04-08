/**
 * help.js
 */

import { renderTemplate } from './utils.js';

export function renderHelpPage(container) {
  container.innerHTML = renderTemplate('help');
}
