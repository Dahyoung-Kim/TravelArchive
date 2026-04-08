/**
 * ui.js
 */

import { Icons } from './assets.js';
import { renderTemplate, createElementFromHTML } from './utils.js';

export function updateSidebarSessionTitle(sessionId, newTitle) {
  const itemBtn = document.querySelector(`.sidebar-item[data-session-id="${sessionId}"]`);
  if (itemBtn) itemBtn.innerHTML = `<span class="dot"></span>${newTitle}`;
  const wrapper = itemBtn?.closest('.sidebar-item-wrapper');
  if (wrapper) {
    const editInput = wrapper.querySelector('.sidebar-item-edit-input');
    if (editInput) editInput.value = newTitle;
  }
}

export function showToast(message) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  if (toast.hideTimeout) clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

export function adjustTextareaHeight(chatInput, chatBox) {
  if (!chatInput) return;
  const style = window.getComputedStyle(chatInput);
  const lineHeight = parseFloat(style.lineHeight) || 21;
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const baseHeight = lineHeight + padding + borders;
  const minHeight = Math.max(32, Math.ceil(baseHeight));
  const maxHeight = chatBox.classList.contains('expanded') ? 360 : 180;

  chatInput.style.height = 'auto';
  const nextHeight = Math.min(Math.max(chatInput.scrollHeight, minHeight), maxHeight);
  chatInput.style.height = `${nextHeight}px`;
  chatInput.style.overflowY = nextHeight >= maxHeight ? 'auto' : 'hidden';
}

export function showLoadingIndicator(chatHistory) {
  const loadingId = 'loading-' + Date.now();
  const html = renderTemplate('loading');
  const rowDiv = createElementFromHTML(html);
  rowDiv.id = loadingId;
  chatHistory.appendChild(rowDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return loadingId;
}

export function removeLoadingIndicator(id) {
  document.getElementById(id)?.remove();
}

export function appendMessage(chatHistory, text, sender) {
  let processedText = text;
  if (sender === 'bot' && text && typeof marked !== 'undefined') {
    processedText = marked.parse(text);
  }

  const html = renderTemplate('message', { sender, text: processedText }, Icons);
  const rowDiv = createElementFromHTML(html);
  const msgDiv = rowDiv.querySelector('.message');
  const copyBtn = rowDiv.querySelector('.copy-btn');

  if (!(sender === 'bot' && text && typeof marked !== 'undefined')) {
    msgDiv.textContent = text;
  }

  copyBtn.addEventListener('click', async () => {
    const currentText = msgDiv.innerText || msgDiv.textContent;
    try {
      await navigator.clipboard.writeText(currentText);
      const originalIcon = copyBtn.innerHTML;
      copyBtn.innerHTML = Icons.Check;
      if (copyBtn.querySelector('svg')) copyBtn.querySelector('svg').style.stroke = '#10B981';
      setTimeout(() => copyBtn.innerHTML = originalIcon, 2000);
      showToast('메시지가 복사되었습니다.');
    } catch (err) { console.error(err); }
  });

  chatHistory.appendChild(rowDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return rowDiv;
}
