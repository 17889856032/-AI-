/* ============================================================
 * config.js —— 第三方 API 接入配置
 * 平台默认使用 mock（本地模拟）模式，开箱即用。
 * 接入真实服务时，把 provider 改为对应值并填入密钥即可，
 * api.js 中已按此配置写好调用骨架。
 * ============================================================ */
window.ECP_CONFIG = {

  /* ---------- 检查单 OCR 识别 ----------
   * provider 可选：
   *   'ark'    火山引擎方舟 · 豆包多模态（真实识别，走同源代理，密钥在服务端）
   *   'mock'   本地模拟识别（无需密钥）
   *   'baidu'  百度智能云 · 通用文字识别（高精度版）
   *   'custom' 自建/任意 HTTP OCR 服务（返回 JSON 即可）
   */
  ocr: {
    provider: 'ark',
    // 豆包多模态：复用 AI 分析的同源代理（密钥只在 server/server.py 持有）
    arkProxy: '/api/ark/responses',
    arkModel: 'doubao-seed-2-1-lite-260915',
    // 百度 OCR：API Key / Secret Key（在百度智能云控制台创建应用获取）
    baiduApiKey: '',
    baiduSecretKey: '',
    // custom 模式：完整接口地址与请求头（如内部网关）
    customEndpoint: '',
    customHeaders: { /* 'Authorization': 'Bearer xxx' */ }
  },

  /* ---------- AI 分析 ----------
   * provider 可选：
   *   'mock'   本地规则引擎生成建议（默认，无需密钥）
   *   'ark'    火山引擎方舟 · 豆包（经本地后端同源代理，密钥只存服务端）
   *   'openai' OpenAI 兼容 Chat Completions 接口（DeepSeek / 通义 / 智谱 / Kimi 等）
   *
   * 安全说明：ark 模式下前端不再持有任何 API Key，
   * 请求发往同源 /api/ark/responses，由 server/server.py 注入密钥后转发。
   */
  ai: {
    provider: 'ark',

    /* 火山引擎方舟（豆包）—— 走本地后端代理 */
    arkProxy: '/api/ark/responses',
    arkModel: 'doubao-seed-2-1-lite-260915',

    /* OpenAI 兼容接口（备用，直连模式才需要填写） */
    baseUrl: '',          // 例：https://api.deepseek.com/v1
    apiKey: '',
    model: '',            // 例：deepseek-chat
    timeout: 120000       // 豆包推理型模型生成完整报告较慢，前端超时放宽到 120s
  },

  /* 演示模式下 OCR 模拟耗时（毫秒），用于展示进度条 */
  mockOcrDuration: 1600
};
