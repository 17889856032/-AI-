/* ============================================================
 * views/profile.js —— 个人档案登记
 * ============================================================ */
(function () {
  'use strict';
  const { utils, store, ui } = window.ECP;

  window.ECP.views.profile = {
    title: '个人档案',
    desc: '登记并保存基础资料与屈光信息，用于 AI 个性化分析',

    render(el, ctx) {
      const { user, data, reload } = ctx;
      const p = data.profile;
      const filled = Object.values(p).filter((v) => String(v).trim() !== '').length;
      const total = Object.keys(p).length;
      const pct = Math.round((filled / total) * 100);

      el.innerHTML = `
        <div class="card card-pad">
          <div class="profile-head">
            <div class="avatar">${utils.escapeHtml((p.name || user.username).slice(0, 1))}</div>
            <div style="flex:1">
              <h3>${utils.escapeHtml(p.name || user.username)}</h3>
              <p>账号：${utils.escapeHtml(user.username)} · 注册于 ${utils.fmtCN(user.createdAt)}</p>
            </div>
            <div style="text-align:right">
              <div style="font-family:var(--font-display);font-size:26px;font-weight:700;color:var(--pine)">${pct}%</div>
              <div style="font-size:12px;color:var(--ink-faint)">档案完整度</div>
            </div>
          </div>
          <div class="progress" style="margin-top:18px"><div class="progress-bar" style="width:${pct}%"></div></div>
        </div>

        <form id="profile-form" class="card card-pad">
          <div class="card-title">基础信息</div>
          <div class="field-row">
            <div class="field"><label>姓名</label><input name="name" value="${utils.escapeHtml(p.name)}" placeholder="您的称呼" /></div>
            <div class="field"><label>性别</label>
              <select name="gender">
                <option value="">请选择</option>
                <option ${p.gender === '男' ? 'selected' : ''}>男</option>
                <option ${p.gender === '女' ? 'selected' : ''}>女</option>
              </select>
            </div>
          </div>
          <div class="field-row">
            <div class="field"><label>年龄</label><input name="age" type="number" min="1" max="120" value="${utils.escapeHtml(p.age)}" placeholder="周岁" /></div>
            <div class="field"><label>手机号</label><input name="phone" value="${utils.escapeHtml(p.phone)}" placeholder="选填" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>所在城市</label><input name="city" value="${utils.escapeHtml(p.city)}" placeholder="选填" /></div>
            <div class="field"><label>日常用眼强度</label>
              <select name="habit">
                <option value="">请选择</option>
                <option ${p.habit === '轻度（偶尔看屏幕）' ? 'selected' : ''}>轻度（偶尔看屏幕）</option>
                <option ${p.habit === '中度（每天 4-6 小时）' ? 'selected' : ''}>中度（每天 4-6 小时）</option>
                <option ${p.habit === '高强度（长时间电脑办公）' ? 'selected' : ''}>高强度（长时间电脑办公）</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>既往眼病史 / 过敏史</label>
            <textarea name="history" placeholder="如：结膜炎、干眼症、青光眼家族史等（选填）">${utils.escapeHtml(p.history)}</textarea>
          </div>

          <div class="card-title" style="margin-top:26px">屈光数据（眼镜处方，选填）</div>
          <div class="metric-mini">
            <div class="mm"><div class="mm-label">左眼近视度数 (D)</div>
              <div style="padding-top:6px"><input name="degreeL" type="number" step="0.25" value="${utils.escapeHtml(p.degreeL)}" placeholder="如 -3.00" style="width:100%;padding:8px;border:1.5px solid var(--line);border-radius:8px;background:#fbf9f1;text-align:center" /></div>
            </div>
            <div class="mm"><div class="mm-label">右眼近视度数 (D)</div>
              <div style="padding-top:6px"><input name="degreeR" type="number" step="0.25" value="${utils.escapeHtml(p.degreeR)}" placeholder="如 -2.75" style="width:100%;padding:8px;border:1.5px solid var(--line);border-radius:8px;background:#fbf9f1;text-align:center" /></div>
            </div>
            <div class="mm"><div class="mm-label">左眼散光 (D)</div>
              <div style="padding-top:6px"><input name="astigL" type="number" step="0.25" value="${utils.escapeHtml(p.astigL)}" placeholder="如 -0.75" style="width:100%;padding:8px;border:1.5px solid var(--line);border-radius:8px;background:#fbf9f1;text-align:center" /></div>
            </div>
            <div class="mm"><div class="mm-label">右眼散光 (D)</div>
              <div style="padding-top:6px"><input name="astigR" type="number" step="0.25" value="${utils.escapeHtml(p.astigR)}" placeholder="如 -0.50" style="width:100%;padding:8px;border:1.5px solid var(--line);border-radius:8px;background:#fbf9f1;text-align:center" /></div>
            </div>
          </div>

          <div class="field" style="margin-top:16px">
            <label>备注</label>
            <textarea name="note" placeholder="其他想记录的情况（选填）">${utils.escapeHtml(p.note)}</textarea>
          </div>

          <div style="display:flex;gap:12px;margin-top:8px">
            <button type="submit" class="btn btn-primary">保存档案</button>
            <button type="reset" class="btn btn-ghost">还原修改</button>
          </div>
        </form>`;

      document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const patch = {};
        fd.forEach((v, k) => { patch[k] = String(v).trim(); });
        store.saveProfile(user.id, patch);
        ui.toast('个人档案已保存');
        window.ECP.app.refreshSidebar();
        reload();
      });
    }
  };
})();
