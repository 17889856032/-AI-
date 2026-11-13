/* ============================================================
 * charts.js —— 可视化图表（Chart.js 封装，含无依赖降级）
 * ============================================================ */
(function () {
  'use strict';

  const instances = new Map();
  const hasChart = typeof window.Chart !== 'undefined';

  const COLORS = {
    pine: '#1f5c46',
    sage: '#7fae96',
    terra: '#d0704a',
    gold: '#c9a35c',
    grid: '#e4ddcb',
    ink: '#55655d'
  };

  function baseOptions(extra = {}) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: COLORS.ink, font: { size: 12 }, boxWidth: 12, boxHeight: 12, padding: 16 }
        },
        tooltip: {
          backgroundColor: '#143d2f',
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: COLORS.ink } },
        y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.ink } }
      }
    }, extra);
  }

  function render(canvas, config) {
    if (!hasChart) return fallback(canvas, config);
    const old = instances.get(canvas);
    if (old) old.destroy();
    const chart = new Chart(canvas, config);
    instances.set(canvas, chart);
    return chart;
  }

  /* CDN 加载失败时的表格降级 */
  function fallback(canvas, config) {
    const box = canvas.parentElement;
    const table = box.querySelector('.chart-fallback');
    if (table) table.remove();
    const labels = config.data.labels;
    const rows = config.data.datasets.map((ds) =>
      `<tr><td>${ds.label}</td>${ds.data.map((v) => `<td>${v ?? '—'}</td>`).join('')}</tr>`).join('');
    const el = document.createElement('div');
    el.className = 'chart-fallback';
    el.style.overflowX = 'auto';
    el.innerHTML = `<table class="report-table" style="margin-top:10px">
      <thead><tr><th>指标</th>${labels.map((l) => `<th>${l}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table>`;
    box.appendChild(el);
  }

  const charts = {
    /* 双折线趋势（如左右眼视力/度数随时间变化） */
    line(canvas, labels, datasets, yTitle) {
      render(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: datasets.map((ds, i) => Object.assign({
            tension: .35,
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false
          }, ds, i === 0
            ? { borderColor: COLORS.pine, backgroundColor: COLORS.pine }
            : { borderColor: COLORS.terra, backgroundColor: COLORS.terra }))
        },
        options: baseOptions(yTitle ? { scales: {
          x: { grid: { display: false }, ticks: { color: COLORS.ink } },
          y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.ink }, title: { display: true, text: yTitle, color: COLORS.ink } }
        } } : {})
      });
    },

    /* 分组柱状图（最近一次检查左右眼对比） */
    bar(canvas, labels, datasets) {
      render(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: datasets.map((ds, i) => Object.assign({
            borderRadius: 8,
            borderWidth: 0,
            maxBarThickness: 42
          }, ds, i === 0
            ? { backgroundColor: COLORS.sage }
            : { backgroundColor: COLORS.gold }))
        },
        options: baseOptions({ scales: {
          x: { grid: { display: false }, ticks: { color: COLORS.ink } },
          y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.ink }, beginAtZero: true }
        } })
      });
    },

    /* 指标异常标记，供检查单列表与详情使用 */
    flags(f) {
      const n = (v) => {
        const x = parseFloat(v);
        return Number.isFinite(x) ? x : null;
      };
      const out = [];
      const sphMin = Math.min(n(f.sphR) ?? 0, n(f.sphL) ?? 0);
      if (sphMin <= -6) out.push({ level: 'danger', text: '高度近视' });
      else if (sphMin <= -3) out.push({ level: 'warn', text: '中度近视' });
      else if (sphMin < -0.5) out.push({ level: 'info', text: '轻度近视' });

      const iopMax = Math.max(n(f.iopR) || 0, n(f.iopL) || 0);
      if (iopMax > 21) out.push({ level: 'danger', text: '眼压偏高' });

      const diff = Math.abs((n(f.sphR) || 0) - (n(f.sphL) || 0));
      if (diff >= 2.5) out.push({ level: 'warn', text: '屈光参差' });

      const vaMin = Math.min(n(f.vaR) || 1, n(f.vaL) || 1);
      if (vaMin < 0.6) out.push({ level: 'warn', text: '裸眼视力偏低' });

      if (!out.length) out.push({ level: 'ok', text: '指标平稳' });
      return out;
    },

    COLORS
  };

  window.ECP.charts = charts;
})();
