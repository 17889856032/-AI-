/* ============================================================
 * auth.js —— 登录 / 注册
 * ============================================================ */
(function () {
  'use strict';
  const { store, ui } = window.ECP;

  let mode = 'login';

  function init() {
    const tabs = document.querySelectorAll('.auth-tab');
    const tabsBox = document.querySelector('.auth-tabs');
    const pwd2 = document.querySelector('.field-register');
    const submitBtn = document.getElementById('auth-submit');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        mode = tab.dataset.mode;
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        tabsBox.classList.toggle('mode-register', mode === 'register');
        pwd2.classList.toggle('hidden', mode === 'login');
        submitBtn.textContent = mode === 'login' ? '登 录' : '注 册';
        hideError();
      });
    });

    document.getElementById('auth-form').addEventListener('submit', onSubmit);
  }

  function showError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function hideError() {
    document.getElementById('auth-error').classList.add('hidden');
  }

  function onSubmit(e) {
    e.preventDefault();
    hideError();

    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const password2 = document.getElementById('auth-password2').value;

    if (username.length < 2) return showError('请输入至少 2 个字符的账号');
    if (password.length < 6) return showError('密码至少 6 位');

    if (mode === 'register') {
      if (password !== password2) return showError('两次输入的密码不一致');
      const r = store.createUser(username, password);
      if (!r.ok) return showError(r.msg);
      store.setSession(r.user.id);
      ui.toast('注册成功，欢迎加入青眸');
      window.ECP.app.enterApp(true);
      return;
    }

    const r = store.verifyUser(username, password);
    if (!r.ok) return showError(r.msg);
    store.setSession(r.user.id);
    ui.toast('登录成功，欢迎回来');
    window.ECP.app.enterApp(false);
  }

  window.ECP.auth = { init };
})();
