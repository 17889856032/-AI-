# 青眸护眼平台 · 云服务器部署指南

> 适用：Ubuntu 20.04 / 22.04（Debian 系同理）。平台是「纯 Python 标准库后端 + 静态前端」，无第三方依赖。

---

## 一、前提准备

1. 一台云服务器（阿里云 / 腾讯云 / 火山引擎 ECS 均可），系统选 **Ubuntu 22.04**。
2. 在云控制台「安全组 / 防火墙」放行端口：
   - 直接跑：放行 **8123**（TCP）
   - 用 nginx + 域名 + HTTPS（推荐）：放行 **80、443**

---

## 二、上传代码到服务器

把本地的 `eye-care-platform` 整个目录传到服务器 `/opt/qingmou/` 下。

任选一种方式：

```bash
# 方式一：本地 Windows PowerShell 用 scp 上传（在项目上一级目录执行）
scp -r "d:\护眼\eye-care-platform" root@你的服务器IP:/opt/qingmou/

# 方式二：服务器上用 git 拉取（如果你已经提交到仓库）
cd /opt/qingmou && git clone 你的仓库地址 eye-care-platform
```

---

## 三、配置密钥（服务端环境变量）

在服务器上创建密钥文件（权限 600，只 root 可读）：

```bash
sudo mkdir -p /etc/qingmou
sudo tee /etc/qingmou/ark.env > /dev/null <<'EOF'
ARK_API_KEY=ark-你的密钥
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seed-2-1-lite-260915
PORT=8123
EOF
sudo chmod 600 /etc/qingmou/ark.env
```

> 把 `ark-你的密钥` 换成你的真实方舟 Key。**不要把密钥写进代码或 git**。

---

## 四、安装为系统服务（开机自启 + 崩溃自动重启）

```bash
# 复制服务文件
sudo cp /opt/qingmou/eye-care-platform/server/eye-care.service /etc/systemd/system/qingmou.service

# 启动并设为开机自启
sudo systemctl daemon-reload
sudo systemctl enable --now qingmou

# 查看运行状态
sudo systemctl status qingmou
```

验证：

```bash
curl http://127.0.0.1:8123/api/health
# 应返回 {"ok": true, "arkKeyConfigured": true, ...}
```

浏览器访问 `http://你的服务器IP:8123` 即可打开平台。

---

## 五、（推荐）配置 nginx + 域名 + HTTPS

有域名时建议加 HTTPS，避免明文传输、也更专业。示例配置 `/etc/nginx/sites-available/qingmou`：

```nginx
server {
    listen 80;
    server_name 你的域名;

    location / {
        proxy_pass http://127.0.0.1:8123;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # OCR/AI 响应较慢，超时调大
        proxy_read_timeout 130s;
        proxy_send_timeout 130s;
    }
}
```

启用并申请免费证书：

```bash
sudo ln -s /etc/nginx/sites-available/qingmou /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 用 certbot 自动申请 HTTPS 证书
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

之后访问 `https://你的域名` 即可。

---

## 六、日常维护

```bash
sudo systemctl restart qingmou   # 更新代码后重启
sudo systemctl status qingmou    # 查看状态
sudo journalctl -u qingmou -f    # 实时看日志
```

**更新代码流程**：上传新代码到 `/opt/qingmou/eye-care-platform` → `sudo systemctl restart qingmou`。

---

## 附：本地开发仍可用的方式

本地开发时若只想本机访问（不暴露局域网），可显式指定：

```powershell
$env:HOST="127.0.0.1"; python server/server.py
```
