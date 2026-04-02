/**
 * settings.js
 */

import { renderTemplate } from './utils.js';

export function renderSettingsPage(container) {
  container.innerHTML = renderTemplate('settings');

  const slider = container.querySelector('#transparencySlider');
  if (slider) {
    const savedOpacity = localStorage.getItem('appGlassOpacity') || '14';
    slider.value = savedOpacity;
    document.documentElement.style.setProperty('--app-glass-opacity', savedOpacity / 100);

    slider.addEventListener('input', (e) => {
      const val = e.target.value;
      document.documentElement.style.setProperty('--app-glass-opacity', val / 100);
      localStorage.setItem('appGlassOpacity', val);
    });
  }
}
