/**
 * calendar.js
 * Manages the interactive calendar component with original styling.
 */

import { renderTemplate } from './utils.js';

let currentCalendarDate = new Date(2026, 3, 4); // Reference: April 4, 2026

export const CalendarManager = {
  render(container) {
    if (!container) return;
    this.container = container;
    this.updateUI();
  },

  updateUI() {
    this.container.innerHTML = renderTemplate('calendar');

    const titleEl = document.getElementById('calendarTitle');
    const daysContainer = document.getElementById('calendarDays');
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    titleEl.textContent = `${year}년 ${month + 1}월`;

    daysContainer.innerHTML = '';

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
    const lastDateOfPrevMonth = new Date(year, month, 0).getDate();

    // Fill previous month's days
    for (let i = firstDayOfMonth; i > 0; i--) {
      const span = document.createElement('span');
      span.style.opacity = '0.3';
      span.textContent = lastDateOfPrevMonth - i + 1;
      daysContainer.appendChild(span);
    }

    // Fill current month's days
    for (let i = 1; i <= lastDateOfMonth; i++) {
      const span = document.createElement('span');
      span.textContent = i;
      
      // Mark specific date: April 4, 2026 (Mock Today)
      if (year === 2026 && month === 3 && i === 4) {
        span.className = 'active';
      }
      daysContainer.appendChild(span);
    }

    // Fill next month's days to maintain grid
    const remainingSlots = 35 - daysContainer.children.length; 
    const finalSlots = remainingSlots < 0 ? 42 - daysContainer.children.length : remainingSlots;
    
    for (let i = 1; i <= finalSlots; i++) {
      const span = document.createElement('span');
      span.style.opacity = '0.3';
      span.textContent = i;
      daysContainer.appendChild(span);
    }

    prevBtn.onclick = (e) => {
      e.stopPropagation();
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
      this.updateUI();
    };

    nextBtn.onclick = (e) => {
      e.stopPropagation();
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
      this.updateUI();
    };
  }
};
