/**
 * account.js
 */

import { Icons } from './assets.js';
import { renderTemplate } from './utils.js';

export function renderAccountPage(container) {
  container.innerHTML = renderTemplate('account', {}, Icons);

  const loginBtn = document.getElementById('loginBtn');
  const loginIdInput = document.getElementById('loginId');
  const loginPwInput = document.getElementById('loginPw');

  const handleLogin = () => {
    const id = loginIdInput.value;
    const pw = loginPwInput.value;
    if (id && pw) alert(`${id}님, 환영합니다!`);
    else if (!id) { alert('아이디를 입력해주세요.'); loginIdInput.focus(); }
    else { alert('비밀번호를 입력해주세요.'); loginPwInput.focus(); }
  };

  if (loginIdInput) loginIdInput.addEventListener('keydown', (e) => e.key === 'Enter' && handleLogin());
  if (loginPwInput) loginPwInput.addEventListener('keydown', (e) => e.key === 'Enter' && handleLogin());
  if (loginBtn) loginBtn.addEventListener('click', handleLogin);

  ['google', 'kakao', 'naver'].forEach(provider => {
    const btn = document.getElementById(`${provider}LoginBtn`);
    if (btn) btn.addEventListener('click', () => alert(`${provider} 연동 준비 중`));
  });

  const signUpBtn = document.getElementById('signUpBtn');
  if (signUpBtn) signUpBtn.addEventListener('click', () => alert('회원가입 준비 중'));
}
