// script.js (루트 폴더 위치)
import { BackendHooks } from './js/api.js';
import { 
  updateSidebarSessionTitle, 
  showToast, 
  adjustTextareaHeight, 
  showLoadingIndicator, 
  removeLoadingIndicator, 
  appendMessage 
} from './js/ui.js';
import { WeatherManager } from './js/weatherManager.js';

document.addEventListener('DOMContentLoaded', () => {

  // 1. DOM 요소 및 전역 상태
  const mainContent = document.getElementById('mainContent');
  const heroSection = document.getElementById('heroSection');
  const pageSection = document.getElementById('pageSection');
  const chatWrap = document.getElementById('chatWrap');
  
  const chatHistory = document.getElementById('chatHistory');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const chatBox = document.getElementById('chatBox');
  const expandBtn = document.getElementById('expandBtn');
  
  const sidebar = document.getElementById('sidebar');
  const sidebarList = document.getElementById('sidebarList');
  const menuToggle = document.getElementById('menuToggle');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  
  const rightSidebar = document.getElementById('rightSidebar');
  const mapToggleBtn = document.getElementById('mapToggleBtn');
  const closeRightSidebarBtn = document.getElementById('closeRightSidebarBtn');
  const rightSidebarOverlay = document.getElementById('rightSidebarOverlay');

  const homeBtn = document.getElementById('homeBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const accountBtn = document.getElementById('accountBtn');
  const helpBtn = document.getElementById('helpBtn');
  
  const themeBtn = document.getElementById('themeBtn');
  const themePopup = document.getElementById('themePopup');
  const themeSwatches = document.querySelectorAll('.theme-swatch');

  const weatherLayer = document.getElementById('weatherLayer');

  const topBarActions = document.getElementById('topBarActions');
  const downloadChatBtn = document.getElementById('downloadChatBtn');
  const shareChatBtn = document.getElementById('shareChatBtn');
  
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');

  let currentSessionId = null;
  let isReceiving = false;

  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;


  // 2. 라우팅 및 뷰 전환
  function switchView(viewName) {
    heroSection.style.display = 'none';
    chatHistory.style.display = 'none';
    chatWrap.style.display = 'none';
    pageSection.style.display = 'none';
    topBarActions.style.display = 'none';

    if (viewName === 'home') {
      heroSection.style.display = 'flex'; chatWrap.style.display = 'block'; currentSessionId = null;
    } else if (viewName === 'chat') {
      chatHistory.style.display = 'flex'; chatWrap.style.display = 'block'; topBarActions.style.display = 'flex';
    } else if (viewName === 'page') {
      pageSection.style.display = 'flex'; currentSessionId = null;
    }
  }

  async function router() {
    const path = window.location.hash;
    if (path === '' || path === '#/') {
      switchView('home'); 
      chatHistory.innerHTML = ''; 
      chatInput.value = ''; 
      adjustTextareaHeight(chatInput, chatBox); 
      chatBox.classList.remove('expanded');
    } else if (path === '#/settings') {
      switchView('page'); 
      pageSection.innerHTML = `<h2>설정</h2><p>데이터를 불러오는 중...</p>`; 
      const res = await BackendHooks.fetchSettings(); 
      pageSection.innerHTML = `<h2>설정</h2><p>${res.data}</p>`;
    } else if (path === '#/account') {
      switchView('page'); 
      pageSection.innerHTML = `<h2>계정</h2><p>데이터를 불러오는 중...</p>`; 
      const res = await BackendHooks.fetchAccountInfo(); 
      pageSection.innerHTML = `<h2>계정</h2><p>${res.data}</p>`;
    } else if (path === '#/help') {
      switchView('page'); 
      pageSection.innerHTML = `<h2>도움말</h2><p>데이터를 불러오는 중...</p>`; 
      const res = await BackendHooks.fetchHelpData(); 
      pageSection.innerHTML = `<h2>도움말</h2><p>${res.data}</p>`;
    } else if (path.startsWith('#/chat/')) {
      const ssid = path.replace('#/chat/', '');
      if (currentSessionId !== ssid) {
        switchView('chat'); 
        chatHistory.innerHTML = '';
        const loadingId = showLoadingIndicator(chatHistory);
        currentSessionId = ssid;
        
        const historyData = await BackendHooks.fetchChatHistory(ssid);
        removeLoadingIndicator(loadingId);
        historyData.forEach(msg => appendMessage(chatHistory, msg.content, msg.role));
      } else { 
        switchView('chat'); 
      }
    }
  }

  // 3. 사이드바 아이템 렌더링
  function renderSidebarItem(title, sessionId, isPrepend = true) {
    const wrapper = document.createElement('div');
    wrapper.className = 'sidebar-item-wrapper';

    const newBtn = document.createElement('button'); 
    newBtn.classList.add('sidebar-item'); 
    newBtn.setAttribute('data-session-id', sessionId);
    newBtn.innerHTML = `<span class="dot"></span>${title}`;
    
    const editInput = document.createElement('input');
    editInput.className = 'sidebar-item-edit-input';
    editInput.type = 'text';
    editInput.value = title;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'session-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'session-action-btn';
    editBtn.innerHTML = '✎';
    editBtn.title = "이름 변경";

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'session-action-btn';
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    deleteBtn.title = "대화 삭제";

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    newBtn.addEventListener('click', () => { if (isReceiving) return; window.location.hash = `#/chat/${sessionId}`; });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      newBtn.style.display = 'none';
      actionsDiv.style.display = 'none';
      editInput.style.display = 'block';
      editInput.focus();
    });

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if(confirm("이 대화를 정말로 삭제하시겠습니까?")) {
        try {
          const response = await BackendHooks.deleteSession(sessionId);
          if (response.success) {
            console.log(response.message);
            wrapper.remove(); 
            const currentTitle = editInput.value;
            showToast(`세션 '${currentTitle}'이(가) 삭제되었습니다.`);
            
            if (currentSessionId === sessionId) {
              window.location.hash = '#/';
            }
          } else {
            alert("삭제에 실패했습니다.");
          }
        } catch (error) {
          console.error("삭제 통신 오류:", error);
          alert("서버와의 연결에 문제가 발생했습니다.");
        }
      }
    });

    const saveTitle = async () => {
      const newTitle = editInput.value.trim();
      if (newTitle && newTitle !== title) {
        await BackendHooks.updateSessionTitle(sessionId, newTitle);
        updateSidebarSessionTitle(sessionId, newTitle);
        title = newTitle; 
      } else {
        editInput.value = title; 
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

    wrapper.appendChild(newBtn);
    wrapper.appendChild(editInput);
    wrapper.appendChild(actionsDiv);

    if (isPrepend) sidebarList.prepend(wrapper); 
    else sidebarList.appendChild(wrapper);
  }

  // 4. 채팅 핵심 로직
  async function handleSend() {
    const text = chatInput.value.trim(); if (!text || isReceiving) return;
    let isNewSession = false;

    if (!currentSessionId) {
        const session = await BackendHooks.createSession(text);
        currentSessionId = session.id; renderSidebarItem(session.title, session.id, true); isNewSession = true;
    }
    if (isNewSession) { history.pushState(null, '', `#/chat/${currentSessionId}`); switchView('chat'); }

    appendMessage(chatHistory, text, 'user'); 
    chatInput.value = ''; 
    adjustTextareaHeight(chatInput, chatBox);
    isReceiving = true; 
    sendBtn.disabled = true; 
    const loadingId = showLoadingIndicator(chatHistory); 
    let botMsgDiv = null;

    await BackendHooks.sendMessage(currentSessionId, text, (chunk) => {
        if (!botMsgDiv) { 
          removeLoadingIndicator(loadingId); 
          botMsgDiv = appendMessage(chatHistory, '', 'bot'); 
        }
        if (typeof marked !== 'undefined') {
          botMsgDiv.querySelector('.message').innerHTML = marked.parse(chunk); 
        } else {
          botMsgDiv.querySelector('.message').textContent = chunk;
        }
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }, async () => { 
        isReceiving = false; 
        sendBtn.disabled = false; 
        
        try {
          const sessions = await BackendHooks.fetchSessionList();
          const updatedSession = sessions.find(s => s.id === currentSessionId);
          if (updatedSession) {
            updateSidebarSessionTitle(currentSessionId, updatedSession.title);
          }
        } catch (e) {
          console.error("세션 이름 동기화 실패:", e);
        }
      }
    );
  }

  // 5. 이벤트 바인딩 및 초기화
  async function init() {
    sidebarList.innerHTML = '';
    const sessions = await BackendHooks.fetchSessionList();
    sessions.forEach(session => renderSidebarItem(session.title, session.id, false));
  }

  window.addEventListener('hashchange', router); 
  window.addEventListener('load', router);
  
  // 왼쪽 사이드바 제어 로직
  menuToggle.addEventListener('click', toggleSidebar);

  function openSidebar() {
    if (isMobile()) { 
      sidebar.classList.add('open'); 
      if (sidebarOverlay) { 
        sidebarOverlay.style.display = 'block'; 
        requestAnimationFrame(() => sidebarOverlay.classList.add('show')); 
      }
    } else { sidebar.classList.remove('collapsed'); }
  }

  function closeSidebar() {
    if (isMobile()) { 
      sidebar.classList.remove('open'); 
      if (sidebarOverlay) { 
        sidebarOverlay.classList.remove('show'); 
        setTimeout(() => { sidebarOverlay.style.display = 'none'; }, 300); 
      }
    } else { sidebar.classList.add('collapsed'); }
  }

  function toggleSidebar() { 
    if (isMobile()) { sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); } 
    else { sidebar.classList.contains('collapsed') ? openSidebar() : closeSidebar(); } 
  }

  // 오른쪽 사이드바 제어 로직
  function openRightSidebar() {
    if (isMobile()) { 
      rightSidebar.classList.add('open'); 
      if (rightSidebarOverlay) { 
        rightSidebarOverlay.style.display = 'block'; 
        requestAnimationFrame(() => rightSidebarOverlay.classList.add('show')); 
      }
    } else { rightSidebar.classList.remove('collapsed'); }
  }

  function closeRightSidebar() {
    if (isMobile()) { 
      rightSidebar.classList.remove('open'); 
      if (rightSidebarOverlay) { 
        rightSidebarOverlay.classList.remove('show'); 
        setTimeout(() => { rightSidebarOverlay.style.display = 'none'; }, 300); 
      }
    } else { rightSidebar.classList.add('collapsed'); }
  }

  function toggleRightSidebar() { 
    if (isMobile()) { rightSidebar.classList.contains('open') ? closeRightSidebar() : openRightSidebar(); } 
    else { rightSidebar.classList.contains('collapsed') ? openRightSidebar() : closeRightSidebar(); } 
  }

  if (mapToggleBtn) mapToggleBtn.addEventListener('click', toggleRightSidebar);
  if (closeRightSidebarBtn) closeRightSidebarBtn.addEventListener('click', closeRightSidebar);

  // 창 크기 변경 시 오버레이 초기화
  window.addEventListener('resize', () => { 
    if (!isMobile()) { 
      sidebar.classList.remove('open'); 
      if (sidebarOverlay) { sidebarOverlay.classList.remove('show'); sidebarOverlay.style.display = 'none'; } 
      
      rightSidebar.classList.remove('open'); 
      if (rightSidebarOverlay) { rightSidebarOverlay.classList.remove('show'); rightSidebarOverlay.style.display = 'none'; } 
    } 
  });
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
  if (rightSidebarOverlay) rightSidebarOverlay.addEventListener('click', closeRightSidebar);
  
  homeBtn.addEventListener('click', () => { if (isMobile()) closeSidebar(); if(!isReceiving) window.location.hash = '#/'; });
  newChatBtn.addEventListener('click', () => { if (isMobile()) closeSidebar(); if(isReceiving) return; window.location.hash = '#/'; });
  settingsBtn.addEventListener('click', () => { if (isMobile()) closeSidebar(); window.location.hash = '#/settings'; });
  accountBtn.addEventListener('click', () => { if (isMobile()) closeSidebar(); window.location.hash = '#/account'; });
  helpBtn.addEventListener('click', () => { if (isMobile()) closeSidebar(); window.location.hash = '#/help'; });

  themeBtn.addEventListener('click', (e) => { e.stopPropagation(); themePopup.classList.toggle('show'); });
  document.addEventListener('click', () => themePopup.classList.remove('show'));
  
  themeSwatches.forEach(swatch => {
    swatch.addEventListener('click', async () => {
      const theme = swatch.getAttribute('data-theme');
      if (theme === 'default') document.body.removeAttribute('data-theme');
      else document.body.setAttribute('data-theme', theme);
      
      themePopup.classList.remove('show');
      
      if (theme === 'weather') {
        await WeatherManager.syncWeather(weatherLayer);
      } else {
        WeatherManager.clear(weatherLayer);
      }

      await BackendHooks.saveThemePreference(theme);
    });
  });

  chatInput.addEventListener('input', () => adjustTextareaHeight(chatInput, chatBox));
  
  expandBtn.addEventListener('click', () => { 
    chatBox.classList.toggle('expanded'); 
    if(chatBox.classList.contains('expanded')) chatInput.style.height = 'auto'; 
    else adjustTextareaHeight(chatInput, chatBox); 
  });
  
  chatInput.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { 
      e.preventDefault(); handleSend(); 
    } 
  });
  
  sendBtn.addEventListener('click', handleSend);

  downloadChatBtn.addEventListener('click', () => {
    if (!currentSessionId) return;
    if(confirm("전체 대화 기록을 다운로드하시겠습니까?")) {
      BackendHooks.downloadChat(currentSessionId);
    }
  });

  shareChatBtn.addEventListener('click', () => {
    alert("공유하기 기능이 호출되었습니다."); 
  });

  attachBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files);
    }
  });

  chatBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatBox.classList.add('drag-over');
  });

  chatBox.addEventListener('dragleave', () => {
    chatBox.classList.remove('drag-over');
  });

  chatBox.addEventListener('drop', (e) => {
    e.preventDefault();
    chatBox.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  });

  function handleFileUpload(files) {
    if (!currentSessionId) {
      alert("먼저 대화를 시작해주세요.");
      return;
    }
    const fileNames = Array.from(files).map(f => f.name).join(', ');
    appendMessage(chatHistory, `[파일 첨부] ${fileNames}`, 'user'); 
    BackendHooks.uploadFiles(currentSessionId, files); 
    fileInput.value = ""; 
  }

  init();
});