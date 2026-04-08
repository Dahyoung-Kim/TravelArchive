/**
 * theme.js
 * manages theme switching and persistence.
 */

import { BackendHooks } from './api.js';
import { WeatherManager } from './weatherManager.js';

export const ThemeManager = {
  /**
   * initializes theme management logic.
   * @param {Object} elements - DOM elements for theme UI.
   */
  init(elements) {
    const { 
      themeBtn, 
      themePopup, 
      themeSwatches, 
      documentBody, 
      weatherLayer 
    } = elements;

    // Toggle theme selection popup
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      themePopup.classList.toggle('show');
    });

    // Close popup on click outside
    document.addEventListener('click', () => {
      themePopup.classList.remove('show');
    });

    // Theme swatch selection
    themeSwatches.forEach(swatch => {
      swatch.addEventListener('click', async () => {
        const theme = swatch.getAttribute('data-theme');
        
        // Apply theme to body
        if (theme === 'default') {
          documentBody.removeAttribute('data-theme');
        } else {
          documentBody.setAttribute('data-theme', theme);
        }
        
        themePopup.classList.remove('show');
        
        // Handle weather-dependent theme
        if (theme === 'weather') {
          await WeatherManager.syncWeather(weatherLayer);
        } else {
          WeatherManager.clear(weatherLayer);
        }
        
        // Save user preference
        await BackendHooks.saveThemePreference(theme);
      });
    });
  }
};
