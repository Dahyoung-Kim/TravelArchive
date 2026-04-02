/**
 * session.js
 */

import { BackendHooks } from './api.js';
import { Icons } from './assets.js';
import { renderTemplate, createElementFromHTML } from './utils.js';
import { updateSidebarSessionTitle, showToast } from './ui.js';

export const SessionManager = {
  renderSidebarItem(title, sessionId, elements, state, isPrepend = true) {
    const html = renderTemplate('session_item', { title, sessionId }, Icons);
    const wrapper = createElementFromHTML(html);

    const newBtn = wrapper.querySelector('.sidebar-item');
    const editInput = wrapper.querySelector('.sidebar-item-edit-input');
    const actionsDiv = wrapper.querySelector('.session-actions');
    const editBtn = wrapper.querySelector('.edit-btn');
    const deleteBtn = wrapper.querySelector('.delete-btn');
    
    newBtn.addEventListener('click', () => {
      if (state.isReceiving) return;
      window.location.hash = `#/chat/${sessionId}`;
    });
    
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      newBtn.style.display = 'none';
      actionsDiv.style.display = 'none';
      editInput.style.display = 'block';
      editInput.focus();
    });
    
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if(confirm("삭제하시겠습니까?")) {
        try {
          const response = await BackendHooks.deleteSession(sessionId);
          if (response.success) {
            wrapper.remove();
            showToast(`삭제됨`);
            if (state.currentSessionId === sessionId) window.location.hash = '#/';
          }
        } catch (error) { console.error(error); }
      }
    });

    const saveTitle = async () => {
      const newTitle = editInput.value.trim();
      if (newTitle && newTitle !== title) {
        try {
          await BackendHooks.updateSessionTitle(sessionId, newTitle);
          updateSidebarSessionTitle(sessionId, newTitle);
          title = newTitle;
        } catch (error) { console.error(error); }
      }
      editInput.style.display = 'none';
      newBtn.style.display = 'flex';
      actionsDiv.style.display = '';
    };

    editInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveTitle();
      else if (e.key === 'Escape') {
        editInput.value = title;
        editInput.style.display = 'none';
        newBtn.style.display = 'flex';
        actionsDiv.style.display = '';
      }
    });
    
    editInput.addEventListener('blur', saveTitle);

    if (isPrepend) elements.sidebarList.prepend(wrapper);
    else elements.sidebarList.appendChild(wrapper);
  },

  async init(elements, state) {
    elements.sidebarList.innerHTML = '';
    try {
      const sessions = await BackendHooks.fetchSessionList();
      for (const session of sessions) {
        this.renderSidebarItem(session.title, session.id, elements, state, false);
      }
    } catch (error) { console.error(error); }
  }
};
