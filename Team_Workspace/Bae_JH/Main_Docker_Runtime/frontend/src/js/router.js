/**
 * router.js
 */

import { renderSettingsPage } from './settings.js';
import { renderAccountPage } from './account.js';
import { renderHelpPage } from './help.js';
import { BackendHooks, TokenManager } from './api.js';
import { HomeManager } from './home.js';
import { SidebarManager } from './sidebar.js';
import { CalendarManager } from './calendar.js';
import { showLoadingIndicator, removeLoadingIndicator, appendMessage, adjustTextareaHeight } from './ui.js';

const PAGES = {
  '#/settings': { type: 'page', renderer: renderSettingsPage },
  '#/account':  { type: 'page', renderer: renderAccountPage },
  '#/help':     { type: 'page', renderer: renderHelpPage },
  '#/':         { type: 'home' }
};

export function switchView(viewName, elements) {
  const {
    heroSection,
    chatHistory,
    chatWrap,
    pageSection,
    topBarActions,
    downloadChatBtn,
    shareChatBtn,
    mapToggleBtn
  } = elements;

  heroSection.style.display = 'none';
  chatHistory.style.display = 'none';
  chatWrap.style.display = 'none';
  pageSection.style.display = 'none';

  topBarActions.style.display = 'flex';

  switch (viewName) {
    case 'home':
      heroSection.style.display = 'flex';
      chatWrap.style.display = 'block';
      if (downloadChatBtn) downloadChatBtn.style.display = 'none';
      if (shareChatBtn)    shareChatBtn.style.display = 'none';
      if (mapToggleBtn)    mapToggleBtn.style.display = 'none';
      break;
    case 'chat':
      chatHistory.style.display = 'flex';
      chatWrap.style.display = 'block';
      if (downloadChatBtn) downloadChatBtn.style.display = 'flex';
      if (shareChatBtn)    shareChatBtn.style.display = 'flex';
      if (mapToggleBtn)    mapToggleBtn.style.display = 'flex';
      break;
    case 'page':
      pageSection.style.display = 'flex';
      if (downloadChatBtn) downloadChatBtn.style.display = 'none';
      if (shareChatBtn)    shareChatBtn.style.display = 'none';
      if (mapToggleBtn)    mapToggleBtn.style.display = 'none';
      break;
  }
}

export async function router(state, elements) {
  const path = window.location.hash || '#/';
  const { chatHistory, chatInput, chatBox, pageSection } = elements;

  if (path.startsWith('#/chat/')) {
    const ssid = path.replace('#/chat/', '');

    // Close any existing SSE connection before switching sessions
    if (state._sseConnection) {
      state._sseConnection.close();
      state._sseConnection = null;
    }

    let actualSessionMode = state.currentMode;

    if (state.currentSessionId !== ssid) {
      switchView('chat', elements);
      chatHistory.innerHTML = '';
      const loadingId = showLoadingIndicator(chatHistory);
      state.currentSessionId = ssid;

      CalendarManager.loadTripRange(ssid);
      SidebarManager.initMemoRows(elements);
      SidebarManager.initScheduleRows(elements);

      try {
        const result = await BackendHooks.fetchChatHistory(ssid);
        actualSessionMode = result.mode || state.currentMode;
        state.currentSessionMode = actualSessionMode;
        removeLoadingIndicator(loadingId);
        const myId = TokenManager.getUserId();
        for (const msg of result.messages) {
          let role;
          if (msg.sender_id && msg.sender_id === myId) {
            role = 'user';
          } else if (msg.sender_id && msg.sender_id !== myId) {
            role = 'bot';
          } else {
            role = msg.role;
          }
          appendMessage(chatHistory, msg.content, role);
        }
      } catch (e) {
        console.error(e);
        removeLoadingIndicator(loadingId);
      }
    } else {
      switchView('chat', elements);
      // 같은 세션 재진입 시에도 저장된 모드 사용
      if (state.currentSessionMode) actualSessionMode = state.currentSessionMode;
    }

    // SSE는 실제 세션 모드 기준으로 시작 (사이드바 탭 무관)
    if (actualSessionMode === 'team') {
      const myId = TokenManager.getUserId();
      state._sseConnection = BackendHooks.subscribeToSessionEvents(
        ssid,
        (event) => {
          if (event.type === 'message' && event.sender_id !== myId) {
            appendMessage(chatHistory, event.content, 'bot');
            chatHistory.scrollTop = chatHistory.scrollHeight;
          }
        },
        (err) => console.error('[SSE]', err)
      );
    }

    return;
  }

  const page = PAGES[path] || PAGES['#/'];

  // Close SSE when navigating away from chat
  if (state._sseConnection) {
    state._sseConnection.close();
    state._sseConnection = null;
  }

  state.currentSessionId = null;
  state.currentSessionMode = null;

  CalendarManager.loadTripRange(null);
  SidebarManager.initMemoRows(elements);
  SidebarManager.initScheduleRows(elements);

  if (page.type === 'home') {
    chatHistory.innerHTML = '';
    chatInput.value = '';
    adjustTextareaHeight(chatInput, chatBox);
    switchView('home', elements);

    if (state.isTempMode) {
      // 임시 채팅 모드: hereTempChat 헤더 + chatHistory 동시 표시
      document.getElementById('heroNormal')?.setAttribute('style', 'display:none');
      document.getElementById('hereTempChat')?.removeAttribute('style');
      if (elements.homeDashboard) {
        elements.homeDashboard.style.display = 'none';
        elements.heroSection?.classList.remove('dashboard-active');
      }
      // switchView('home')이 chatHistory를 숨기므로 다시 열어줌
      chatHistory.style.display = 'flex';
      const exitBtn = document.getElementById('exitTempChatBtn');
      if (exitBtn) {
        exitBtn.onclick = () => { elements._exitTempMode?.(); };
      }
      return;
    }

    // 일반 홈 — heroNormal 보장
    document.getElementById('heroNormal')?.removeAttribute('style');
    document.getElementById('hereTempChat')?.setAttribute('style', 'display:none');

    if (elements.homeDashboard) {
      if (TokenManager.isLoggedIn()) {
        elements.homeDashboard.style.display = 'block';
        elements.heroSection?.classList.add('dashboard-active');
        HomeManager.render(elements.homeDashboard, elements._onNewSession || (() => {}), elements._onTripSelect);
        elements._refreshSessions?.();
      } else {
        elements.homeDashboard.style.display = 'none';
        elements.heroSection?.classList.remove('dashboard-active');
      }
    }
  } else if (page.type === 'page') {
    switchView('page', elements);
    pageSection.innerHTML = '';
    page.renderer(pageSection);
  }
}
