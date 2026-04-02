/**
 * calendar.js
 */

import { renderTemplate } from './utils.js';

export const CalendarManager = {
  render(container) {
    if (!container) return;
    container.innerHTML = renderTemplate('calendar');
  }
};
