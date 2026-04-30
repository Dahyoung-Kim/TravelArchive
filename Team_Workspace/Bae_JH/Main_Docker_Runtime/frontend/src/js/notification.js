/**
 * notification.js
 * 알림 패널 — 벨 아이콘 클릭 시 드롭다운, 세션 초대 수락/거절 처리.
 */

import { BackendHooks } from './api.js';

export const NotificationManager = {
  _panel: null,
  _badge: null,
  _btn: null,
  _pollTimer: null,

  init(elements, state) {
    this._btn   = elements.notifBtn;
    this._badge = elements.notifBadge;
    if (!this._btn) return;

    this._panel = this._createPanel();
    document.body.appendChild(this._panel);

    this._btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = this._panel.classList.toggle('notif-panel-open');
      if (open) this._render(state, elements);
    });

    document.addEventListener('click', (e) => {
      if (!this._panel.contains(e.target) && e.target !== this._btn) {
        this._panel.classList.remove('notif-panel-open');
      }
    });
  },

  _createPanel() {
    const el = document.createElement('div');
    el.className = 'notif-panel';
    el.innerHTML = '<div class="notif-panel-header">알림</div><div class="notif-panel-body"></div>';
    return el;
  },

  async refresh(state, elements) {
    if (!BackendHooks.fetchNotifications) return;
    try {
      const notifs = await BackendHooks.fetchNotifications();
      const unread = notifs.filter(n => !n.is_read).length;
      this._updateBadge(unread);
      if (this._panel?.classList.contains('notif-panel-open')) {
        this._renderItems(notifs, state, elements);
      }
    } catch (e) {
      console.error('[Notification] refresh failed:', e);
    }
  },

  _updateBadge(count) {
    if (!this._badge) return;
    if (count > 0) {
      this._badge.textContent = count > 99 ? '99+' : count;
      this._badge.style.display = '';
    } else {
      this._badge.style.display = 'none';
    }
  },

  async _render(state, elements) {
    const body = this._panel.querySelector('.notif-panel-body');
    body.innerHTML = '<div class="notif-loading">불러오는 중...</div>';
    try {
      const notifs = await BackendHooks.fetchNotifications();
      this._updateBadge(notifs.filter(n => !n.is_read).length);
      this._renderItems(notifs, state, elements);
    } catch {
      body.innerHTML = '<div class="notif-empty">알림을 불러올 수 없습니다</div>';
    }
  },

  _renderItems(notifs, state, elements) {
    const body = this._panel.querySelector('.notif-panel-body');
    if (!notifs.length) {
      body.innerHTML = '<div class="notif-empty">알림이 없습니다</div>';
      return;
    }

    body.innerHTML = '';
    for (const n of notifs) {
      const item = document.createElement('div');
      item.className = 'notif-item' + (n.is_read ? ' notif-read' : '');
      item.dataset.id = n.notification_id;

      const msg = document.createElement('p');
      msg.className = 'notif-msg';
      msg.textContent = n.message;
      item.appendChild(msg);

      if (!n.is_read && n.type === 'session_invite') {
        const actions = document.createElement('div');
        actions.className = 'notif-actions';

        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'notif-accept-btn';
        acceptBtn.textContent = '수락';
        acceptBtn.addEventListener('click', async () => {
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;
          try {
            const result = await BackendHooks.acceptNotification(n.notification_id);
            item.classList.add('notif-read');
            actions.remove();
            this._updateBadge(
              this._panel.querySelectorAll('.notif-item:not(.notif-read)').length
            );
            this._panel.classList.remove('notif-panel-open');

            if (result.session_id) {
              // 팀 플래너 탭으로 전환 후 해당 세션으로 이동
              elements._switchToTeamMode?.();
              window.location.hash = `#/chat/${result.session_id}`;
            }
          } catch {
            acceptBtn.disabled = false;
            rejectBtn.disabled = false;
          }
        });

        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'notif-reject-btn';
        rejectBtn.textContent = '거절';
        rejectBtn.addEventListener('click', async () => {
          acceptBtn.disabled = true;
          rejectBtn.disabled = true;
          try {
            await BackendHooks.dismissNotification(n.notification_id);
            item.classList.add('notif-read');
            actions.remove();
            this._updateBadge(
              this._panel.querySelectorAll('.notif-item:not(.notif-read)').length
            );
          } catch {
            acceptBtn.disabled = false;
            rejectBtn.disabled = false;
          }
        });

        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);
        item.appendChild(actions);
      }
      body.appendChild(item);
    }
  },

  startPolling(state, elements, intervalMs = 30000) {
    this.stopPolling();
    this.refresh(state, elements);
    this._pollTimer = setInterval(() => this.refresh(state, elements), intervalMs);
  },

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._updateBadge(0);
    if (this._panel) this._panel.classList.remove('notif-panel-open');
  },
};
