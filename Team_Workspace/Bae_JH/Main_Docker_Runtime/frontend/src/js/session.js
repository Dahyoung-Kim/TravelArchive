/**
 * session.js
 */

import { BackendHooks } from './api.js';
import { Icons } from './assets.js';
import { renderTemplate, createElementFromHTML } from './utils.js';
import { updateSidebarSessionTitle, showToast } from './ui.js';

// 드롭다운 외부 클릭 시 닫기 — 세션 수에 관계없이 단 한 번만 등록
document.addEventListener('click', () => {
  document.querySelectorAll('.session-dropdown-menu.show').forEach(m => m.classList.remove('show'));
});

export const SessionManager = {
  _initSeq: 0,  // race condition guard: 마지막 init 호출만 DOM에 반영

  renderSidebarItem(title, sessionId, elements, state, isPrepend = true, tripColor = null, userRole = 'master') {
    const tripColorStyle = tripColor ? `background:${tripColor}` : '';
    const html = renderTemplate('session_item', { title, sessionId, tripColorStyle }, Icons);
    const wrapper = createElementFromHTML(html);

    const newBtn = wrapper.querySelector('.sidebar-item');
    const editInput = wrapper.querySelector('.sidebar-item-edit-input');
    const actionsDiv = wrapper.querySelector('.session-actions');
    const moreBtn = wrapper.querySelector('.more-btn');
    const dropdownMenu = wrapper.querySelector('.session-dropdown-menu');
    const editBtn = wrapper.querySelector('.edit-btn');
    const deleteBtn = wrapper.querySelector('.delete-btn');
    const teamPlannerBtn = wrapper.querySelector('.team-planner-btn');
    const inviteBtn = wrapper.querySelector('.invite-btn');

    // Configure the 'Move' button based on current mode
    const moveBtnText = teamPlannerBtn.querySelector('span:last-child');
    const moveBtnIcon = teamPlannerBtn.querySelector('.icon');
    
    if (state.currentMode === 'team') {
      inviteBtn.style.display = 'flex';
      moveBtnText.textContent = '개인 플래너 이동';
      moveBtnIcon.innerHTML = Icons.Home;
      // 마스터가 아니면 개인 전환 버튼 비활성화
      if (userRole !== 'master') {
        teamPlannerBtn.disabled = true;
        teamPlannerBtn.title = '마스터만 전환할 수 있습니다';
        teamPlannerBtn.style.opacity = '0.4';
        teamPlannerBtn.style.cursor = 'not-allowed';
      }
    } else {
      moveBtnText.textContent = '팀 플래너 이동';
      moveBtnIcon.innerHTML = Icons.Map;
    }
    
    newBtn.addEventListener('click', () => {
      if (state.isReceiving) return;
      window.location.hash = `#/chat/${sessionId}`;
    });
    
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close other open menus
      document.querySelectorAll('.session-dropdown-menu.show').forEach(menu => {
        if (menu !== dropdownMenu) menu.classList.remove('show');
      });
      dropdownMenu.classList.toggle('show');
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.remove('show');
      newBtn.style.display = 'none';
      actionsDiv.style.display = 'none';
      editInput.style.display = 'block';
      editInput.focus();
    });
    
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      dropdownMenu.classList.remove('show');
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

    teamPlannerBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (teamPlannerBtn.disabled) return;
      dropdownMenu.classList.remove('show');

      const targetMode = state.currentMode === 'personal' ? 'team' : 'personal';

      try {
        await BackendHooks.updateSessionMode(sessionId, targetMode);
        wrapper.remove();
        showToast(`${targetMode === 'team' ? '팀' : '개인'} 플래너로 이동되었습니다.`);
      } catch (error) {
        console.error("Failed to move session mode:", error);
      }
    });

    inviteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.remove('show');

      const modalHtml = renderTemplate('user_search', {}, Icons);
      const modal = createElementFromHTML(modalHtml);
      document.body.appendChild(modal);
      setTimeout(() => modal.classList.add('show'), 10);

      const closeBtn   = modal.querySelector('.modal-close-btn');
      const input      = modal.querySelector('#userSearchInput');
      const searchBtn  = modal.querySelector('.modal-action-btn');
      const resultsDiv = modal.querySelector('.search-results-placeholder');

      const close = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
      };
      closeBtn.addEventListener('click', close);
      modal.addEventListener('click', ev => { if (ev.target === modal) close(); });

      const doSearch = async () => {
        const q = input.value.trim();
        if (!q) return;
        resultsDiv.innerHTML = '<p style="color:var(--text-secondary,#888);font-size:13px;padding:8px 0">검색 중...</p>';
        const users = await BackendHooks.searchUsers(q);
        if (!users.length) {
          resultsDiv.innerHTML = '<p style="color:var(--text-secondary,#888);font-size:13px;padding:8px 0">검색 결과가 없습니다.</p>';
          return;
        }
        resultsDiv.innerHTML = '';
        for (const user of users) {
          const item = document.createElement('div');
          item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid var(--border-color,#eee)';
          const nameSpan = document.createElement('span');
          nameSpan.style.cssText = 'font-size:14px;color:var(--text-primary,#222)';
          nameSpan.textContent = user.nickname || user.user_id;
          const invBtn = document.createElement('button');
          invBtn.style.cssText = 'padding:4px 12px;border-radius:6px;background:var(--accent,#2563eb);color:#fff;border:none;cursor:pointer;font-size:13px';
          invBtn.textContent = '초대';
          invBtn.addEventListener('click', async () => {
            try {
              await BackendHooks.inviteUserToSession(sessionId, user.user_id);
              showToast(`${user.nickname || user.user_id}님이 초대되었습니다.`);
              close();
            } catch {
              showToast('초대에 실패했습니다.');
            }
          });
          item.appendChild(nameSpan);
          item.appendChild(invBtn);
          resultsDiv.appendChild(item);
        }
      };

      searchBtn.addEventListener('click', doSearch);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
      input.focus();
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
    const seq    = ++this._initSeq;
    elements.sidebarList.innerHTML = '';
    const mode   = state.currentMode   || 'personal';
    const tripId = state.currentTripId || null;

    try {
      const sessions = await BackendHooks.fetchSessionList(mode, tripId);
      if (seq !== this._initSeq) return; // 더 최신 init이 실행됐으면 결과 버림
      for (const session of sessions) {
        this.renderSidebarItem(session.title, session.session_id || session.id, elements, state, false, session.trip_color, session.user_role || 'master');
      }
    } catch (error) { console.error(error); }
  }
};
