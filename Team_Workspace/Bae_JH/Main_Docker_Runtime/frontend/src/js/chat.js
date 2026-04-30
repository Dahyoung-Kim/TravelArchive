/**
 * chat.js
 * handles chat interactions, messaging, and file uploads.
 */

import { BackendHooks } from './api.js';
import {
  showLoadingIndicator,
  removeLoadingIndicator,
  appendMessage,
  adjustTextareaHeight,
  updateSidebarSessionTitle
} from './ui.js';
import { switchView } from './router.js';
import { SessionManager } from './session.js';

export const ChatManager = {
  async handleSend(state, elements) {
    const { chatInput, chatHistory, sendBtn, chatBox } = elements;

    const text = chatInput.value.trim();
    if (!text || state.isReceiving) return;

    // 사이드바 탭(currentMode)이 아닌 실제 세션 모드 기준으로 분기
    const isTeamMode = (state.currentSessionMode || state.currentMode) === 'team';

    let isNewSession = false;
    if (!state.currentSessionId) {
      const effectiveTripId = state.currentTripId === 'none' ? null : (state.currentTripId || null);
      const session = await BackendHooks.createSession(text, state.currentMode || 'personal', effectiveTripId);
      const sid = session.id || session.session_id;
      state.currentSessionId = sid;
      state.currentSessionMode = state.currentMode || 'personal';
      SessionManager.renderSidebarItem(session.title, sid, elements, state, true, session.trip_color);
      isNewSession = true;
    }

    if (isNewSession) {
      switchView('chat', elements);
      window.location.hash = `#/chat/${state.currentSessionId}`;
    }

    appendMessage(chatHistory, text, 'user');
    chatInput.value = '';
    adjustTextareaHeight(chatInput, chatBox);

    if (isTeamMode) {
      // Team mode: AI 완전 배제 — 전용 엔드포인트로 저장 + SSE 브로드캐스트만
      await BackendHooks.sendTeamMessage(state.currentSessionId, text);
      return;
    }

    // Personal mode: AI streaming
    state.isReceiving = true;
    sendBtn.disabled = true;
    const loadingId = showLoadingIndicator(chatHistory);
    let botMsgDiv = null;

    try {
      await BackendHooks.sendMessage(
        state.currentSessionId,
        text,
        (chunk) => {
          if (!botMsgDiv) {
            removeLoadingIndicator(loadingId);
            botMsgDiv = appendMessage(chatHistory, '', 'bot');
          }

          const messageEl = botMsgDiv.querySelector('.message');
          if (typeof marked !== 'undefined') {
            messageEl.innerHTML = marked.parse(chunk);
          } else {
            messageEl.textContent = chunk;
          }
          chatHistory.scrollTop = chatHistory.scrollHeight;
        },
        async () => {
          state.isReceiving = false;
          sendBtn.disabled = false;

          try {
            const sessions = await BackendHooks.fetchSessionList(state.currentMode || 'personal');
            const updatedSession = sessions.find(s => (s.id || s.session_id) === state.currentSessionId);
            if (updatedSession) {
              updateSidebarSessionTitle(state.currentSessionId, updatedSession.title);
            }
          } catch (e) {
            console.error("Failed to update session title:", e);
          }
        }
      );
    } catch (error) {
      console.error("Error in handleSend:", error);
      state.isReceiving = false;
      sendBtn.disabled = false;
      removeLoadingIndicator(loadingId);
    }
  },

  handleFileUpload(files, state, elements) {
    const { chatHistory, fileInput } = elements;

    if (!state.currentSessionId) {
      alert("먼저 대화를 시작해주세요.");
      return;
    }

    const fileNames = Array.from(files).map(f => f.name).join(', ');
    appendMessage(chatHistory, `[파일 첨부] ${fileNames}`, 'user');

    BackendHooks.uploadFiles(state.currentSessionId, files);
    fileInput.value = "";
  }
};
