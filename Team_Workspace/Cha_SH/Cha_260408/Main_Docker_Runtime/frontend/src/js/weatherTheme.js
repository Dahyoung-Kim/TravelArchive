/**
 * weatherTheme.js
 * visual effect classes for different weather conditions.
 */

/**
 * Clear Weather Effect
 */
export class ClearEffect {
  constructor(container) { this.container = container; }
  mount() { 
    this.container.classList.add('weather-clear'); 
    document.body.classList.add('clear-mode');
  }
  unmount() { 
    this.container.classList.remove('weather-clear');
    document.body.classList.remove('clear-mode');
  }
}

/**
 * Cloudy Weather Effect
 */
export class CloudyEffect {
  constructor(container, params = {}) { 
    this.container = container; 
    this.clouds = [];
    // Number of cloud particles from backend
    this.cloudDensity = params.cloudDensity || 4; 
  }
  mount() { 
    this.container.classList.add('weather-cloudy'); 
    document.body.classList.add('cloudy-mode');
    
    for(let i = 0; i < this.cloudDensity; i++) {
      const cloud = document.createElement('div');
      cloud.className = 'cloud-particle';
      
      const size = 200 + Math.random() * 300; 
      cloud.style.width = `${size}px`;
      cloud.style.height = `${size * 0.6}px`; 
      cloud.style.top = `${Math.random() * 60 - 10}%`; 
      
      cloud.style.animationDuration = `${60 + Math.random() * 60}s`; 
      cloud.style.animationDelay = `-${Math.random() * 60}s`; 
      
      this.container.appendChild(cloud);
      this.clouds.push(cloud);
    }
  }
  unmount() { 
    this.container.classList.remove('weather-cloudy');
    document.body.classList.remove('cloudy-mode');
    this.clouds.forEach(c => c.remove());
    this.clouds = [];
  }
}

/**
 * Rain Effect using Canvas
 */
export class RainEffect {
  constructor(container, params = {}) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.drops = [];
    this.animationId = null;
    this.handleResize = this.resize.bind(this);

    // Weather parameters from backend
    this.intensity = params.intensity || 1.0;
    this.windDirection = params.windDirection || 0;
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  createDrop(isInitial = false) {
    const windOffset = this.canvas.height * this.windDirection; 
    const minX = this.windDirection > 0 ? -windOffset : 0;
    const maxX = this.windDirection > 0 ? this.canvas.width : this.canvas.width - windOffset;

    return {
      x: minX + Math.random() * (maxX - minX),
      y: isInitial ? Math.random() * this.canvas.height : -50, 
      speed: 15 + Math.random() * 15,
      length: 20 + Math.random() * 25,
      opacity: 0.3 + Math.random() * 0.5 
    };
  }

  initDrops() {
    this.drops = [];
    const baseDropCount = Math.floor(window.innerWidth * 0.15); 
    const finalDropCount = Math.floor(baseDropCount * this.intensity);

    for(let i=0; i<finalDropCount; i++) {
      this.drops.push(this.createDrop(true));
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.lineWidth = 2.5; 
    this.ctx.lineCap = 'round';

    this.drops.forEach(drop => {
      this.ctx.strokeStyle = `rgba(174, 194, 224, ${drop.opacity})`;
      this.ctx.beginPath();
      this.ctx.moveTo(drop.x, drop.y);
      this.ctx.lineTo(drop.x + drop.speed * this.windDirection, drop.y + drop.length);
      this.ctx.stroke();

      drop.y += drop.speed;
      drop.x += drop.speed * this.windDirection;

      if(drop.y > this.canvas.height) {
        Object.assign(drop, this.createDrop(false));
      }
    });
    this.animationId = requestAnimationFrame(this.animate.bind(this));
  }

  mount() {
    this.container.classList.add('weather-rain');
    document.body.classList.add('rain-mode');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.pointerEvents = 'none';
    this.container.appendChild(this.canvas);
    
    window.addEventListener('resize', this.handleResize);
    this.resize();
    this.initDrops();
    this.animate();
  }

  unmount() {
    this.container.classList.remove('weather-rain');
    document.body.classList.remove('rain-mode');
    window.removeEventListener('resize', this.handleResize);
    if(this.animationId) cancelAnimationFrame(this.animationId);
    if(this.canvas.parentNode) this.canvas.remove();
  }
}

/**
 * Night Sky Effect using Canvas
 */
export class NightEffect {
  constructor(container, params = {}) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.stars = [];
    this.animationId = null;
    this.handleResize = this.resize.bind(this);
    
    // Star density from backend
    this.starDensity = params.starDensity || 150;
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initStars() {
    this.stars = [];
    for(let i=0; i<this.starDensity; i++) {
      this.stars.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        radius: Math.random() * 2.5, 
        alpha: Math.random() * 0.5 + 0.3, 
        delta: (Math.random() * 0.02) + 0.005
      });
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.stars.forEach(star => {
      this.ctx.fillStyle = `rgba(220, 240, 255, ${star.alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      this.ctx.fill();

      star.alpha += star.delta;
      if(star.alpha >= 1 || star.alpha <= 0.2) {
        star.delta = -star.delta;
      }
    });
    this.animationId = requestAnimationFrame(this.animate.bind(this));
  }

  mount() {
    this.container.classList.add('weather-night');
    document.body.classList.add('night-mode');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.pointerEvents = 'none';
    this.container.appendChild(this.canvas);
    
    window.addEventListener('resize', this.handleResize);
    this.resize();
    this.initStars();
    this.animate();
  }

  unmount() {
    this.container.classList.remove('weather-night');
    document.body.classList.remove('night-mode');
    window.removeEventListener('resize', this.handleResize);
    if(this.animationId) cancelAnimationFrame(this.animationId);
    if(this.canvas.parentNode) this.canvas.remove();
  }
}
