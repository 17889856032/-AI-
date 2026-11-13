/* ============================================================
 * app.js —— 应用入口：哈希路由、主外壳、会话守卫
 * ============================================================ */
(function () {
  'use strict';
  const { store, ui, utils } = window.ECP;

  const ROUTES = {
    dashboard: window.ECP.views.dashboard,
    profile: window.ECP.views.profile,
    reports: window.ECP.views.reports,
    analysis: window.ECP.views.analysis,
    learning: window.ECP.views.learning
  };

  let pendingReportId = null;

  /* 连续打卡天数：允许今天尚未打卡时截止到昨天 */
  utils.streak = function (checkins) {
    if (!checkins || !checkins.length) return 0;
    const set = new Set(checkins);
    let cursor = new Date();
    if (!set.has(utils.todayStr(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    let count = 0;
    while (set.has(utils.todayStr(cursor))) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  };

  const app = {
    currentUser: null,

    init() {
      window.ECP.auth.init();
      document.getElementById('btn-logout').addEventListener('click', this.logout.bind(this));
      window.addEventListener('hashchange', () => this.route());

      const user = store.getSessionUser();
      if (user) this.enterApp(false);
      else this.showAuth();
    },

    showAuth() {
      document.getElementById('auth-view').classList.remove('hidden');
      document.getElementById('app-shell').classList.add('hidden');
    },

    enterApp(firstTime) {
      this.currentUser = store.getSessionUser();
      if (!this.currentUser) return this.showAuth();

      document.getElementById('auth-view').classList.add('hidden');
      document.getElementById('app-shell').classList.remove('hidden');
      this.refreshSidebar();
      this.renderTodayChip();

      if (!location.hash || location.hash === '#/') {
        location.hash = firstTime && !this.hasProfile() ? '#/profile' : '#/dashboard';
      }
      this.route();
    },

    hasProfile() {
      const d = store.getData(this.currentUser.id);
      return Boolean(d.profile && d.profile.name);
    },

    logout() {
      store.clearSession();
      this.currentUser = null;
      location.hash = '';
      this.showAuth();
      ui.toast('已安全退出');
    },

    refreshSidebar() {
      const user = this.currentUser;
      if (!user) return;
      const profile = store.getData(user.id).profile;
      const name = profile.name || user.username;
      document.getElementById('side-name').textContent = name;
      document.getElementById('side-role').textContent = profile.gender ? `${profile.gender} · ${profile.age || '年龄未填'} 岁` : '个人用户';
      document.getElementById('side-avatar').textContent = name.slice(0, 1);
    },

    renderTodayChip() {
      const d = new Date();
      const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      document.getElementById('today-chip').textContent =
        `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week}`;
    },

    route() {
      if (!this.currentUser) return;
      const key = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
      const view = ROUTES[key] || ROUTES.dashboard;

      document.querySelectorAll('.side-nav a').forEach((a) =>
        a.classList.toggle('active', a.dataset.route === (ROUTES[key] ? key : 'dashboard')));

      document.getElementById('page-title').textContent = view.title;
      document.getElementById('page-desc').textContent = view.desc;

      const page = document.getElementById('page');
      page.innerHTML = '';
      view.render(page, {
        user: this.currentUser,
        data: store.getData(this.currentUser.id),
        reload: () => this.reload()
      });
      window.scrollTo({ top: 0 });
    },

    reload() {
      this.refreshSidebar();
      this.route();
    },

    /* 检查单页跳转到 AI 分析时携带预选报告 */
    setPendingReport(id) { pendingReportId = id; },
    takePendingReport() {
      const id = pendingReportId;
      pendingReportId = null;
      return id;
    }
  };

  window.ECP.app = app;
  document.addEventListener('DOMContentLoaded', () => app.init());
})();
