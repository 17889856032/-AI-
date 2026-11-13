/* ============================================================
 * store.js —— 本地数据层（localStorage）+ 通用工具
 * 生产环境应替换为后端 API（REST/GraphQL），
 * 各模块仅通过 ECP.store.* 访问数据，替换时保持方法签名即可。
 * ============================================================ */
(function () {
  'use strict';

  const K_USERS = 'ecp_users';
  const K_SESSION = 'ecp_session';
  const K_DATA = (uid) => 'ecp_data_' + uid;

  /* ---------------- 工具函数 ---------------- */
  const utils = {
    uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),

    /* 演示用轻量哈希（非加密级！生产环境请在后端使用 bcrypt/scrypt） */
    hash(str) {
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
      return 'h' + h.toString(16);
    },

    todayStr(d = new Date()) {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },

    fmtCN(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日`;
    },

    fmtDateTime(iso) {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },

    escapeHtml(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    /* 图片压缩为缩略图 dataURL，避免 localStorage 超限 */
    compressImage(file, maxSize = 520) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.72));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    /* 数字解析：兼容 " -1.50 "、"－1.5"、空值 */
    num(v) {
      if (v === null || v === undefined || v === '') return null;
      const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
      return Number.isFinite(n) ? n : null;
    }
  };

  /* ---------------- 用户与会话 ---------------- */
  const getUsers = () => JSON.parse(localStorage.getItem(K_USERS) || '[]');
  const saveUsers = (list) => localStorage.setItem(K_USERS, JSON.stringify(list));

  const store = {
    findUser(username) {
      return getUsers().find((u) => u.username === username.trim());
    },

    createUser(username, password) {
      const users = getUsers();
      if (users.some((u) => u.username === username.trim())) {
        return { ok: false, msg: '该账号已被注册' };
      }
      const user = {
        id: utils.uid(),
        username: username.trim(),
        passwordHash: utils.hash(password),
        createdAt: new Date().toISOString()
      };
      users.push(user);
      saveUsers(users);
      saveData(user.id, defaultData());
      return { ok: true, user };
    },

    verifyUser(username, password) {
      const user = store.findUser(username);
      if (!user || user.passwordHash !== utils.hash(password)) {
        return { ok: false, msg: '账号或密码不正确' };
      }
      return { ok: true, user };
    },

    setSession(userId) { localStorage.setItem(K_SESSION, userId); },
    clearSession() { localStorage.removeItem(K_SESSION); },
    getSessionUser() {
      const id = localStorage.getItem(K_SESSION);
      if (!id) return null;
      return getUsers().find((u) => u.id === id) || null;
    },

    /* ---------------- 每用户业务数据 ---------------- */
    getData(userId) {
      return JSON.parse(localStorage.getItem(K_DATA(userId)) || 'null') || defaultData();
    },

    /* ---------- 档案 ---------- */
    saveProfile(userId, profile) {
      const d = store.getData(userId);
      d.profile = Object.assign({}, d.profile, profile);
      saveData(userId, d);
      return d.profile;
    },

    /* ---------- 检查单 ---------- */
    addReport(userId, report) {
      const d = store.getData(userId);
      const item = Object.assign({ id: utils.uid(), createdAt: new Date().toISOString() }, report);
      d.reports.unshift(item);
      saveData(userId, d);
      return item;
    },
    deleteReport(userId, reportId) {
      const d = store.getData(userId);
      d.reports = d.reports.filter((r) => r.id !== reportId);
      d.analyses = d.analyses.filter((a) => a.reportId !== reportId);
      saveData(userId, d);
    },

    /* ---------- AI 分析记录 ---------- */
    addAnalysis(userId, analysis) {
      const d = store.getData(userId);
      const item = Object.assign({ id: utils.uid(), createdAt: new Date().toISOString() }, analysis);
      d.analyses.unshift(item);
      saveData(userId, d);
      return item;
    },
    deleteAnalysis(userId, id) {
      const d = store.getData(userId);
      d.analyses = d.analyses.filter((a) => a.id !== id);
      saveData(userId, d);
    },

    /* ---------- 课表 ---------- */
    saveScheduleEvent(userId, ev) {
      const d = store.getData(userId);
      const idx = d.schedule.findIndex((e) => e.id === ev.id);
      if (idx >= 0) d.schedule[idx] = ev; else d.schedule.push(ev);
      saveData(userId, d);
    },
    deleteScheduleEvent(userId, id) {
      const d = store.getData(userId);
      d.schedule = d.schedule.filter((e) => e.id !== id);
      saveData(userId, d);
    },

    /* ---------- 打卡 ---------- */
    toggleCheckin(userId, dateStr) {
      const d = store.getData(userId);
      const i = d.checkins.indexOf(dateStr);
      let checked;
      if (i >= 0) { d.checkins.splice(i, 1); checked = false; }
      else { d.checkins.push(dateStr); checked = true; }
      saveData(userId, d);
      return checked;
    },

    /* ---------- 学习资源 ---------- */
    addResource(userId, res) {
      const d = store.getData(userId);
      const item = Object.assign({ id: utils.uid(), createdAt: new Date().toISOString() }, res);
      d.resources.unshift(item);
      saveData(userId, d);
      return item;
    },
    deleteResource(userId, id) {
      const d = store.getData(userId);
      d.resources = d.resources.filter((r) => r.id !== id);
      saveData(userId, d);
    }
  };

  function saveData(userId, data) {
    try {
      localStorage.setItem(K_DATA(userId), JSON.stringify(data));
    } catch (e) {
      alert('本地存储空间不足，建议删除较早的检查单图片后重试。');
      throw e;
    }
  }

  /* 平台预置学习资源（种子）：新账号默认内置，老账号迁移一次补齐 */
  const SEED_RESOURCES = [
    { id: 'seed-video-hz1', type: 'video', title: '护眼知识 1', tag: '护眼科普',
      url: 'https://www.bilibili.com/video/BV1TVuR6xETY', note: '平台预置护眼科普视频' },
    { id: 'seed-video-hz2', type: 'video', title: '护眼知识 2', tag: '护眼科普',
      url: 'https://www.bilibili.com/video/BV1jQGQzXE7g', note: '平台预置护眼科普视频' },
    { id: 'seed-video-sq1', type: 'video', title: '视器解剖 1', tag: '眼科基础',
      url: 'https://www.bilibili.com/video/BV1eA4y1Q7tS', note: '平台预置眼科解剖视频' },
    { id: 'seed-url-eye3d', type: 'url', title: '3D 眼球解剖模型', tag: '3D 模型',
      url: 'https://anatomyvista.com/explore/eyeball', note: '平台预置交互式 3D 眼球模型' }
  ];

  function defaultData() {
    return {
      profile: {
        name: '', gender: '', age: '', phone: '', city: '',
        habit: '', history: '',
        degreeL: '', degreeR: '', astigL: '', astigR: '', note: ''
      },
      reports: [],
      analyses: [],
      schedule: [],
      checkins: [],
      resources: SEED_RESOURCES.map((r) => Object.assign({}, r))
    };
  }

  /* ---------------- UI：Toast / Modal ---------------- */
  const ui = {
    toast(msg, type = '') {
      const root = document.getElementById('toast-root');
      const el = document.createElement('div');
      el.className = 'toast' + (type ? ' ' + type : '');
      el.textContent = msg;
      root.appendChild(el);
      setTimeout(() => {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'translateY(-10px)';
        setTimeout(() => el.remove(), 320);
      }, 2400);
    },

    /* 打开弹窗：title + 内部 HTML，返回 modal 元素；footer 由内容自行渲染 */
    modal(title, html, opts = {}) {
      const root = document.getElementById('modal-root');
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal ${opts.large ? 'modal-lg' : ''}" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3>${utils.escapeHtml(title)}</h3>
            <button class="modal-close" data-close>✕</button>
          </div>
          <div class="modal-body">${html}</div>
        </div>`;
      const close = () => mask.remove();
      mask.addEventListener('click', (e) => {
        if (e.target === mask || e.target.hasAttribute('data-close')) close();
      });
      root.appendChild(mask);
      return { mask, close, body: mask.querySelector('.modal-body') };
    },

    confirm(content) {
      return new Promise((resolve) => {
        const { mask, close } = ui.modal('请确认', `<p style="padding:6px 2px 10px">${utils.escapeHtml(content)}</p>
          <div class="modal-foot">
            <button class="btn btn-ghost btn-sm" data-no>取消</button>
            <button class="btn btn-terra btn-sm" data-yes>确认</button>
          </div>`);
        mask.querySelector('[data-no]').onclick = () => { close(); resolve(false); };
        mask.querySelector('[data-yes]').onclick = () => { close(); resolve(true); };
      });
    }
  };

  window.ECP = window.ECP || {};
  window.ECP.views = window.ECP.views || {};
  window.ECP.utils = utils;
  window.ECP.store = store;
  window.ECP.ui = ui;

  /* 一次性迁移：把预置学习资源注入老用户（按 seed id 去重，幂等；删除后不会被强制恢复） */
  (function migrateSeedResources() {
    const K = 'ecp_seed_resources_v2';
    if (localStorage.getItem(K)) return;
    getUsers().forEach((u) => {
      const d = store.getData(u.id);
      let changed = false;
      SEED_RESOURCES.forEach((s) => {
        if (!d.resources.some((r) => r.id === s.id)) {
          d.resources.push(Object.assign({ createdAt: new Date().toISOString() }, s));
          changed = true;
        }
      });
      if (changed) saveData(u.id, d);
    });
    localStorage.setItem(K, '1');
  })();
})();
