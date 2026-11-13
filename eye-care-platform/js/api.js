/* ============================================================
 * api.js —— 外部 API 封装层
 *  - ECP.api.ocrImage(file, onProgress)  检查单 OCR
 *  - ECP.api.analyzeReport(report, profile)  AI 个性化分析
 * 未配置密钥时自动走 mock，保证平台可离线演示；
 * 在 js/config.js 填入密钥并切换 provider 即接入真实服务。
 * ============================================================ */
(function () {
  'use strict';
  const CFG = () => window.ECP_CONFIG;
  const { num, escapeHtml } = window.ECP.utils;

  /* 模拟进度回调 */
  function mockProgress(onProgress, duration) {
    return new Promise((resolve) => {
      let p = 8;
      const timer = setInterval(() => {
        p = Math.min(96, p + Math.random() * 16);
        onProgress && onProgress(Math.round(p));
        if (p >= 96) { clearInterval(timer); resolve(); }
      }, duration / 9);
    });
  }

  const api = {

    /* ================= OCR 识别 ================= */
    async ocrImage(file, onProgress) {
      const cfg = CFG().ocr;
      onProgress && onProgress(4);

      if (cfg.provider === 'ark') return arkOcr(file, onProgress);
      if (cfg.provider === 'baidu') return baiduOcr(file, onProgress);
      if (cfg.provider === 'custom') return customOcr(file, onProgress);
      return mockOcr(file, onProgress);
    },

    /* ================= AI 分析 ================= */
    async analyzeReport(report, profile) {
      const provider = CFG().ai.provider;
      if (provider === 'ark') return arkAnalyze(report, profile);
      if (provider === 'openai') return openAiAnalyze(report, profile);
      return mockAnalyze(report, profile);
    }
  };

  /* ------------------------------------------------------------
   * Mock OCR：返回一份模拟的眼科检查单结构化数据
   * ---------------------------------------------------------- */
  async function mockOcr(file, onProgress) {
    await mockProgress(onProgress, CFG().mockOcrDuration);
    const rnd = (min, max, fix = 2) => +(min + Math.random() * (max - min)).toFixed(fix);
    const sphR = rnd(-5.5, -0.75), sphL = +(sphR + rnd(-0.5, 0.5)).toFixed(2);

    const data = {
      examDate: window.ECP.utils.todayStr(),
      hospital: '示范市人民医院 · 眼科',
      vaL: rnd(0.4, 0.9, 1).toFixed(1),
      vaR: rnd(0.4, 0.9, 1).toFixed(1),
      cvaL: '1.0', cvaR: '1.0',
      sphL, sphR,
      cylL: rnd(-1.5, -0.25), cylR: rnd(-1.5, -0.25),
      axisL: Math.round(rnd(5, 175, 0)), axisR: Math.round(rnd(5, 175, 0)),
      iopL: rnd(13, 20, 1), iopR: rnd(13, 20, 1),
      pd: Math.round(rnd(58, 68, 0)),
      conclusion: '双眼屈光不正（近视合并散光），建议科学矫正并定期复查。',
      rawText:
        '【模拟识别原文】\n' +
        '裸眼视力：右眼 0.6  左眼 0.5\n' +
        '矫正视力：右眼 1.0  左眼 1.0\n' +
        '电脑验光（SPH/CYL/AXIS）：\n' +
        `右眼 ${sphR} / ${rnd(-1.5, -0.25)} / ${Math.round(rnd(5, 175, 0))}\n` +
        `左眼 ${sphL} / ${rnd(-1.5, -0.25)} / ${Math.round(rnd(5, 175, 0))}\n` +
        '非接触式眼压（mmHg）：右眼 16  左眼 15\n瞳距：64 mm'
    };
    onProgress && onProgress(100);
    return { ok: true, mocked: true, data };
  }

  /* ------------------------------------------------------------
   * 豆包多模态 OCR：图片 base64 + 结构化提取提示词，走同源代理
   * ---------------------------------------------------------- */
  async function arkOcr(file, onProgress) {
    const { arkProxy, arkModel } = CFG().ocr;
    if (!arkProxy || !arkModel) {
      throw new Error('OCR 方舟代理未配置，请检查 js/config.js 的 arkProxy / arkModel');
    }

    onProgress(15);
    const b64 = await fileToOcrBase64(file);

    const prompt = `请识别这张眼科检查单/验光单，提取关键数据。只输出一个 JSON 对象，不要输出 markdown 代码块或任何解释文字，结构如下：
{
  "examDate": "YYYY-MM-DD，没有则空字符串",
  "hospital": "医院/机构名称，没有则空字符串",
  "vaR": "右眼裸眼视力", "vaL": "左眼裸眼视力",
  "cvaR": "右眼矫正视力", "cvaL": "左眼矫正视力",
  "sphR": "右眼球镜SPH", "sphL": "左眼球镜SPH",
  "cylR": "右眼柱镜CYL", "cylL": "左眼柱镜CYL",
  "axisR": "右眼轴位AXIS", "axisL": "左眼轴位AXIS",
  "iopR": "右眼眼压IOP", "iopL": "左眼眼压IOP",
  "pd": "瞳距PD",
  "conclusion": "单据上的诊断结论，没有则空字符串",
  "rawText": "单据完整原文逐行输出"
}
要求：数值只填数字（可带正负号与小数点），识别不到的项目填空字符串""，不要臆造任何数值。`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const res = await fetch(arkProxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: arkModel,
          input: [{
            role: 'user',
            content: [
              { type: 'input_image', image_url: b64 },
              { type: 'input_text', text: prompt }
            ]
          }]
        })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error('OCR 接口报错：' + (json?.error?.message || json?.message || ('HTTP ' + res.status)));
      }
      if (json.status && json.status !== 'completed') {
        throw new Error('OCR 响应未完成，状态：' + json.status);
      }

      const message = (json.output || []).find((o) => o.type === 'message');
      const text = (message?.content || [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join('\n')
        .trim();
      if (!text) throw new Error('OCR 未返回识别文本');

      const parsed = extractJson(text);
      onProgress(100);
      return { ok: true, mocked: false, vendor: 'ark', data: Object.assign(emptyFields(), parsed) };
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('OCR 请求超时（120s）');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ------------------------------------------------------------
   * 百度 OCR（通用文字识别 · 高精度版）
   * 文档：https://cloud.baidu.com/doc/OCR/s/Ck3h7y2ia
   * ---------------------------------------------------------- */
  async function baiduOcr(file, onProgress) {
    const { baiduApiKey, baiduSecretKey } = CFG().ocr;
    if (!baiduApiKey || !baiduSecretKey) {
      throw new Error('未配置百度 OCR 密钥，请在 js/config.js 填写 baiduApiKey / baiduSecretKey');
    }
    onProgress(15);
    // 1. 获取 access_token（生产环境应缓存 token，有效期 30 天）
    const tokenRes = await fetch(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${baiduApiKey}&client_secret=${baiduSecretKey}`,
      { method: 'POST' }
    ).then((r) => r.json());
    if (!tokenRes.access_token) throw new Error('百度 OCR 鉴权失败：' + (tokenRes.error_description || '未知错误'));

    onProgress(45);
    // 2. 图片转 base64 调用高精度识别
    const b64 = await fileToBase64(file);
    const ocrRes = await fetch(
      `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${tokenRes.access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'image=' + encodeURIComponent(b64.split(',')[1])
      }
    ).then((r) => r.json());
    if (ocrRes.error_code) throw new Error('OCR 识别失败：' + ocrRes.error_msg);

    onProgress(90);
    const rawText = (ocrRes.words_result || []).map((w) => w.words).join('\n');
    /* 说明：医院单据版式差异大，结构化字段建议结合 AI 解析。
       这里先保留原文，用户可在识别结果页手动补全/校对字段。 */
    onProgress(100);
    return {
      ok: true,
      mocked: false,
      data: { ...emptyFields(), rawText, hospital: guessHospital(rawText) }
    };
  }

  /* ------------------------------------------------------------
   * 自定义 OCR 服务：约定返回结构化 JSON
   * { examDate, hospital, vaL, vaR, sphL, sphR, ... , rawText }
   * ---------------------------------------------------------- */
  async function customOcr(file, onProgress) {
    const { customEndpoint, customHeaders } = CFG().ocr;
    if (!customEndpoint) throw new Error('未配置 custom OCR 地址');
    onProgress(20);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(customEndpoint, { method: 'POST', headers: customHeaders, body: fd });
    if (!res.ok) throw new Error('OCR 服务异常：HTTP ' + res.status);
    const json = await res.json();
    onProgress(100);
    return { ok: true, mocked: false, data: Object.assign(emptyFields(), json) };
  }

  /* ------------------------------------------------------------
   * Mock AI：基于规则的本地分析引擎
   * ---------------------------------------------------------- */
  async function mockAnalyze(report, profile) {
    await new Promise((r) => setTimeout(r, 1100));
    const f = report.fields || {};
    const sections = [];

    /* 近视分级（取较低度数眼） */
    const sphMin = Math.min(num(f.sphR) ?? 0, num(f.sphL) ?? 0);
    let level = '正视或轻度屈光不正';
    if (sphMin <= -6) level = '高度近视';
    else if (sphMin <= -3) level = '中度近视';
    else if (sphMin < -0.5) level = '轻度近视';

    sections.push({
      type: 'info',
      title: '一、总体评估',
      items: [
        `本次检查（${report.examDate || '日期未填'} · ${escapeHtml(report.hospital || '机构未填')}）显示：${level}。`,
        `右眼球镜 ${f.sphR ?? '—'}D、左眼球镜 ${f.sphL ?? '—'}D；右眼裸眼视力 ${f.vaR ?? '—'}、左眼 ${f.vaL ?? '—'}。`,
        `眼压：右眼 ${f.iopR ?? '—'}mmHg、左眼 ${f.iopL ?? '—'}mmHg；瞳距 ${f.pd ?? '—'}mm。`
      ]
    });

    /* 风险提示 */
    const risks = [];
    if (sphMin <= -6) risks.push('高度近视者视网膜脱离、黄斑病变风险升高，应避免蹦极、拳击等剧烈冲击运动。');
    const iopMax = Math.max(num(f.iopR) || 0, num(f.iopL) || 0);
    if (iopMax > 21) risks.push(`眼压最高 ${iopMax}mmHg 超出正常上限（10–21mmHg），建议排查青光眼并复测。`);
    const diff = Math.abs((num(f.sphR) || 0) - (num(f.sphL) || 0));
    if (diff >= 2.5) risks.push(`双眼度数相差 ${diff.toFixed(2)}D，屈光参差明显，矫正方案需遵医嘱并关注视疲劳。`);
    const vaMin = Math.min(num(f.vaR) || 1, num(f.vaL) || 1);
    if (vaMin < 0.6) risks.push('裸眼视力低于 0.6，若未矫正会加重视疲劳，建议尽快医学验光配镜。');
    if (!risks.length) risks.push('本次各项指标总体平稳，未发现明显异常信号，继续保持良好用眼习惯。');
    sections.push({ type: 'terra', title: '二、风险提示', items: risks });

    /* 个性化建议（结合档案） */
    const tips = [
      '遵循 20-20-20 法则：每用眼 20 分钟，远眺 20 英尺（约 6 米）外至少 20 秒。',
      '保持读写环境光照充足、屏幕与眼距离 40–50cm，每天保证 2 小时以上日间户外活动。',
      '控制连续电子屏幕使用时间，睡前 1 小时尽量不看手机。'
    ];
    if (profile.age && Number(profile.age) <= 18) {
      tips.unshift('青少年处于近视进展高发期，建议每 3–6 个月做一次散瞳验光并监测眼轴长度。');
    }
    if (sphMin <= -6) tips.push('高度近视建议每年进行一次眼底照相 + OCT 检查，建立眼底档案。');
    if (profile.habit && /长时间|加班|电脑/.test(profile.habit)) {
      tips.push('检测到您长时间近距离用眼，可配合人工泪液缓解干涩，并调整屏幕上沿与视线平齐。');
    }
    sections.push({ type: 'gold', title: '三、个性化护眼建议', items: tips });

    /* 随访计划 */
    const plan = sphMin <= -6
      ? ['建议 3 个月内复查眼压与眼底', '半年进行一次全面眼科评估', '出现闪光感、飞蚊骤增、视野缺损时立即就诊']
      : sphMin <= -3
        ? ['建议 6 个月复查验光与眼轴', '每日累计户外活动不少于 2 小时', '度数变化超过 50 度及时更换矫正方案']
        : ['建议 6–12 个月常规复查一次', '坚持每日护眼打卡，记录视力变化趋势'];
    sections.push({ type: 'info', title: '四、随访与复查计划', items: plan });

    return {
      ok: true,
      mocked: true,
      result: {
        summary: `${level}；${iopMax > 21 ? '眼压偏高需关注' : '眼压在正常范围'}；建议按计划复查并坚持护眼习惯。`,
        sections
      }
    };
  }

  /* ------------------------------------------------------------
   * 火山引擎方舟 · 豆包（经本地后端同源代理 /api/ark/responses）
   * 前端不持有 API Key，由 server/server.py 注入密钥后转发；
   * 请求体使用 input 数组，正文取 output 中 type=message 的
   * content[].text（reasoning 思考项需跳过）
   * ---------------------------------------------------------- */
  async function arkAnalyze(report, profile) {
    const { arkProxy, arkModel, timeout } = CFG().ai;
    if (!arkProxy || !arkModel) {
      throw new Error('方舟代理未配置，请检查 js/config.js 的 arkProxy / arkModel');
    }

    const prompt = `你是一名资深眼科近视防控专家，擅长青少年（儿童及中小学生）视力改善与近视管理。请针对孩子本人，依据下面的眼科检查单与个人档案，输出针对孩子的视力改善与近视防控建议（供家长阅读），用通俗中文完成分析。
【个人档案】${JSON.stringify(profile)}
【眼科检查单】${JSON.stringify(report)}

只输出一个 JSON 对象，不要输出 markdown 代码块或任何解释文字，结构严格如下：
{
  "summary": "一句话总体结论",
  "sections": [
    { "type": "info", "title": "一、视力状况评估", "items": ["要点1", "要点2"] },
    { "type": "terra", "title": "二、近视进展风险提示", "items": ["要点1"] },
    { "type": "gold", "title": "三、改善视力的行动建议", "items": ["要点1"] },
    { "type": "info", "title": "四、复查与随访计划", "items": ["要点1"] }
  ]
}
要求：type 只能取 info / terra / gold；聚焦青少年近视防控，行动建议需涵盖：每日日间户外活动至少2小时、保持读写距离与充足光照、控制连续近距离用眼并遵循20-20-20法则、减少非必要电子屏使用、保证睡眠与均衡饮食；科学矫正手段（离焦镜、角膜塑形镜、低浓度阿托品等）须注明"需遵医嘱"；真性近视不可逆，不得承诺"治愈"或"度数回退"，表述为"延缓进展、科学矫正"；结合档案中的年龄、用眼强度、病史给出针对性建议；数值缺失的项目不要臆造，注明"未提供"。`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout || 45000);
    try {
      /* 同源请求本地后端代理，密钥在服务端注入，前端无需 Authorization */
      const res = await fetch(arkProxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: arkModel,
          input: [{
            role: 'user',
            content: [{ type: 'input_text', text: prompt }]
          }]
        })
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error?.message || json?.message || ('HTTP ' + res.status);
        throw new Error('方舟接口报错：' + msg);
      }
      if (json.status && json.status !== 'completed') {
        throw new Error('方舟响应未完成，状态：' + json.status);
      }

      /* 跳过 reasoning 思考项，只取 assistant 消息正文 */
      const message = (json.output || []).find((o) => o.type === 'message');
      const text = (message?.content || [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join('\n')
        .trim();
      if (!text) throw new Error('方舟返回中未找到 output_text 正文');

      const parsed = extractJson(text);
      return { ok: true, mocked: false, vendor: 'ark', result: normalizeResult(parsed, text) };
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('方舟请求超时（' + (timeout || 45000) / 1000 + 's）');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /* 容错 JSON 提取：兼容 ```json 代码块包裹、前后缀说明文字 */
  function extractJson(text) {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    try { return JSON.parse(cleaned); } catch (_) { /* 继续降级 */ }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('AI 返回内容不是有效 JSON');
  }

  /* 结果结构归一化，保证视图层字段可用 */
  function normalizeResult(parsed, rawText) {
    const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
    const safeSections = sections
      .filter((s) => s && (Array.isArray(s.items) ? s.items.length : s.items))
      .map((s) => ({
        type: ['info', 'terra', 'gold'].includes(s.type) ? s.type : 'info',
        title: String(s.title || 'AI 建议'),
        items: Array.isArray(s.items) ? s.items.map(String) : [String(s.items)]
      }));
    if (!safeSections.length) {
      safeSections.push({
        type: 'info',
        title: 'AI 原始回复',
        items: rawText.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 8)
      });
    }
    return {
      summary: String(parsed?.summary || rawText.slice(0, 60)),
      sections: safeSections
    };
  }

  /* ------------------------------------------------------------
   * 真实 AI：OpenAI 兼容 Chat Completions
   * 适配 DeepSeek / 通义千问 / 智谱 GLM / Kimi / OpenAI 等
   * ---------------------------------------------------------- */
  async function openAiAnalyze(report, profile) {
    const { baseUrl, apiKey, model, timeout } = CFG().ai;
    if (!baseUrl || !apiKey || !model) {
      throw new Error('AI 服务未配置完整，请在 js/config.js 填写 baseUrl / apiKey / model');
    }
    const sysPrompt = '你是一名资深眼科健康管理师，依据用户的眼科检查单与个人档案，用通俗中文输出个性化分析。';
    const userPrompt = `个人档案：${JSON.stringify(profile)}
眼科检查单（JSON）：${JSON.stringify(report)}
请严格返回 JSON，结构为：
{
  "summary": "一句话总体结论",
  "sections": [
    { "type": "info|terra|gold", "title": "小节标题", "items": ["要点1", "要点2"] }
  ]
}
覆盖：总体评估、风险提示、个性化护眼建议、随访复查计划四个小节。`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout || 30000);
    try {
      const res = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        signal: ctrl.signal,
        body: JSON.stringify({
          model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!res.ok) throw new Error('AI 接口异常：HTTP ' + res.status);
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(content.replace(/^```json|```$/g, '').trim());
      return { ok: true, mocked: false, result: parsed };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------- 辅助 ---------------- */
  function emptyFields() {
    return {
      examDate: '', hospital: '',
      vaL: '', vaR: '', cvaL: '', cvaR: '',
      sphL: '', sphR: '', cylL: '', cylR: '',
      axisL: '', axisR: '', iopL: '', iopR: '', pd: '',
      conclusion: '', rawText: ''
    };
  }

  function guessHospital(text) {
    const m = text.match(/[一-龥]{2,20}(医院|眼科中心|眼病门诊|视光中心)/);
    return m ? m[0] : '';
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  /* OCR 专用图片预处理：转成白底 JPEG、限制长边，去掉 alpha 通道，
     避免 png 透明通道让方舟多模态处理超时，同时压缩体积加快识别 */
  function fileToOcrBase64(file, maxSide = 1600) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = reject;
      r.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  window.ECP.api = api;
})();
