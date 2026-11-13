/* ============================================================
 * views/analysis.js —— AI 分析检查单并生成个性化建议
 * ============================================================ */
(function () {
  'use strict';
  const { utils, store, api, ui } = window.ECP;

  function modeLabel() {
    const p = window.ECP_CONFIG.ai.provider;
    if (p === 'ark') return '豆包 Doubao · 火山方舟 Responses API';
    if (p === 'openai') return '云端大模型 · OpenAI 兼容接口';
    return '本地规则引擎（演示）';
  }
  function vendorName(a) {
    if (a.mocked) return '规则引擎';
    if (a.vendor === 'ark') return '豆包 AI';
    return '云端 AI';
  }

  window.ECP.views.analysis = {
    title: 'AI 分析建议',
    desc: '选择一份检查单，AI 结合个人档案生成针对性护眼方案',

    render(el, ctx) {
      const { user, data, reload } = ctx;
      const preselect = window.ECP.app.takePendingReport();

      el.innerHTML = `
        <div class="ai-hero">
          <h3>AI 眼科健康助理</h3>
          <p>基于检查单结构化数据与您的真实档案，从近视分级、眼压风险、屈光参差等维度分析，并输出用眼、饮食与随访建议。当前模式：<strong id="ai-mode">${modeLabel()}</strong></p>
        </div>

        <div class="card card-pad">
          <div class="card-title">发起分析</div>
          ${data.reports.length === 0 ? `
            <div class="empty">
              <span class="empty-ico">📋</span>
              还没有检查单，请先到「检查单管理」上传并识别一份检查单
              <div style="margin-top:14px"><button class="btn btn-primary btn-sm" id="go-upload">去上传</button></div>
            </div>` : `
            <div class="field-row" style="align-items:end">
              <div class="field" style="margin:0;flex:1">
                <label>选择检查单</label>
                <select id="select-report">
                  ${data.reports.map((r) =>
                    `<option value="${r.id}" ${r.id === preselect ? 'selected' : ''}>${r.examDate} · ${utils.escapeHtml(r.hospital || '未填写机构')}</option>`).join('')}
                </select>
              </div>
              <button class="btn btn-terra" id="btn-analyze">✨ 开始 AI 分析</button>
            </div>`}
          <div id="analyze-loading" class="hidden" style="margin-top:18px">
            <div class="progress"><div class="progress-bar" id="ai-progress" style="width:12%"></div></div>
            <p style="font-size:13px;color:var(--ink-faint)">AI 正在阅读检查单并结合您的档案生成建议…</p>
          </div>
        </div>

        <div id="result-box"></div>

        <div class="card card-pad">
          <div class="card-title">分析历史（${data.analyses.length}）</div>
          ${renderHistory(data.analyses)}
        </div>`;

      const goBtn = el.querySelector('#go-upload');
      if (goBtn) goBtn.onclick = () => { location.hash = '#/reports'; };

      const btn = el.querySelector('#btn-analyze');
      if (btn) btn.onclick = () => runAnalyze(el, user, reload);

      el.querySelectorAll('[data-view]').forEach((b) =>
        b.onclick = () => openAnalysis(b.dataset.view, user));
      el.querySelectorAll('[data-del]').forEach((b) =>
        b.onclick = async () => {
          const ok = await ui.confirm('删除这条 AI 分析记录？');
          if (!ok) return;
          store.deleteAnalysis(user.id, b.dataset.del);
          ui.toast('已删除', 'terra');
          reload();
        });
    }
  };

  async function runAnalyze(el, user, reload) {
    const reportId = el.querySelector('#select-report').value;
    const data = store.getData(user.id);
    const report = data.reports.find((r) => r.id === reportId);
    if (!report) return;

    const btn = el.querySelector('#btn-analyze');
    const loading = el.querySelector('#analyze-loading');
    btn.disabled = true;
    loading.classList.remove('hidden');

    /* 演示进度动画 */
    const bar = el.querySelector('#ai-progress');
    let p = 12;
    const timer = setInterval(() => { p = Math.min(90, p + Math.random() * 12); bar.style.width = p + '%'; }, 220);

    try {
      const res = await api.analyzeReport(report, data.profile);
      clearInterval(timer);
      bar.style.width = '100%';

      const saved = store.addAnalysis(user.id, {
        reportId,
        examDate: report.examDate,
        hospital: report.hospital,
        mocked: res.mocked,
        vendor: res.vendor || '',
        summary: res.result.summary,
        sections: res.result.sections
      });
      ui.toast('AI 分析完成，已保存到历史');
      reload();
      setTimeout(() => openAnalysis(saved.id, user), 350);
    } catch (err) {
      clearInterval(timer);
      loading.classList.add('hidden');
      btn.disabled = false;
      ui.toast('分析失败：' + err.message, 'danger');
    }
  }

  function renderHistory(list) {
    if (!list.length) {
      return `<div class="empty"><span class="empty-ico">🤖</span>暂无分析记录</div>`;
    }
    return `<div style="display:grid;gap:10px">${list.map((a) => `
      <div class="analysis-row">
        <div class="ar-date">${utils.fmtCN(a.createdAt)}</div>
        <div class="ar-sum">${utils.escapeHtml(a.summary || '（无摘要）')}</div>
        <span class="tag ${a.mocked ? 'tag-terra' : 'tag-info'}">${vendorName(a)}</span>
        <button class="btn btn-ghost btn-sm" data-view="${a.id}">查看</button>
        <button class="icon-btn" data-del="${a.id}" title="删除">🗑️</button>
      </div>`).join('')}</div>`;
  }

  function openAnalysis(id, user) {
    const data = store.getData(user.id);
    const a = data.analyses.find((x) => x.id === id);
    if (!a) return;
    const { mask, close } = ui.modal('AI 分析报告', `
      <div class="ai-meta">
        <span class="tag tag-info">${utils.escapeHtml(a.examDate || '')} 检查单</span>
        <span class="tag ${a.mocked ? 'tag-terra' : 'tag-info'}">${vendorName(a)}</span>
        <span class="tag tag-warn">${utils.fmtDateTime(a.createdAt)} 生成</span>
      </div>

      <div class="ai-part">
        <div class="ai-part-head"><strong>👦 给孩子的视力建议</strong><span class="tag tag-info">AI 生成</span></div>
        <div class="ai-result">
          ${(a.sections || []).map((s) => `
            <div class="ai-section ${s.type === 'terra' ? 'terra' : s.type === 'gold' ? 'gold' : ''}">
              <h4>${utils.escapeHtml(s.title)}</h4>
              ${Array.isArray(s.items)
                ? `<ul>${s.items.map((i) => `<li>${utils.escapeHtml(i)}</li>`).join('')}</ul>`
                : `<p>${utils.escapeHtml(s.items || '')}</p>`}
            </div>`).join('')}
        </div>
      </div>

      ${renderMomGuide(data)}

      <p style="font-size:12px;color:var(--ink-faint);margin-top:14px;line-height:1.7">
        ⚠️ 以上「给孩子的视力建议」由 AI 生成，仅供健康管理参考，不能替代执业医师的面诊与诊断。如眼部不适应及时就医。
      </p>
      <div class="modal-foot"><button class="btn btn-ghost btn-sm" data-close>关闭</button></div>
    `, { large: true });
    mask.querySelector('[data-close]').onclick = close;
    const goBtn = mask.querySelector('#mom-go-learn');
    if (goBtn) goBtn.onclick = () => { close(); location.hash = '#/learning'; };
  }

  /* 给妈妈的学习引导：非 AI，动态关联学习中心的课表与资源 */
  function renderMomGuide(data) {
    const scheduleCount = (data.schedule || []).length;
    const resources = data.resources || [];
    const resCount = resources.length;
    const videoCount = resources.filter((r) => r.type === 'video').length;
    return `
      <div class="ai-part">
        <div class="ai-part-head mom"><strong>👩 给妈妈的学习计划</strong><span class="tag tag-terra">平台引导</span></div>
        <div class="mom-guide">
          <p>孩子的视力改善，更需要妈妈掌握科学方法、陪孩子一起坚持。前往「学习中心」，按课表学习护眼理论、观看视频资源，把上面的建议落实成每天的护眼习惯。</p>
          <div class="mom-stats">
            <div class="mom-stat"><div class="n">${scheduleCount}</div><div class="l">课表课程（节）</div></div>
            <div class="mom-stat"><div class="n">${resCount}</div><div class="l">学习资源（个）</div></div>
            <div class="mom-stat"><div class="n">${videoCount}</div><div class="l">其中视频（个）</div></div>
          </div>
          <button class="btn btn-terra btn-sm" id="mom-go-learn">📅 前往学习中心</button>
        </div>
      </div>`;
  }
})();
