# -*- coding: utf-8 -*-
"""
青眸平台 · 本地后端（仅 Python 标准库，无需 pip 安装）
职责：
  1. 同源托管前端静态文件（平台根目录 = 本文件上一级）
  2. POST /api/ark/responses  代理火山方舟 Responses API，密钥只在服务端持有
  3. GET  /api/health         健康检查与密钥配置状态

密钥解析顺序：环境变量 ARK_API_KEY > 平台目录外的 .secrets/ark.json
启动：python server/server.py  （默认 0.0.0.0:8123，可用 HOST/PORT 环境变量覆盖）
"""
import json
import os
import sys
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8123"))
BASE_DIR = Path(__file__).resolve().parent.parent          # eye-care-platform/
SECRET_FILE = BASE_DIR.parent / ".secrets" / "ark.json"     # 平台目录之外，静态访问不到


def load_secret():
    """读取方舟配置：环境变量优先，其次读平台外的私密文件。"""
    cfg = {"apiKey": os.environ.get("ARK_API_KEY", ""), "baseUrl": "", "model": ""}
    if SECRET_FILE.exists():
        try:
            file_cfg = json.loads(SECRET_FILE.read_text(encoding="utf-8"))
            cfg["apiKey"] = cfg["apiKey"] or file_cfg.get("apiKey", "")
            cfg["baseUrl"] = file_cfg.get("baseUrl", "")
            cfg["model"] = file_cfg.get("model", "")
        except (ValueError, OSError) as e:
            print(f"[warn] 读取密钥文件失败: {e}")
    cfg["baseUrl"] = os.environ.get("ARK_BASE_URL", cfg["baseUrl"])
    cfg["model"] = os.environ.get("ARK_MODEL", cfg["model"])
    return cfg


SECRET = load_secret()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    # ---------- 日志 ----------
    def log_message(self, fmt, *args):
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    # ---------- 安全：拒绝任何穿越静态根目录的路径 ----------
    def _is_safe_static_path(self):
        normalized = os.path.normpath(self.translate_path(self.path))
        return normalized.startswith(str(BASE_DIR))

    def do_GET(self):
        if self.path.startswith("/api/"):
            if self.path.split("?")[0] == "/api/health":
                return self._json(200, {
                    "ok": True,
                    "service": "qingmou-backend",
                    "arkKeyConfigured": bool(SECRET["apiKey"]),
                    "model": SECRET["model"] or "(未配置)"
                })
            return self._json(404, {"ok": False, "error": "未知的 API 路径"})
        if not self._is_safe_static_path():
            return self._json(403, {"ok": False, "error": "非法路径"})
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/ark/responses":
            return self._proxy_ark()
        return self._json(404, {"ok": False, "error": "未知的 API 路径"})

    # ---------- 方舟代理 ----------
    def _proxy_ark(self):
        if not SECRET["apiKey"]:
            return self._json(500, {"ok": False, "error": "服务端未配置 ARK_API_KEY"})

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 10 * 1024 * 1024:
            return self._json(400, {"ok": False, "error": "请求体为空或超过 10MB 限制"})
        raw = self.rfile.read(length)

        # 校验并约束前端只能发 JSON，服务端强制非流式以便统一解析
        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {"ok": False, "error": "请求体必须是 JSON 对象"})
        payload["stream"] = False
        if not payload.get("model"):
            payload["model"] = SECRET["model"]
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        upstream = SECRET["baseUrl"].rstrip("/") + "/responses"
        req = urllib.request.Request(
            upstream,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Authorization": "Bearer " + SECRET["apiKey"],
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                upstream_body = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(upstream_body)
        except urllib.error.HTTPError as e:
            # 透传上游错误（含 401/429/4xx 详情），但不泄露密钥
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(e.read())
        except urllib.error.URLError as e:
            self._json(502, {"ok": False, "error": "无法连接方舟服务: " + str(e.reason)})
        except TimeoutError:
            self._json(504, {"ok": False, "error": "方舟服务响应超时"})

    # ---------- 工具 ----------
    def _json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def main():
    if not SECRET["apiKey"]:
        print("[warn] 未检测到 ARK_API_KEY，AI 代理将不可用（静态页面不受影响）")
    print(f"[info] 静态根目录: {BASE_DIR}")
    print(f"[info] 密钥文件: {SECRET_FILE} ({'存在' if SECRET_FILE.exists() else '不存在，将依赖环境变量'})")
    print(f"[info] 服务已启动: http://{HOST}:{PORT}/  (Ctrl+C 停止)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
