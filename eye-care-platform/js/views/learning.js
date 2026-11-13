/* ============================================================
 * views/learning.js —— 学习中心：周课表 / 每日打卡 / 资源库
 * ============================================================ */
(function () {
  'use strict';
  const { utils, store, ui } = window.ECP;

  const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const SLOTS = ['08:00–09:00', '09:00–10:30', '10:30–12:00', '13:30–15:00',
    '15:00–16:30', '16:30–18:00', '19:00–20:30', '20:30–22:00'];
  const EVENT_COLORS = ['ev-0', 'ev-1', 'ev-2', 'ev-3', 'ev-4'];

  let tab = 'schedule';   // schedule | checkin | resource
  let calCursor = new Date();

  window.ECP.views.learning = {
    title: '学习中心',
    desc: '护眼课程表、每日打卡与视频网址资源管理',

    render(el, ctx) {
      const { user, data, reload } = ctx;

      el.innerHTML = `
        <div class="learn-tabs">
          ${[
            ['schedule', '📅 每周课表'],
            ['checkin', '✅ 每日打卡'],
            ['resource', '🔗 资源库']
          ].map(([k, label]) =>
            `<button class="learn-tab ${tab === k ? 'active' : ''}" data-tab="${k}">${label}</button>`).join('')}
        </div>
        <div id="learn-content"></div>`;

      el.querySelectorAll('.learn-tab').forEach((b) =>
        b.onclick = () => { tab = b.dataset.tab; reload(); });

      const box = el.querySelector('#learn-content');
      if (tab === 'schedule') renderSchedule(box, user, data);
      if (tab === 'checkin') renderCheckin(box, user, data, reload);
      if (tab === 'resource') renderResource(box, user, data, reload);
    }
  };

  /* ================= 课表 ================= */
  function renderSchedule(box, user, data) {
    const todayIdx = (new Date().getDay() + 6) % 7; // 周一=0
    box.innerHTML = `
      <div class="card card-pad">
        <div class="card-title">本周护眼课表 <span style="font-size:12px;font-weight:400;color:var(--ink-faint)">点击空格添加课程，点击课程可删除</span></div>
        <div class="schedule-grid">
          <div class="sch-head"></div>
          ${DAYS.map((d, i) =>
            `<div class="sch-head ${i === todayIdx ? 'today' : ''}">${d}${i === todayIdx ? ' · 今天' : ''}</div>`).join('')}
          ${SLOTS.map((time, slot) => `
            <div class="sch-time">${time}</div>
            ${DAYS.map((_, day) => {
              const ev = data.schedule.find((e) => e.day === day && e.slot === slot);
              if (ev) {
                return `<div class="sch-cell" style="padding:0;border-style:solid;border-color:transparent">
                  <div class="sch-event ${ev.color}">
                    <strong>${utils.escapeHtml(ev.title)}</strong>
                    <span>${utils.escapeHtml(ev.time || time)}</span>
                    <span class="sch-del" data-del-ev="${ev.id}">✕</span>
                  </div>
                </div>`;
              }
              return `<div class="sch-cell" data-add="${day}-${slot}"><span class="sch-add">＋</span></div>`;
            }).join('')}
          `).join('')}
        </div>
      </div>`;

    box.querySelectorAll('[data-add]').forEach((cell) => {
      cell.onclick = () => {
        const [day, slot] = cell.dataset.add.split('-').map(Number);
        openEventModal(user, day, slot, data, () => window.ECP.app.reload());
      };
    });
    box.querySelectorAll('[data-del-ev]').forEach((x) => {
      x.onclick = async (e) => {
        e.stopPropagation();
        const ok = await ui.confirm('删除这节课程？');
        if (!ok) return;
        store.deleteScheduleEvent(user.id, x.dataset.delEv);
        ui.toast('课程已删除', 'terra');
        window.ECP.app.reload();
      };
    });
  }

  function openEventModal(user, day, slot, data) {
    const { mask, close } = ui.modal(`添加课程 · ${DAYS[day]} ${SLOTS[slot]}`, `
      <div class="field"><label>课程 / 任务名称</label>
        <input id="ev-title" placeholder="如：眼保健操、角膜塑形镜护理学习" maxlength="30" />
      </div>
      <div class="field"><label>具体时间</label>
        <input id="ev-time" value="${SLOTS[slot]}" placeholder="如：19:00–19:30" />
      </div>
      <div class="field"><label>颜色标签</label>
        <select id="ev-color">
          <option value="ev-0">松墨绿</option><option value="ev-1">陶土橙</option>
          <option value="ev-2">鼠尾草</option><option value="ev-3">麦穗金</option>
          <option value="ev-4">雾蓝</option>
        </select>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost btn-sm" data-close>取消</button>
        <button class="btn btn-primary btn-sm" data-ok>保存到课表</button>
      </div>`);

    mask.querySelector('[data-ok]').onclick = () => {
      const title = mask.querySelector('#ev-title').value.trim();
      if (!title) return ui.toast('请填写课程名称', 'danger');
      store.saveScheduleEvent(user.id, {
        id: utils.uid(),
        day, slot,
        title,
        time: mask.querySelector('#ev-time').value.trim() || SLOTS[slot],
        color: mask.querySelector('#ev-color').value
      });
      close();
      ui.toast('已加入课表');
      window.ECP.app.reload();
    };
    mask.querySelector('[data-close]').onclick = close;
  }

  /* ================= 打卡 ================= */
  function renderCheckin(box, user, data, reload) {
    const today = utils.todayStr();
    const checkedToday = data.checkins.includes(today);
    const streak = utils.streak(data.checkins);
    const total = data.checkins.length;

    box.innerHTML = `
      <div class="checkin-hero">
        <button class="checkin-btn ${checkedToday ? 'done' : ''}" id="btn-checkin">
          ${checkedToday ? '已<br/>打卡' : '今日<br/>打卡'}
        </button>
        <div style="flex:1">
          <h3 style="font-family:var(--font-display);font-size:20px;margin-bottom:6px">
            ${checkedToday ? '今日护眼任务已完成，明天继续 🌿' : '坚持是护眼最好的伙伴'}
          </h3>
          <p style="font-size:13.5px;color:var(--ink-faint);margin-bottom:16px">
            每天打卡一次，记录连续坚持天数；可配合课表完成护眼学习任务
          </p>
          <div class="checkin-stats">
            <div class="ci-stat"><div class="ci-num">${streak}</div><div class="ci-label">连续打卡（天）</div></div>
            <div class="ci-stat"><div class="ci-num">${total}</div><div class="ci-label">累计打卡（天）</div></div>
            <div class="ci-stat"><div class="ci-num">${Math.max(0, 30 - total)}</div><div class="ci-label">距月度目标 30 天</div></div>
          </div>
        </div>
      </div>

      <div class="card card-pad">
        <div class="card-title" style="justify-content:space-between">
          <span style="display:flex;align-items:center;gap:10px"><span style="width:5px;height:18px;border-radius:3px;background:var(--terra)"></span>打卡日历</span>
          <span>
            <button class="btn btn-ghost btn-sm" id="cal-prev">← 上月</button>
            <strong id="cal-title" style="margin:0 10px;font-family:var(--font-display)"></strong>
            <button class="btn btn-ghost btn-sm" id="cal-next">下月 →</button>
          </span>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
      </div>`;

    box.querySelector('#btn-checkin').onclick = () => {
      const checked = store.toggleCheckin(user.id, today);
      ui.toast(checked ? '打卡成功，继续保持！' : '已取消今日打卡', checked ? '' : 'terra');
      reload();
    };
    box.querySelector('#cal-prev').onclick = () => { calCursor.setMonth(calCursor.getMonth() - 1); drawCalendar(box, data); };
    box.querySelector('#cal-next').onclick = () => { calCursor.setMonth(calCursor.getMonth() + 1); drawCalendar(box, data); };
    drawCalendar(box, data);
  }

  function drawCalendar(box, data) {
    const y = calCursor.getFullYear();
    const m = calCursor.getMonth();
    box.querySelector('#cal-title').textContent = `${y} 年 ${m + 1} 月`;
    const today = utils.todayStr();
    const firstDay = (new Date(y, m, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();

    let html = ['一', '二', '三', '四', '五', '六', '日']
      .map((w) => `<div class="cal-head">${w}</div>`).join('');

    for (let i = firstDay - 1; i >= 0; i--) {
      html += `<div class="cal-day muted">${prevDays - i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cls = ['cal-day'];
      if (data.checkins.includes(ds)) cls.push('checked');
      if (ds === today) cls.push('today');
      html += `<div class="${cls.join(' ')}">${d}</div>`;
    }
    const totalCells = firstDay + daysInMonth;
    const tail = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= tail; d++) html += `<div class="cal-day muted">${d}</div>`;

    box.querySelector('#cal-grid').innerHTML = html;
  }

  /* ================= 资源库 ================= */
  function renderResource(box, user, data, reload) {
    const typeMeta = {
      video: { label: '视频', cls: 'video', icon: '▶' },
      url: { label: '网址', cls: 'url', icon: '🔗' },
      article: { label: '文章', cls: 'article', icon: '文' }
    };

    box.innerHTML = `
      <div class="card card-pad">
        <div class="card-title" style="justify-content:space-between">
          <span style="display:flex;align-items:center;gap:10px"><span style="width:5px;height:18px;border-radius:3px;background:var(--terra)"></span>学习资源（${data.resources.length}）</span>
          <button class="btn btn-primary btn-sm" id="btn-add-res">＋ 添加资源</button>
        </div>
        ${data.resources.length === 0
          ? `<div class="empty"><span class="empty-ico">📚</span>还没有资源，点击右上角添加视频链接或护眼网站</div>`
          : `<div class="res-grid">${data.resources.map((r) => {
              const meta = typeMeta[r.type] || typeMeta.url;
              return `
              <div class="res-card">
                <div class="res-top">
                  <div class="res-favicon ${meta.cls}">${meta.icon}</div>
                  <strong>${utils.escapeHtml(r.title)}</strong>
                </div>
                <div class="res-note">${utils.escapeHtml(r.note || '暂无备注')}</div>
                <div class="res-foot">
                  <a class="res-link" href="${utils.escapeHtml(normalizeUrl(r.url))}" target="_blank" rel="noopener" title="${utils.escapeHtml(r.url)}">${utils.escapeHtml(r.url)}</a>
                  <span class="tag tag-info">${meta.label}</span>
                  <button class="icon-btn" data-del-res="${r.id}" title="删除">🗑️</button>
                </div>
              </div>`;
            }).join('')}</div>`}
      </div>`;

    box.querySelector('#btn-add-res').onclick = openResourceModal;
    box.querySelectorAll('[data-del-res]').forEach((b) => {
      b.onclick = async () => {
        const ok = await ui.confirm('删除这条学习资源？');
        if (!ok) return;
        store.deleteResource(user.id, b.dataset.delRes);
        ui.toast('资源已删除', 'terra');
        reload();
      };
    });

    function openResourceModal() {
      const { mask, close } = ui.modal('添加学习资源', `
        <div class="field"><label>资源标题</label>
          <input id="res-title" placeholder="如：国家卫健委·儿童青少年护眼指南" maxlength="40" />
        </div>
        <div class="field-row">
          <div class="field"><label>类型</label>
            <select id="res-type">
              <option value="video">视频</option>
              <option value="url">网址</option>
              <option value="article">文章</option>
            </select>
          </div>
          <div class="field"><label>标签（选填）</label>
            <input id="res-tag" placeholder="如：近视防控" maxlength="12" />
          </div>
        </div>
        <div class="field"><label>链接地址</label>
          <input id="res-url" placeholder="https://… 支持视频链接与任意网址" />
        </div>
        <div class="field"><label>学习笔记 / 备注（选填）</label>
          <textarea id="res-note" placeholder="记录学习要点…" maxlength="200"></textarea>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost btn-sm" data-close>取消</button>
          <button class="btn btn-primary btn-sm" data-ok>保存资源</button>
        </div>`);

      mask.querySelector('[data-ok]').onclick = () => {
        const title = mask.querySelector('#res-title').value.trim();
        const url = mask.querySelector('#res-url').value.trim();
        if (!title) return ui.toast('请填写资源标题', 'danger');
        if (!url) return ui.toast('请填写链接地址', 'danger');
        store.addResource(user.id, {
          title,
          type: mask.querySelector('#res-type').value,
          tag: mask.querySelector('#res-tag').value.trim(),
          url,
          note: mask.querySelector('#res-note').value.trim()
        });
        close();
        ui.toast('资源已保存');
        reload();
      };
      mask.querySelector('[data-close]').onclick = close;
    }
  }

  function normalizeUrl(u) {
    return /^https?:\/\//i.test(u) ? u : 'https://' + u;
  }
})();
