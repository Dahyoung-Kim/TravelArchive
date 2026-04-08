/**
 * weatherManager.js
 * manages weather effects by syncing with backend weather data.
 */

import { BackendHooks } from './api.js';

let currentWeatherEffect = null; 

export const WeatherManager = {
  /**
   * syncs the current weather from the backend and applies the corresponding visual effect.
   * @param {HTMLElement} weatherLayer - The container for weather effects.
   */
  async syncWeather(weatherLayer) {
    if (currentWeatherEffect) {
      currentWeatherEffect.unmount();
      currentWeatherEffect = null;
    }
    weatherLayer.innerHTML = '';

    try {
      const weatherData = await BackendHooks.fetchCurrentWeather();
      const condition = weatherData.condition || weatherData.type; 
      const params = weatherData.params || {}; 
      
      // Dynamically import effects to optimize initial load
      const EffectsModule = await import('./weatherTheme.js');
      
      switch(condition) {
        case 'rain': 
          currentWeatherEffect = new EffectsModule.RainEffect(weatherLayer, params); 
          break;
        case 'night': 
          currentWeatherEffect = new EffectsModule.NightEffect(weatherLayer, params); 
          break;
        case 'cloudy': 
          currentWeatherEffect = new EffectsModule.CloudyEffect(weatherLayer, params); 
          break;
        case 'clear': 
        default: 
          currentWeatherEffect = new EffectsModule.ClearEffect(weatherLayer); 
          break;
      }

      currentWeatherEffect.mount();
    } catch (err) {
      console.error("Failed to sync weather:", err);
    }
  },

  /**
   * clears any active weather effects.
   * @param {HTMLElement} weatherLayer 
   */
  clear(weatherLayer) {
    if (currentWeatherEffect) {
      currentWeatherEffect.unmount();
      currentWeatherEffect = null;
    }
    weatherLayer.innerHTML = '';
  }
};
