/**
 * script.js (Root)
 */

import { BackendHooks, TokenManager } from './js/api.js';
import { adjustTextareaHeight, showToast } from './js/ui.js';
import { SidebarManager } from './js/sidebar.js';
import { ChatManager } from './js/chat.js';  // _onNewSession 자동 전송에도 사용
import { SessionManager } from './js/session.js';
import { CalendarManager } from './js/calendar.js';
import { ScheduleManager } from './js/schedule.js';
import { router } from './js/router.js';
import { ThemeManager } from './js/theme.js';
import { initRightSidebarMarkerPanel } from './js/components/map/map-right-sidebar-marker-panel.js';
import { NotificationManager } from './js/notification.js';

document.addEventListener('DOMContentLoaded', async () => {
  // ── OAuth 콜백: 카카오 로그인 후 /?access_token=...&refresh_token=... 처리 ──
  {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthAccess  = urlParams.get('access_token');
    const oauthRefresh = urlParams.get('refresh_token');
    if (oauthAccess && oauthRefresh) {
      TokenManager.setTokens(oauthAccess, oauthRefresh);
      TokenManager.setUserInfo({
        userId:   urlParams.get('user_id')   || '',
        userType: urlParams.get('user_type') || 'KKO',
        nickname: decodeURIComponent(urlParams.get('nickname') || ''),
        email:    decodeURIComponent(urlParams.get('email')    || ''),
      });
      // URL 파라미터 제거 (히스토리 깔끔하게)
      window.history.replaceState({}, '', window.location.pathname + (window.location.hash || '#/'));
    }
  }

  // 비로그인 임시 세션 ID (sessionStorage에 브라우저 탭 단위로 보관)
  const _getTempSessionId = () => {
    let id = sessionStorage.getItem('ta_temp_session_id');
    if (!id) {
      id = 'tmp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      sessionStorage.setItem('ta_temp_session_id', id);
    }
    return id;
  };

  // 1. Elements Collection
  const elements = {
    mainContent: document.getElementById('mainContent'),
    documentBody: document.body,
    heroSection: document.getElementById('heroSection'),
    pageSection: document.getElementById('pageSection'),
    topBarActions: document.getElementById('topBarActions'),
    chatWrap: document.getElementById('chatWrap'),
    chatHistory: document.getElementById('chatHistory'),
    chatInput: document.getElementById('chatInput'),
    chatBox: document.getElementById('chatBox'),
    sendBtn: document.getElementById('sendBtn'),
    expandBtn: document.getElementById('expandBtn'),
    attachBtn: document.getElementById('attachBtn'),
    fileInput: document.getElementById('fileInput'),
    downloadChatBtn: document.getElementById('downloadChatBtn'),
    shareChatBtn: document.getElementById('shareChatBtn'),
    sidebar: document.getElementById('sidebar'),
    sidebarList: document.getElementById('sidebarList'),
    menuToggle: document.getElementById('menuToggle'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    leftSidebarResizer: document.getElementById('leftSidebarResizer'),
    resetLeftSidebarBtn: document.getElementById('resetLeftSidebarBtn'),
    tabSessions: document.getElementById('tabSessions'),
    tabCalendar: document.getElementById('tabCalendar'),
    sessionView: document.getElementById('sessionView'),
    calendarView: document.getElementById('calendarView'),
    sessionHeaderControls: document.getElementById('sessionHeaderControls'),
    calendarHeaderControls: document.getElementById('calendarHeaderControls'),
    toggleCalendarBtn: document.getElementById('toggleCalendarBtn'),
    calendarContent: document.getElementById('calendarContent'),
    toggleScheduleBtn: document.getElementById('toggleScheduleBtn'),
    scheduleContent: document.getElementById('scheduleContent'),
    addScheduleRowBtn: document.getElementById('addScheduleRowBtn'),
    removeScheduleRowBtn: document.getElementById('removeScheduleRowBtn'),
    toggleMemoBtn: document.getElementById('toggleMemoBtn'),
    memoContent: document.getElementById('memoContent'),
    addMemoRowBtn: document.getElementById('addMemoRowBtn'),
    removeMemoRowBtn: document.getElementById('removeMemoRowBtn'),
    rightSidebar: document.getElementById('rightSidebar'),
    rightSidebarContent: document.getElementById('rightSidebarContent'),
    mapToggleBtn: document.getElementById('mapToggleBtn'),
    closeRightSidebarBtn: document.getElementById('closeRightSidebarBtn'),
    rightSidebarOverlay: document.getElementById('rightSidebarOverlay'),
    rightSidebarResizer: document.getElementById('rightSidebarResizer'),
    resetRightSidebarBtn: document.getElementById('resetRightSidebarBtn'),
    homeBtn: document.getElementById('homeBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    mainTeamPlannerBtn: document.getElementById('mainTeamPlannerBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    accountBtn: document.getElementById('accountBtn'),
    helpBtn: document.getElementById('helpBtn'),
    themeBtn: document.getElementById('themeBtn'),
    notifBtn: document.getElementById('notifBtn'),
    notifBadge: document.getElementById('notifBadge'),
    themePopup: document.getElementById('themePopup'),
    themeSwatches: document.querySelectorAll('.theme-swatch'),
    weatherLayer: document.getElementById('weatherLayer'),
    bgPanorama: document.getElementById('bgPanorama'),
    homeDashboard: document.getElementById('homeDashboard'),
    planFilter: document.getElementById('planFilter'),
    planFilterTrigger: document.getElementById('planFilterTrigger'),
    planFilterLabel: document.getElementById('planFilterLabel'),
    planFilterMenu: document.getElementById('planFilterMenu'),
    tempChatBtn: document.getElementById('tempChatBtn'),
  };

  const state = {
    currentSessionId: null,
    isReceiving: false,
    currentMode: 'personal', // 'personal' or 'team'
    currentTripId: null,     // null = 전체, 'none' = 기타, 'trip_xxx' = 특정 여행
    isTempMode: false,       // 임시 채팅 모드 (로그인 후 임시 채팅 사용 시)
  };

  // 홈 대시보드 "+" 카드 클릭 → 첫 메시지 입력 후 세션 생성 + 자동 전송
  elements._onNewSession = async (firstMsg) => {
    if (state.isReceiving) return;
    try {
      const title = firstMsg || '새 대화';
      const effectiveTripId = state.currentTripId === 'none' ? null : state.currentTripId;
      const session = await BackendHooks.createSession(
        title, state.currentMode, effectiveTripId
      );
      const sid = session.id || session.session_id;
      SessionManager.renderSidebarItem(session.title, sid, elements, state, true, session.trip_color);
      window.location.hash = `#/chat/${sid}`;

      if (firstMsg) {
        setTimeout(() => {
          elements.chatInput.value = firstMsg;
          adjustTextareaHeight(elements.chatInput, elements.chatBox);
          ChatManager.handleSend(state, elements);
        }, 350);
      }
    } catch (e) {
      console.error('[Home] 새 세션 생성 실패:', e);
    }
  };

  // 사이드바 세션 목록 재조회
  elements._refreshSessions = () => SessionManager.init(elements, state);

  // 여행 카드 클릭 → 현재 여행 필터 변경 + 세션 목록 갱신
  elements._onTripSelect = (tripId, tripTitle) => {
    state.currentTripId = tripId || null;
    if (elements.planFilterLabel) {
      if (!tripId) elements.planFilterLabel.textContent = '전체';
      else if (tripId === 'none') elements.planFilterLabel.textContent = '기타';
      else elements.planFilterLabel.textContent = tripTitle || '여행';
    }
    _renderTripMenu();
    SessionManager.init(elements, state);
  };

  // router.js가 호출할 수 있도록 elements에 임시채팅 탈출 함수 노출 (아래에서 정의 후 덮어씀)
  elements._exitTempMode = () => {};

  // 알림 수락 후 팀 플래너로 전환하는 헬퍼 (notification.js에서 호출)
  elements._switchToTeamMode = () => {
    if (state.currentMode === 'team') return;
    state.currentMode = 'team';
    if (elements.mainTeamPlannerBtn) {
      elements.mainTeamPlannerBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        개인 플래너
      `;
    }
    SessionManager.init(elements, state);
  };

  // ── 여행 필터 드롭다운 ────────────────────────────────────
  // _tripList를 외부로 빼서 이벤트 핸들러가 항상 최신 목록을 참조
  let _tripList = [];
  let _tripDropdownInited = false;

  function _renderTripMenu() {
    const { planFilterLabel, planFilterMenu } = elements;
    if (!planFilterMenu) return;
    planFilterMenu.innerHTML = '';

    const makeItem = (label, dataId, color, isActive) => {
      const item = document.createElement('div');
      item.className = 'plan-filter-item' + (isActive ? ' active' : '');
      item.dataset.tripId = dataId;
      if (color) {
        const swatch = document.createElement('span');
        swatch.className = 'plan-filter-swatch';
        swatch.style.background = color;
        item.appendChild(swatch);
      }
      const label_ = document.createElement('span');
      label_.textContent = label;
      item.appendChild(label_);
      return item;
    };

    planFilterMenu.appendChild(makeItem('전체', '', null, state.currentTripId === null));

    for (const trip of _tripList) {
      planFilterMenu.appendChild(
        makeItem(trip.title || '이름 없는 여행', trip.trip_id, trip.color, state.currentTripId === trip.trip_id)
      );
    }

    planFilterMenu.appendChild(makeItem('기타', 'none', null, state.currentTripId === 'none'));

    if (!TokenManager.isLoggedIn()) {
      planFilterLabel.textContent = '전체';
    }
  }

  async function initTripDropdown() {
    const { planFilterTrigger, planFilterLabel, planFilterMenu } = elements;
    if (!planFilterTrigger) return;

    try {
      _tripList = TokenManager.isLoggedIn() ? await BackendHooks.fetchTripList() : [];
    } catch (e) { _tripList = []; }

    _renderTripMenu();

    if (_tripDropdownInited) return;
    _tripDropdownInited = true;

    planFilterTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      planFilterMenu.classList.toggle('open');
    });

    planFilterMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.plan-filter-item');
      if (!item) return;

      const selectedId = item.dataset.tripId || null;
      state.currentTripId = selectedId === '' ? null : selectedId;

      if (selectedId === '') {
        planFilterLabel.textContent = '전체';
      } else if (selectedId === 'none') {
        planFilterLabel.textContent = '기타';
      } else {
        planFilterLabel.textContent = _tripList.find(t => t.trip_id === selectedId)?.title || '여행';
      }

      planFilterMenu.classList.remove('open');
      _renderTripMenu();
      SessionManager.init(elements, state);
    });

    document.addEventListener('click', () => planFilterMenu.classList.remove('open'));
  }

  elements._refreshTripDropdown = initTripDropdown;

  // ── 비로그인 Auth Gate ──────────────────────────────────────
  function applyAuthGate(isLoggedIn) {
    const gatedEls = [
      elements.newChatBtn,
      elements.mainTeamPlannerBtn,
      elements.tabCalendar,
      elements.planFilterTrigger,
    ];
    gatedEls.forEach(el => {
      if (!el) return;
      el.style.opacity       = isLoggedIn ? '' : '0.35';
      el.style.pointerEvents = isLoggedIn ? '' : 'none';
      el.title = isLoggedIn ? '' : '로그인 후 이용 가능합니다';
    });

    // 임시 채팅 버튼: 로그인 시에만 표시
    if (elements.tempChatBtn) {
      elements.tempChatBtn.style.display = isLoggedIn ? '' : 'none';
    }

    if (elements.sidebarList) {
      if (!isLoggedIn) {
        elements.sidebarList.innerHTML = `
          <div style="padding:24px 16px; text-align:center; color:var(--text-secondary,#888); font-size:13px; line-height:1.6;">
            로그인 후<br>세션 목록을 이용할 수 있습니다.
          </div>`;
      }
    }
  }

  // ── 로그인 이벤트: account.js → script.js 브리지 ────────
  document.addEventListener('ta:login', async () => {
    applyAuthGate(true);
    state.isTempMode = false;
    await initTripDropdown();
    await SessionManager.init(elements, state);
    NotificationManager.startPolling(state, elements);
  });

  // ── 로그아웃 이벤트: account.js → script.js 브리지 ────────
  document.addEventListener('ta:logout', () => {
    // SSE 연결 종료
    if (state._sseConnection) {
      state._sseConnection.close();
      state._sseConnection = null;
    }
    NotificationManager.stopPolling();

    state.currentSessionId = null;
    state.currentTripId    = null;
    state.isTempMode       = false;

    // 사이드바 세션 목록 지우기
    elements.sidebarList.innerHTML = '';

    // 홈 대시보드 숨기기
    if (elements.homeDashboard) {
      elements.homeDashboard.style.display = 'none';
      elements.homeDashboard.innerHTML = '';
    }
    elements.heroSection?.classList.remove('dashboard-active');

    // planFilter 표시 복원 (임시 채팅 모드로 숨겨졌을 수 있음)
    if (elements.planFilter) elements.planFilter.style.display = '';

    // 여행 드롭다운 초기화 (로그아웃 상태 → 빈 목록)
    _tripList = [];
    _renderTripMenu();

    // Auth Gate 적용
    applyAuthGate(false);

    // 홈으로 이동 (이미 홈이면 router 강제 호출)
    if (!window.location.hash || window.location.hash === '#/') {
      router(state, elements);
    } else {
      window.location.hash = '#/';
    }
  });
  
  // 2. Initialization & Backend Config
  let config = { currentLeftWidth: 300, currentRightWidth: 300 };
  let savedOpacity = '20';
  let savedTheme = 'default';
  let todayDate = new Date();
  
  try {
    const appContext = await BackendHooks.fetchAppContext();
    const settings = appContext.settings || {};
    
    config.currentLeftWidth = parseInt(settings.leftSidebarCustomWidth, 10) || 300;
    config.currentRightWidth = parseInt(settings.rightSidebarCustomWidth, 10) || 300;
    savedOpacity = settings.appGlassOpacity || '20';
    savedTheme = settings.theme || 'default';
    
    if (appContext.today) {
      todayDate = new Date(appContext.today);
    }
  } catch (e) {
    console.error('Failed to load context from backend', e);
  }

  document.documentElement.style.setProperty('--app-glass-opacity', savedOpacity / 100);
  if (savedTheme !== 'default') {
    document.body.setAttribute('data-theme', savedTheme);
  }

  const bgImages = ['1','2','3','4','5'].map(i => `/resource/bg-long-${i}.jpg`);
  if (elements.bgPanorama) {
    elements.bgPanorama.style.backgroundImage = `url('${bgImages[Math.floor(Math.random() * bgImages.length)]}')`;
  }

  // 3. Parallel Async Initialization (Don't block UI event listeners)
  (async () => {
    try {
      await initTripDropdown();
      await SessionManager.init(elements, state);
      await CalendarManager.init(todayDate);
      await CalendarManager.render(elements.calendarContent);
      await ScheduleManager.render(elements.scheduleContent);

      SidebarManager.initTabs(elements);
      SidebarManager.initResizers(elements, config);
      SidebarManager.initFolding(elements);
      ThemeManager.init(elements);
      NotificationManager.init(elements, state);
      if (TokenManager.isLoggedIn()) {
        NotificationManager.startPolling(state, elements);
      }

      // 마커 정보 패널 초기화 (map iframe과 postMessage 통신)
      const mapContainerEl = document.getElementById('kakaoMapContainer');
      if (mapContainerEl) {
        try {
          initRightSidebarMarkerPanel({ mapContainerEl });
        } catch (e) {
          console.warn('[Map Marker Panel] 초기화 실패:', e);
        }
      }

      router(state, elements);
      applyAuthGate(TokenManager.isLoggedIn());
    } catch (e) {
      console.warn("Some async components failed to load, UI will still function", e);
      applyAuthGate(TokenManager.isLoggedIn());
    }
  })();

  // Initial Routing Listener
  window.addEventListener('hashchange', () => router(state, elements));
  // router(state, elements); // Moved inside async init block to prevent race condition on SSID/Rows

  // 4. Unified Event Handling
  const handleSidebarToggle = (btn, side) => {
    btn.addEventListener('click', () => {
      const isOpen = side === 'left' ? elements.sidebar.classList.contains('open') : elements.rightSidebar.classList.contains('open');
      const isCollapsed = side === 'left' ? elements.sidebar.classList.contains('collapsed') : elements.rightSidebar.classList.contains('collapsed');
      
      if (SidebarManager.isMobile()) {
        (isOpen) ? (side === 'left' ? SidebarManager.closeSidebar(elements) : SidebarManager.closeRightSidebar(elements)) 
                 : (side === 'left' ? SidebarManager.openSidebar(elements, config) : SidebarManager.openRightSidebar(elements, config));
      } else {
        (isCollapsed) ? (side === 'left' ? SidebarManager.openSidebar(elements, config) : SidebarManager.openRightSidebar(elements, config)) 
                       : (side === 'left' ? SidebarManager.closeSidebar(elements) : SidebarManager.closeRightSidebar(elements));
      }
      
      window.updatePlaceholder();
      // Sidebar transition takes ~300ms
      setTimeout(() => {
        SidebarManager.adjustAllMemoHeights();
        window.updatePlaceholder();
      }, 310);
    });
  };

  handleSidebarToggle(elements.menuToggle, 'left');
  if (elements.mapToggleBtn) handleSidebarToggle(elements.mapToggleBtn, 'right');

  [elements.closeRightSidebarBtn, elements.sidebarOverlay, elements.rightSidebarOverlay].forEach(el => {
    el?.addEventListener('click', () => {
      if (el === elements.sidebarOverlay) SidebarManager.closeSidebar(elements);
      else SidebarManager.closeRightSidebar(elements);
      setTimeout(() => SidebarManager.adjustAllMemoHeights(), 310);
    });
  });

  elements.resetLeftSidebarBtn?.addEventListener('click', async () => {
    config.currentLeftWidth = 300;
    elements.sidebar.style.width = '300px';
    await BackendHooks.saveUserSetting('leftSidebarCustomWidth', 300);
    setTimeout(() => SidebarManager.adjustAllMemoHeights(), 310);
  });

  elements.resetRightSidebarBtn?.addEventListener('click', async () => {
    config.currentRightWidth = 300;
    elements.rightSidebar.style.width = '300px';
    await BackendHooks.saveUserSetting('rightSidebarCustomWidth', 300);
    setTimeout(() => {
      window.kakaoMap?.relayout();
      SidebarManager.adjustAllMemoHeights();
    }, 310);
  });

  // Navigation
  elements.homeBtn?.addEventListener('click', () => {
    if (SidebarManager.isMobile()) SidebarManager.closeSidebar(elements);
    if (state.isTempMode) _exitTempMode();
    if (!state.isReceiving) window.location.hash = '#/';
  });

  elements.newChatBtn?.addEventListener('click', () => {
    if (SidebarManager.isMobile()) SidebarManager.closeSidebar(elements);
    if (state.isTempMode) _exitTempMode();
    if (!state.isReceiving) elements._onNewSession(null);
  });

  elements.mainTeamPlannerBtn?.addEventListener('click', () => {
    if (SidebarManager.isMobile()) SidebarManager.closeSidebar(elements);
    
    // Toggle Mode
    state.currentMode = state.currentMode === 'personal' ? 'team' : 'personal';
    
    // Update Button UI
    if (state.currentMode === 'team') {
      elements.mainTeamPlannerBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        개인 플래너
      `;
    } else {
      elements.mainTeamPlannerBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
        팀 플래너
      `;
    }

    // Refresh session list + re-evaluate SSE for current chat
    SessionManager.init(elements, state);
    router(state, elements);
    showToast(`${state.currentMode === 'team' ? '팀' : '개인'} 플래너로 전환되었습니다.`);
    setTimeout(window.updatePlaceholder, 310);
  });

  ['settings', 'account', 'help'].forEach(v => {
    elements[`${v}Btn`].addEventListener('click', () => {
      if (SidebarManager.isMobile()) SidebarManager.closeSidebar(elements);
      window.location.hash = `#/${v}`;
    });
  });

  // ── 임시 채팅 모드 진입/탈출 헬퍼 ─────────────────────────
  const _enterTempMode = () => {
    state.isTempMode = true;
    state.currentSessionId = null;
    if (elements.chatHistory) elements.chatHistory.innerHTML = '';
    if (elements.planFilter) elements.planFilter.style.display = 'none';
    if (elements.sidebarList) {
      elements.sidebarList.innerHTML = `
        <div style="padding:24px 16px; text-align:center; color:var(--text-secondary,#888); font-size:13px; line-height:1.8;">
          임시 채팅 모드입니다.<br>대화 내용은 저장되지 않습니다.
        </div>`;
    }
    // hashchange가 발생하지 않을 수 있으므로 라우터를 직접 호출
    router(state, elements);
  };

  const _exitTempMode = () => {
    if (!state.isTempMode) return;
    state.isTempMode = false;
    if (elements.planFilter) elements.planFilter.style.display = '';
    // 라우터 직접 호출 → 홈 대시보드 복원 + 세션 목록 갱신
    router(state, elements);
  };
  // router.js에서 접근 가능하도록 연결
  elements._exitTempMode = _exitTempMode;

  // 임시 채팅 버튼: 로그인 사용자가 저장 없는 채팅 시작
  elements.tempChatBtn?.addEventListener('click', () => {
    if (SidebarManager.isMobile()) SidebarManager.closeSidebar(elements);
    _enterTempMode();
    window.location.hash = '#/';
  });

  // 전송 핸들러: 비로그인 또는 임시 채팅 모드 시 임시 챗봇, 로그인 시 정상 세션 사용
  const _handleSendOrTemp = () => {
    if (TokenManager.isLoggedIn() && !state.isTempMode) {
      ChatManager.handleSend(state, elements);
    } else {
      const message = elements.chatInput?.value?.trim();
      if (!message || state.isReceiving) return;

      const tempId = _getTempSessionId();
      state.isReceiving = true;
      elements.sendBtn.disabled = true;

      // 사용자 메시지 버블 추가
      const userBubble = document.createElement('div');
      userBubble.className = 'chat-message user-message';
      userBubble.textContent = message;
      elements.chatHistory?.appendChild(userBubble);

      // 봇 응답 버블 추가
      const botBubble = document.createElement('div');
      botBubble.className = 'chat-message bot-message';
      botBubble.textContent = '...';
      elements.chatHistory?.appendChild(botBubble);
      elements.chatHistory?.scrollTo({ top: elements.chatHistory.scrollHeight, behavior: 'smooth' });

      elements.chatInput.value = '';

      BackendHooks.sendTempMessage(
        tempId, message,
        (text) => { botBubble.textContent = text; elements.chatHistory?.scrollTo({ top: elements.chatHistory.scrollHeight }); },
        () => { state.isReceiving = false; elements.sendBtn.disabled = false; },
      );
    }
  };

  elements.sendBtn.addEventListener('click', _handleSendOrTemp);
  elements.chatInput.addEventListener('keydown', (e) => (e.key === 'Enter' && !e.shiftKey && !e.isComposing) && (e.preventDefault(), _handleSendOrTemp()));
  elements.chatInput.addEventListener('input', () => adjustTextareaHeight(elements.chatInput, elements.chatBox));
  elements.expandBtn.addEventListener('click', () => {
    const input = elements.chatInput;
    const box = elements.chatBox;

    // 1. 현재 높이를 애니메이션 시작점으로 저장
    const startHeight = input.offsetHeight;

    // 2. 확장/축소 상태 토글
    box.classList.toggle('expanded');
    const isExpanded = box.classList.contains('expanded');

    // 3. 컨텐츠 높이 측정 (1px로 압축 후 scrollHeight 읽기)
    input.style.height = '1px';
    const contentHeight = input.scrollHeight;

    // 4. 목표 높이 계산 (min/max 범위 내)
    const minHeight = isExpanded ? 136 : 32;
    const maxHeight = isExpanded ? 360 : 180;
    const targetHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);

    // 5. 애니메이션 시작점으로 복원 (transition 없이)
    input.style.transition = 'none';
    input.style.height = startHeight + 'px';

    // 6. reflow 강제 적용 (transition: none이 적용되도록)
    input.getBoundingClientRect();

    // 7. 다음 프레임에서 목표 높이로 부드럽게 전환
    requestAnimationFrame(() => {
      input.style.transition = 'height 0.28s cubic-bezier(0.4, 0, 0.2, 1)';
      input.style.height = targetHeight + 'px';
      input.style.overflowY = targetHeight >= maxHeight ? 'auto' : 'hidden';
    });

    // 8. 애니메이션 완료 후 정리
    input.addEventListener('transitionend', () => {
      input.style.transition = '';
      adjustTextareaHeight(input, box);
    }, { once: true });

    window.updatePlaceholder();
  });

  elements.attachBtn.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', (e) => e.target.files.length > 0 && ChatManager.handleFileUpload(e.target.files, state, elements));

  elements.downloadChatBtn.addEventListener('click', () => state.currentSessionId && confirm("다운로드하시겠습니까?") && BackendHooks.downloadChat(state.currentSessionId));

  // Window utilities
  window.updatePlaceholder = () => {
    if (!elements.chatInput) return;
    const longText = "메시지 또는 파일을 이곳에 드롭하세요 (Shift+Enter로 줄바꿈)";
    const shortText = "메시지를 입력하세요";
    
    const canvas = window.updatePlaceholder.canvas || (window.updatePlaceholder.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    
    // Get exact styles from the textarea to match measurement
    const computedStyle = window.getComputedStyle(elements.chatInput);
    context.font = `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;
    
    // Precision measurement + buffer to account for scrollbars or slightly different rendering
    const textWidth = context.measureText(longText).width;
    const availableWidth = elements.chatInput.clientWidth - parseFloat(computedStyle.paddingLeft) - parseFloat(computedStyle.paddingRight);
    
    // If available width is less than the actual text width + 40px safety buffer, switch to short.
    if (availableWidth < textWidth + 40) {
      elements.chatInput.placeholder = shortText;
    } else {
      elements.chatInput.placeholder = longText;
    }
  };

  window.addEventListener('resize', () => {
    adjustTextareaHeight(elements.chatInput, elements.chatBox);
    window.updatePlaceholder();
    
    if (!SidebarManager.isMobile()) {
        const MIN_CONTENT = 600; 
        const MAX_SIDEBAR_PCT = 0.5;
        const leftOpen = !elements.sidebar.classList.contains('collapsed');
        const rightOpen = !elements.rightSidebar.classList.contains('collapsed');
        
        // 1. Force 50% constraint on resize
        if (leftOpen && config.currentLeftWidth > window.innerWidth * MAX_SIDEBAR_PCT) {
            elements.sidebar.style.width = (window.innerWidth * MAX_SIDEBAR_PCT) + 'px';
        }
        if (rightOpen && config.currentRightWidth > window.innerWidth * MAX_SIDEBAR_PCT) {
            elements.rightSidebar.style.width = (window.innerWidth * MAX_SIDEBAR_PCT) + 'px';
        }

        const leftWidth = leftOpen ? parseFloat(elements.sidebar.style.width || config.currentLeftWidth) : 0;
        const rightWidth = rightOpen ? parseFloat(elements.rightSidebar.style.width || config.currentRightWidth) : 0;
        
        // 2. Enforce minimum center width
        if (leftWidth + rightWidth > window.innerWidth - MIN_CONTENT) {
            if (leftOpen && rightOpen) {
                SidebarManager.closeRightSidebar(elements, { silent: true });
            } else if (leftOpen && leftWidth > window.innerWidth - MIN_CONTENT) {
                elements.sidebar.style.width = Math.max(300, window.innerWidth - MIN_CONTENT) + 'px';
            }
        }
    }
    SidebarManager.syncContentState(elements);
    SidebarManager.adjustAllMemoHeights();
  });

  // 스크롤바 자동 숨김: 스크롤 중이거나 hover 시에만 표시, 1.5초 후 사라짐
  const scrollbarTimers = new WeakMap();
  const SCROLLBAR_HIDE_DELAY = 1500;
  const SCROLLABLE_SELECTORS = [
    '.sidebar-view', '.chat-history', '.page-section',
    '.memo-inner-scroll', '.schedule-inner-scroll'
  ];

  document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;

    // textarea는 부모(.chat-box)에 클래스를 붙임
    const target = el.matches('textarea') ? el.closest('.chat-box') : el;
    if (!target) return;

    const isScrollable = SCROLLABLE_SELECTORS.some(sel => target.matches(sel)) || target.matches('textarea');
    if (!isScrollable) return;

    target.classList.add('scrollbar-active');
    if (scrollbarTimers.has(target)) clearTimeout(scrollbarTimers.get(target));
    scrollbarTimers.set(target, setTimeout(() => {
      target.classList.remove('scrollbar-active');
    }, SCROLLBAR_HIDE_DELAY));
  }, true); // capture phase로 버블링 없는 scroll도 감지

  // 탭/창 닫기 전 Redis → Postgres 플러시
  window.addEventListener('beforeunload', () => {
    if (TokenManager.isLoggedIn()) BackendHooks.flushSessions();
  });

  window.updatePlaceholder();
  adjustTextareaHeight(elements.chatInput, elements.chatBox);
  SidebarManager.syncContentState(elements);
});
