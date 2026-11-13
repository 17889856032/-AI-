/* ============================================================
 * views/reports.js —— 检查单 OCR 识别 · 校对 · 可视化 · 历史
 * ============================================================ */
(function () {
  'use strict';
  const { utils, store, api, ui, charts } = window.ECP;

  /* 结构化字段定义：key 后缀 R=右眼 L=左眼 */
  const ROWS = [
    { label: '裸眼视力', r: 'vaR', l: 'vaL' },
    { label: '矫正视力', r: 'cvaR', l: 'cvaL' },
    { label: '球镜 SPH (D)', r: 'sphR', l: 'sphL' },
    { label: '柱镜 CYL (D)', r: 'cylR', l: 'cylL' },
    { label: '轴位 AXIS (°)', r: 'axisR', l: 'axisL' },
    { label: '眼压 IOP (mmHg)', r: 'iopR', l: 'iopL' }
  ];

  let stage = 'idle';       // idle | recognizing | editing
  let pending = null;       // 待保存的检查单草稿

  window.ECP.views.reports = {
    title: '检查单管理',
    desc: '上传医院检查单，OCR 自动识别并生成可视化眼健康档案',

    render(el, ctx) {
      const { user, data, reload } = ctx;

      el.innerHTML = `
        <div class="card card-pad">
          <div class="card-title">上传检查单</div>
          <div class="steps">
            <div class="step ${stage !== 'idle' ? 'done' : 'active'}"><div class="step-dot">1</div>上传图片</div>
            <div class="step ${stage === 'editing' ? 'done' : stage === 'recognizing' ? 'active' : ''}"><div class="step-dot">2</div>OCR 识别与校对</div>
            <div class="step"><div class="step-dot">3</div>保存归档</div>
          </div>

          <div id="upload-zone" class="uploader">
            <span class="up-ico">📄</span>
            <strong>点击选择 / 拖拽检查单图片到此处</strong>
            <p>支持 JPG、PNG 拍照件，数据仅保存在本地浏览器</p>
            <input type="file" id="file-input" accept="image/*" hidden />
          </div>

          <div id="recognize-box" class="hidden">
            <div class="upload-preview" id="preview-box"></div>
            <div class="progress"><div class="progress-bar" id="ocr-progress"></div></div>
            <p id="ocr-hint" style="font-size:13px;color:var(--ink-faint)">正在调用 OCR 服务识别文字…</p>
          </div>

          <div id="edit-box" class="hidden"></div>
        </div>

        ${data.reports.length ? `
        <div class="card card-pad">
          <div class="card-title">数据可视化</div>
          <div class="grid-2">
            <div>
              <h4 style="font-size:13.5px;color:var(--ink-soft);margin-bottom:8px">裸眼视力趋势</h4>
              <div class="chart-box sm"><canvas id="chart-va"></canvas></div>
            </div>
            <div>
              <h4 style="font-size:13.5px;color:var(--ink-soft);margin-bottom:8px">球镜度数趋势 (D)</h4>
              <div class="chart-box sm"><canvas id="chart-sph"></canvas></div>
            </div>
          </div>
          <h4 style="font-size:13.5px;color:var(--ink-soft);margin:20px 0 8px">最近一次检查 · 左右眼对比</h4>
          <div class="chart-box sm"><canvas id="chart-last"></canvas></div>
        </div>` : ''}

        <div class="card card-pad">
          <div class="card-title">历史检查单（${data.reports.length}）</div>
          <div class="report-list" id="report-list">${renderList(data.reports)}</div>
        </div>`;

      bindUpload(el, user, reload);
      bindList(el, user, reload);
      if (data.reports.length) renderCharts(data.reports);
    }
  };

  /* ---------------- 上传与识别 ---------------- */
  function bindUpload(el, user, reload) {
    const zone = el.querySelector('#upload-zone');
    const input = el.querySelector('#file-input');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => input.files[0] && handleFile(input.files[0]));

    async function handleFile(file) {
      if (!file.type.startsWith('image/')) return ui.toast('请选择图片文件', 'danger');
      stage = 'recognizing';
      el.querySelector('#recognize-box').classList.remove('hidden');
      el.querySelector('#edit-box').classList.add('hidden');

      const img = await utils.compressImage(file);
      el.querySelector('#preview-box').innerHTML = `
        <img src="${img}" alt="检查单预览" />
        <div><strong style="font-size:14px">${utils.escapeHtml(file.name)}</strong>
        <p style="font-size:12.5px;color:var(--ink-faint);margin-top:4px">${(file.size / 1024).toFixed(0)} KB · 已自动压缩</p></div>`;

      const bar = el.querySelector('#ocr-progress');
      const hint = el.querySelector('#ocr-hint');
      bar.style.width = '6%';
      try {
        const res = await api.ocrImage(file, (p) => { bar.style.width = p + '%'; });
        hint.textContent = res.mocked ? '识别完成（当前为本地模拟数据，可直接校对修改）' : '识别完成，请校对结构化字段';
        stage = 'editing';
        pending = { img, raw: res.data };
        renderEditor(el, user, reload);
      } catch (err) {
        stage = 'idle';
        hint.textContent = '识别失败：' + err.message;
        hint.style.color = 'var(--danger)';
        ui.toast('OCR 识别失败：' + err.message, 'danger');
      }
    }
  }

  /* ---------------- 结构化校对编辑器 ---------------- */
  function renderEditor(el, user, reload) {
    const d = pending.raw;
    const box = el.querySelector('#edit-box');
    box.classList.remove('hidden');

    box.innerHTML = `
      <h4 style="font-family:var(--font-display);font-size:16px;margin:6px 0 14px">校对识别结果（可手动修改）</h4>
      <div class="field-row">
        <div class="field"><label>检查日期</label><input id="f-examDate" type="date" value="${utils.escapeHtml(d.examDate || utils.todayStr())}" /></div>
        <div class="field"><label>检查机构</label><input id="f-hospital" value="${utils.escapeHtml(d.hospital)}" placeholder="如：XX 市人民医院眼科" /></div>
      </div>
      <table class="report-table" style="margin-bottom:16px">
        <thead><tr><th>检查项目</th><th>右眼 (R)</th><th>左眼 (L)</th></tr></thead>
        <tbody>
          ${ROWS.map((row) => `
            <tr>
              <td>${row.label}</td>
              <td><input data-f="${row.r}" value="${utils.escapeHtml(d[row.r] ?? '')}" inputmode="decimal" /></td>
              <td><input data-f="${row.l}" value="${utils.escapeHtml(d[row.l] ?? '')}" inputmode="decimal" /></td>
            </tr>`).join('')}
          <tr><td>瞳距 PD (mm)</td>
            <td colspan="2"><input data-f="pd" value="${utils.escapeHtml(d.pd ?? '')}" inputmode="decimal" style="width:160px" /></td>
          </tr>
        </tbody>
      </table>
      <div class="field"><label>医生结论 / 备注</label>
        <textarea id="f-conclusion" placeholder="单据上的诊断结论">${utils.escapeHtml(d.conclusion || '')}</textarea>
      </div>
      <div class="field"><label>OCR 原始文字（仅供校对参考）</label>
        <textarea id="f-raw" rows="5" style="font-size:12.5px;background:#f6f2e6">${utils.escapeHtml(d.rawText || '')}</textarea>
      </div>
      <div style="display:flex;gap:12px">
        <button class="btn btn-primary" id="btn-save-report">保存归档</button>
        <button class="btn btn-ghost" id="btn-cancel-report">重新上传</button>
      </div>`;

    box.querySelector('#btn-save-report').onclick = () => {
      const fields = {};
      box.querySelectorAll('[data-f]').forEach((inp) => { fields[inp.dataset.f] = inp.value.trim(); });
      const examDate = box.querySelector('#f-examDate').value || utils.todayStr();
      const hospital = box.querySelector('#f-hospital').value.trim();
      const conclusion = box.querySelector('#f-conclusion').value.trim();
      const rawText = box.querySelector('#f-raw').value.trim();

      store.addReport(user.id, {
        examDate, hospital, fields, conclusion, rawText,
        img: pending.img
      });

      /* 导入验光单后自动建档：把屈光数据回填到个人档案 */
      const patch = {};
      if (fields.sphR) patch.degreeR = fields.sphR;
      if (fields.sphL) patch.degreeL = fields.sphL;
      if (fields.cylR) patch.astigR = fields.cylR;
      if (fields.cylL) patch.astigL = fields.cylL;
      const synced = Object.keys(patch).length > 0;
      if (synced) store.saveProfile(user.id, patch);

      stage = 'idle';
      pending = null;
      ui.toast(synced ? '已保存并同步屈光度数到个人档案' : '检查单已保存到健康档案');
      reload();
    };

    box.querySelector('#btn-cancel-report').onclick = () => {
      stage = 'idle';
      pending = null;
      reload();
    };
  }

  /* ---------------- 历史列表 ---------------- */
  function renderList(reports) {
    if (!reports.length) {
      return `<div class="empty"><span class="empty-ico">🗂️</span>暂无检查单，上传第一份开始建立眼健康档案</div>`;
    }
    return reports.map((r) => {
      const tags = charts.flags(r.fields).map((f) =>
        `<span class="tag tag-${f.level}">${utils.escapeHtml(f.text)}</span>`).join('');
      return `
        <div class="report-row" data-id="${r.id}">
          <div class="rr-date">${utils.escapeHtml(r.examDate)}</div>
          <div class="rr-hosp">
            <strong>${utils.escapeHtml(r.hospital || '未填写机构')}</strong>
            <span style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">${tags}</span>
          </div>
          <div class="rr-actions">
            <button class="btn btn-ghost btn-sm" data-act="view">查看</button>
            <button class="btn btn-primary btn-sm" data-act="ai">AI 分析</button>
            <button class="icon-btn" data-act="del" title="删除">🗑️</button>
          </div>
        </div>`;
    }).join('');
  }

  function bindList(el, user, reload) {
    el.querySelectorAll('#report-list .report-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-act="view"]').onclick = () => openDetail(id, user);
      row.querySelector('[data-act="ai"]').onclick = () => {
        window.ECP.app.setPendingReport(id);
        location.hash = '#/analysis';
      };
      row.querySelector('[data-act="del"]').onclick = async () => {
        const ok = await ui.confirm('确定删除这份检查单吗？关联的 AI 分析记录将一并删除。');
        if (!ok) return;
        store.deleteReport(user.id, id);
        ui.toast('已删除', 'terra');
        reload();
      };
    });
  }

  function openDetail(id, user) {
    const r = store.getData(user.id).reports.find((x) => x.id === id);
    if (!r) return;
    const tags = charts.flags(r.fields).map((f) =>
      `<span class="tag tag-${f.level}">${utils.escapeHtml(f.text)}</span>`).join('');
    const { mask, close } = ui.modal('检查单详情 · ' + r.examDate, `
      <div style="display:grid;grid-template-columns:200px 1fr;gap:18px;margin-bottom:16px">
        <img src="${r.img}" alt="检查单" style="width:100%;border-radius:12px;border:1px solid var(--line)" />
        <div>
          <p style="margin-bottom:8px"><strong>机构：</strong>${utils.escapeHtml(r.hospital || '—')}</p>
          <p style="margin-bottom:8px"><strong>标记：</strong>${tags}</p>
          <p><strong>结论：</strong>${utils.escapeHtml(r.conclusion || '—')}</p>
        </div>
      </div>
      <table class="report-table">
        <thead><tr><th>项目</th><th>右眼 (R)</th><th>左眼 (L)</th></tr></thead>
        <tbody>
          ${ROWS.map((row) => `
            <tr><td>${row.label}</td><td>${utils.escapeHtml(r.fields[row.r] || '—')}</td><td>${utils.escapeHtml(r.fields[row.l] || '—')}</td></tr>`).join('')}
          <tr><td>瞳距 PD (mm)</td><td colspan="2">${utils.escapeHtml(r.fields.pd || '—')}</td></tr>
        </tbody>
      </table>
      ${r.rawText ? `<div class="field" style="margin-top:14px"><label>OCR 原始文字</label>
        <textarea rows="5" readonly style="font-size:12.5px;background:#f6f2e6">${utils.escapeHtml(r.rawText)}</textarea></div>` : ''}
      <div class="modal-foot"><button class="btn btn-ghost btn-sm" data-close>关闭</button></div>
    `, { large: true });
    mask.querySelector('[data-close]').onclick = close;
  }

  /* ---------------- 图表 ---------------- */
  function renderCharts(reports) {
    const sorted = [...reports].sort((a, b) => a.examDate.localeCompare(b.examDate));
    const labels = sorted.map((r) => r.examDate.slice(5));
    const n = (v) => parseFloat(v);

    charts.line(document.getElementById('chart-va'), labels, [
      { label: '右眼', data: sorted.map((r) => n(r.fields.vaR)) },
      { label: '左眼', data: sorted.map((r) => n(r.fields.vaL)) }
    ], '视力');

    charts.line(document.getElementById('chart-sph'), labels, [
      { label: '右眼 SPH', data: sorted.map((r) => n(r.fields.sphR)) },
      { label: '左眼 SPH', data: sorted.map((r) => n(r.fields.sphL)) }
    ], 'D');

    const last = sorted[sorted.length - 1];
    charts.bar(document.getElementById('chart-last'),
      ['裸眼视力', '眼压 (mmHg)'],
      [
        { label: '右眼', data: [n(last.fields.vaR), n(last.fields.iopR)] },
        { label: '左眼', data: [n(last.fields.vaL), n(last.fields.iopL)] }
      ]);
  }
})();
