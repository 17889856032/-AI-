/* ============================================================
 * views/dashboard.js —— 工作台
 * ============================================================ */
(function () {
  'use strict';
  const { utils, store, charts } = window.ECP;

  window.ECP.views.dashboard = {
    title: '工作台',
    desc: '眼健康数据总览与快捷入口',

    render(el, ctx) {
      const { user, data } = ctx;
      const streak = utils.streak(data.checkins);
      const latest = data.reports[0];

      el.innerHTML = `
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-label">检查单档案</div>
            <div class="stat-num">${data.reports.length}<span class="stat-unit">份</span></div>
          </div>
          <div class="stat terra">
            <div class="stat-label">AI 分析报告</div>
            <div class="stat-num">${data.analyses.length}<span class="stat-unit">次</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">连续打卡</div>
            <div class="stat-num">${streak}<span class="stat-unit">天</span></div>
          </div>
          <div class="stat terra">
            <div class="stat-label">学习资源</div>
            <div class="stat-num">${data.resources.length}<span class="stat-unit">条</span></div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card card-pad">
            <div class="card-title">快捷入口</div>
            <div class="quick-list">
              <button class="quick-item" data-go="#/reports">
                <span class="quick-ico" style="background:var(--pine-soft)">📋</span>
                <span><strong>上传检查单 OCR 识别</strong><span>拍照/相册上传，自动结构化录入并生成可视化</span></span>
              </button>
              <button class="quick-item" data-go="#/analysis">
                <span class="quick-ico" style="background:var(--terra-soft)">🤖</span>
                <span><strong>AI 个性化分析</strong><span>结合个人档案解读检查单，生成护眼建议</span></span>
              </button>
              <button class="quick-item" data-go="#/learning">
                <span class="quick-ico" style="background:#f3ecd8">📅</span>
                <span><strong>护眼学习打卡</strong><span>管理每周课表，坚持每日打卡与资源学习</span></span>
              </button>
              <button class="quick-item" data-go="#/profile">
                <span class="quick-ico" style="background:var(--pine-soft)">👤</span>
                <span><strong>完善个人档案</strong><span>基础信息与屈光数据，让 AI 建议更精准</span></span>
              </button>
            </div>
          </div>

          <div class="card card-pad">
            <div class="card-title">最近动态</div>
            ${renderTimeline(data)}
          </div>
        </div>

        ${data.reports.length >= 2 ? `
        <div class="card card-pad">
          <div class="card-title">视力变化趋势</div>
          <div class="chart-box sm"><canvas id="dash-chart"></canvas></div>
        </div>` : `
        <div class="card card-pad empty">
          <span class="empty-ico">📈</span>
          上传 2 份以上检查单后，这里将自动生成视力与度数变化趋势图
        </div>`}
      `;

      el.querySelectorAll('[data-go]').forEach((b) =>
        b.addEventListener('click', () => { location.hash = b.dataset.go; }));

      if (data.reports.length >= 2) {
        const sorted = [...data.reports].sort((a, b) => a.examDate.localeCompare(b.examDate));
        charts.line(
          document.getElementById('dash-chart'),
          sorted.map((r) => r.examDate.slice(5)),
          [
            { label: '右眼裸眼视力', data: sorted.map((r) => parseFloat(r.fields.vaR)) },
            { label: '左眼裸眼视力', data: sorted.map((r) => parseFloat(r.fields.vaL)) }
          ],
          '视力'
        );
      }
    }
  };

  function renderTimeline(data) {
    const events = [];
    data.reports.slice(0, 2).forEach((r) =>
      events.push({ t: r.createdAt, dot: '', html: `<strong>新增检查单</strong><span>${utils.escapeHtml(r.hospital || '未填写机构')} · ${r.examDate}</span>` }));
    data.analyses.slice(0, 2).forEach((a) =>
      events.push({ t: a.createdAt, dot: 'terra', html: `<strong>AI 分析完成</strong><span>${utils.escapeHtml(a.summary || '')}</span>` }));
    data.checkins.slice(-2).reverse().forEach((d) =>
      events.push({ t: d, dot: 'gold', html: `<strong>完成护眼打卡</strong><span>${d}</span>` }));

    if (!events.length) {
      return `<div class="empty"><span class="empty-ico">🌿</span>还没有动态，从上传第一份检查单开始吧</div>`;
    }
    events.sort((a, b) => String(b.t).localeCompare(String(a.t)));
    return `<div class="timeline">${events.slice(0, 6).map((e) => `
      <div class="timeline-item">
        <span class="timeline-dot ${e.dot}"></span>
        <div>${e.html}</div>
      </div>`).join('')}</div>`;
  }
})();
