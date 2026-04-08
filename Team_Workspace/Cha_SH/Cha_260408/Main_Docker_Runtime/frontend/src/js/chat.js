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
  /**
   * handles sending a message.
   */
  async handleSend(state, elements) {
    const { 
      chatInput, 
      chatHistory, 
      sendBtn, 
      chatBox 
    } = elements;

    const text = chatInput.value.trim();
    if (!text || state.isReceiving) return;

    let isNewSession = false;
    if (!state.currentSessionId) {
      const session = await BackendHooks.createSession(text);
      state.currentSessionId = session.id;
      SessionManager.renderSidebarItem(session.title, session.id, elements, state, true);
      isNewSession = true;
    }

    if (isNewSession) {
      history.pushState(null, '', `#/chat/${state.currentSessionId}`);
      switchView('chat', elements);
    }

    appendMessage(chatHistory, text, 'user');
    chatInput.value = '';
    adjustTextareaHeight(chatInput, chatBox);

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
          
          // Refresh session list/title if needed
          try {
            const sessions = await BackendHooks.fetchSessionList();
            const updatedSession = sessions.find(s => s.id === state.currentSessionId);
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

  /**
   * handles file uploading.
   */
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
