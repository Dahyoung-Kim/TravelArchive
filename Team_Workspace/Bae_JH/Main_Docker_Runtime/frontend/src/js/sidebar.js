/**
 * sidebar.js
 * handles left and right sidebar toggling, resizing, and synchronization.
 */

export const SidebarManager = {
  isMobile: () => window.matchMedia('(max-width: 768px)').matches,
  mobileSidebarMode: () => window.matchMedia('(max-width: 560px)').matches ? 'hide' : 'peek',

  /**
   * syncs main content class based on mobile sidebar state.
   */
  syncContentState(elements) {
    const { mainContent, sidebar, rightSidebar } = elements;
    if (!this.isMobile()) {
      mainContent.classList.remove('content-obscured', 'content-glass-peek');
      return;
    }

    const leftOpen = sidebar.classList.contains('open');
    const rightOpen = rightSidebar.classList.contains('open');

    mainContent.classList.remove('content-obscured', 'content-glass-peek');
    if (leftOpen || rightOpen) {
      mainContent.classList.add(this.mobileSidebarMode() === 'hide' ? 'content-obscured' : 'content-glass-peek');
    }
  },

  /**
   * Generic open sidebar logic
   */
  _open(type, elements, config) {
    const isLeft = type === 'left';
    const sidebar = isLeft ? elements.sidebar : elements.rightSidebar;
    const overlay = isLeft ? elements.sidebarOverlay : elements.rightSidebarOverlay;
    const configKey = isLeft ? 'currentLeftWidth' : 'currentRightWidth';
    const bodyClass = isLeft ? 'left-open' : 'right-open';

    sidebar.classList.remove('collapsed');
    
    if (this.isMobile()) {
      // Close opposite sidebar on mobile
      if (isLeft) this.closeRightSidebar(elements, { silent: true });
      else this.closeSidebar(elements, { silent: true });

      sidebar.classList.add('open');
      elements.documentBody.classList.add(bodyClass);
      if (overlay) {
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => overlay.classList.add('show'));
      }
      this.syncContentState(elements);
    } else {
      sidebar.style.width = `${config[configKey]}px`;
    }

    if (!isLeft) {
      // Relayout map if exists
      setTimeout(() => {
        if (window.kakaoMap && typeof window.kakaoMap.relayout === 'function') {
          window.kakaoMap.relayout();
        }
      }, 310);
    }
  },

  /**
   * Generic close sidebar logic
   */
  _close(type, elements, options = {}) {
    const isLeft = type === 'left';
    const sidebar = isLeft ? elements.sidebar : elements.rightSidebar;
    const overlay = isLeft ? elements.sidebarOverlay : elements.rightSidebarOverlay;
    const bodyClass = isLeft ? 'left-open' : 'right-open';
    const { silent = false } = options;

    sidebar.classList.add('collapsed');
    if (this.isMobile()) {
      sidebar.classList.remove('open');
      elements.documentBody.classList.remove(bodyClass);
      if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => { overlay.classList.add('hidden'); }, 300);
      }
      if (!silent) this.syncContentState(elements);
    } else {
      sidebar.style.width = '';
    }
  },

  openSidebar(elements, config) { this._open('left', elements, config); },
  closeSidebar(elements, options) { this._close('left', elements, options); },
  openRightSidebar(elements, config) { this._open('right', elements, config); },
  closeRightSidebar(elements, options) { this._close('right', elements, options); },

  /**
   * initializes sidebar tabs.
   */
  initTabs(elements) {
    const { tabSessions, tabCalendar, sessionView, calendarView, sessionHeaderControls, calendarHeaderControls } = elements;
    if (!tabSessions || !tabCalendar) return;

    const switchTab = (activeTab, inactiveTab, showView, hideView, showHeader, hideHeader) => {
      activeTab.classList.add('active');
      inactiveTab.classList.remove('active');
      showView.style.display = 'flex';
      hideView.style.display = 'none';
      showHeader.style.display = 'block';
      hideHeader.style.display = 'none';
    };

    tabSessions.addEventListener('click', () => switchTab(tabSessions, tabCalendar, sessionView, calendarView, sessionHeaderControls, calendarHeaderControls));
    tabCalendar.addEventListener('click', () => switchTab(tabCalendar, tabSessions, calendarView, sessionView, calendarHeaderControls, sessionHeaderControls));

    if (tabSessions.classList.contains('active')) {
      sessionView.style.display = 'flex';
      calendarView.style.display = 'none';
      sessionHeaderControls.style.display = 'block';
      calendarHeaderControls.style.display = 'none';
    } else {
      calendarView.style.display = 'flex';
      sessionView.style.display = 'none';
      calendarHeaderControls.style.display = 'block';
      sessionHeaderControls.style.display = 'none';
    }
  },

  /**
   * initializes folding.
   */
  initFolding(elements) {
    const setupFolding = (btn, content) => {
      if (!btn || !content) return;
      btn.addEventListener('click', () => {
        const isCollapsed = content.classList.toggle('section-content-collapsed');
        btn.classList.toggle('collapsed', isCollapsed);
        btn.title = isCollapsed ? '펴기' : '접기';
      });
    };
    setupFolding(elements.toggleCalendarBtn, elements.calendarContent);
    setupFolding(elements.toggleScheduleBtn, elements.scheduleContent);
  },

  /**
   * Generic Resizer Logic
   */
  initResizers(elements, config) {
    const setupResizer = (resizer, target, side) => {
      if (!resizer) return;
      
      let isDragging = false;
      let startX = 0;
      let startWidth = 0;
      const configKey = side === 'left' ? 'currentLeftWidth' : 'currentRightWidth';

      resizer.addEventListener('mousedown', (e) => {
        if (this.isMobile()) return;
        isDragging = true;
        startX = e.clientX;
        startWidth = target.getBoundingClientRect().width;
        target.classList.add('notransition');
        resizer.classList.add('active');
        elements.documentBody.style.userSelect = 'none';
        elements.documentBody.style.cursor = 'col-resize';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const delta = side === 'left' ? (e.clientX - startX) : (startX - e.clientX);
        let newWidth = startWidth + delta;

        // Constraint logic
        const minMiddleWidth = Math.max(400, window.innerWidth * 0.3);
        const oppositeWidth = (side === 'left' ? elements.rightSidebar : elements.sidebar).getBoundingClientRect().width;
        
        // Use 1/3 only as a preference on wide screens, but always allow at least 300px
        const maxAllowedByMiddle = window.innerWidth - oppositeWidth - minMiddleWidth;
        const maxAllowedByThird = window.innerWidth / 3;
        
        // On very narrow screens, we must allow the sidebar to reach its minimum usable width (300px)
        const maxAllowed = Math.max(300, Math.min(maxAllowedByMiddle, maxAllowedByThird));

        newWidth = Math.max(300, Math.min(newWidth, maxAllowed));
        
        target.style.width = `${newWidth}px`;
        config[configKey] = newWidth;
      });

      document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        target.classList.remove('notransition');
        resizer.classList.remove('active');
        elements.documentBody.style.userSelect = '';
        elements.documentBody.style.cursor = '';
        localStorage.setItem(side === 'left' ? 'leftSidebarCustomWidth' : 'rightSidebarCustomWidth', config[configKey]);
        if (side === 'right' && window.kakaoMap) window.kakaoMap.relayout();
      });
    };

    setupResizer(elements.leftSidebarResizer, elements.sidebar, 'left');
    setupResizer(elements.rightSidebarResizer, elements.rightSidebar, 'right');
  }
};
