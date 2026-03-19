# 部署技术方案

> 项目: 需求管理系统 (demand_management_v2)
> 环境: Windows Server 堡垒机
> 最后更新: 2026-03

---

## 1. 网络拓扑

```
用户浏览器
  │
  ▼
IIS (tytapitest.1234567.com.cn)
  │  路由规则: /ty/rsm/* → 转发
  ▼
Nginx (10.189.26.145:8080)
  ├─ /ty/rsm/api/*  → FastAPI (127.0.0.1:8000)
  ├─ /ty/rsm/*      → 静态资源 (dist/)
  └─ /api/*          → FastAPI (本地调试直连时)
```

**关键点**: IIS 只转发 `/ty/rsm/*` 路径，其他路径由 IIS 自行处理。因此前端的所有资源引用和 API 请求都必须带 `/ty/rsm/` 前缀。

---

## 2. 目录结构

```
D:\jjy\demand_management_v2\
├── server/                      # FastAPI 后端
│   ├── app/
│   ├── data/
│   │   ├── data.db              # SQLite 数据库
│   │   ├── uploads/             # 附件存储
│   │   └── backups/             # 数据库备份
│   ├── logs/
│   │   ├── stdout.log
│   │   └── stderr.log
│   └── .env                     # 后端环境变量
│
├── web/                         # React 前端
│   ├── dist/                    # 构建产物 (Nginx 直接托管)
│   ├── config/
│   │   └── config.ts            # 构建配置 (base/publicPath/define)
│   └── src/
│       └── requestErrorConfig.ts  # API 请求拦截器
│
└── docs/                        # 项目文档
```

---

## 3. 前端构建配置

### 3.1 config/config.ts 核心配置

```typescript
const {REACT_APP_ENV = 'dev'} = process.env;
const isProd = REACT_APP_ENV !== 'dev';
const PUBLIC_PATH = isProd ? '/ty/rsm/' : '/';

export default defineConfig({
    base: isProd ? '/ty/rsm/' : '/',       // 路由前缀
    publicPath: PUBLIC_PATH,               // 静态资源 URL 前缀
    define: {
        API_BASE_URL: isProd ? '/ty/rsm' : '',  // 编译时常量，注入到 JS 中
    },
});
```

- `base`: SPA 路由的 basename，影响 `history.push` 等路由行为
- `publicPath`: CSS/JS/图片等静态资源的 URL 前缀，影响 `index.html` 中的引用路径
- `API_BASE_URL`: umi `define` 是**编译时文本替换**，不是运行时全局变量，在 console 中无法直接访问

### 3.2 requestErrorConfig.ts API 前缀注入

```typescript
requestInterceptors: [
    (config: RequestOptions) => {
        let url = config?.url || '';
        if (API_BASE_URL && url.startsWith('/api/')) {
            url = `${API_BASE_URL}${url}`;
        }
        return {...config, url};
    },
],
```

生产环境下，所有 `/api/xxx` 请求会被自动重写为 `/ty/rsm/api/xxx`。

### 3.3 构建命令

```powershell
# 进入前端目录
cd D:\jjy\demand_management_v2\web

# 注意: conda 环境可能遮蔽系统 Node.js，先退出
conda deactivate

# 生产构建 (必须设置环境变量，否则 isProd=false)
$env:REACT_APP_ENV="prod"; npm run build
```

**验证构建结果**:

```powershell
# 检查 index.html 中资源路径是否带前缀
Select-String -Path "dist\index.html" -Pattern "/ty/rsm/"

# 检查 API_BASE_URL 已被替换 (搜不到说明替换成功)
Select-String -Path "dist\umi.*.js" -Pattern "API_BASE_URL"
```

---

## 4. Nginx 配置

文件位置: `D:\programFiles\nginx-1.28.2\conf\nginx.conf`

```nginx
worker_processes  1;
events {
    worker_connections  1024;
}
http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    server {
        listen 8080;
        access_log  logs/rsm_access.log;
        error_log   logs/rsm_error.log;

        # ---- API 转发 ----

        # 外网经 IIS 转发，请求带 /ty/rsm 前缀
        location /ty/rsm/api/ {
            proxy_pass http://127.0.0.1:8000/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 300s;
            client_max_body_size 50m;
        }

        # 本地直连 8080 时不带前缀 (调试用)
        location /api/ {
            proxy_pass http://127.0.0.1:8000/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 300s;
            client_max_body_size 50m;
        }

        # ---- 前端静态资源 ----

        # 注意: 用 alias 而非 root，否则路径会拼成 dist/ty/rsm/xxx
        location /ty/rsm/ {
            alias D:/jjy/demand_management_v2/web/dist/;
            index index.html;
            try_files $uri $uri/ /ty/rsm/index.html;
        }

        # 上传目录禁止直接访问
        location /data/uploads/ {
            deny all;
        }
    }
}
```

**`alias` vs `root` 区别**:

- `root /path/dist` + `location /ty/rsm/` → 查找 `/path/dist/ty/rsm/xxx` ❌
- `alias /path/dist/` + `location /ty/rsm/` → 查找 `/path/dist/xxx` ✅

---

## 5. 服务管理 (NSSM)

### 5.1 安装服务

```powershell
# ---- 后端 API ----
nssm install OpenSpec-API "D:\programFiles\miniconda3\envs\demand_management_v2\python.exe" "-m uvicorn app.main:app --host 127.0.0.1 --port 8000"
nssm set OpenSpec-API AppDirectory "D:\jjy\demand_management_v2\server"
nssm set OpenSpec-API AppStdout "D:\jjy\demand_management_v2\server\logs\stdout.log"
nssm set OpenSpec-API AppStderr "D:\jjy\demand_management_v2\server\logs\stderr.log"
nssm set OpenSpec-API AppRotateFiles 1
nssm set OpenSpec-API AppRotateBytes 10485760
nssm start OpenSpec-API

# ---- Nginx ----
nssm install OpenSpec-Nginx "D:\programFiles\nginx-1.28.2\nginx.exe"
nssm set OpenSpec-Nginx AppDirectory "D:\programFiles\nginx-1.28.2"
nssm start OpenSpec-Nginx
```

### 5.2 日常运维命令

```powershell
# 查看服务状态
nssm status OpenSpec-API
nssm status OpenSpec-Nginx

# 启动/停止/重启
nssm start   OpenSpec-API
nssm stop    OpenSpec-API
nssm restart OpenSpec-API

# 查看后端日志
Get-Content D:\jjy\demand_management_v2\server\logs\stderr.log -Tail 50
Get-Content D:\jjy\demand_management_v2\server\logs\stdout.log -Tail 50

# 查看 Nginx 日志
Get-Content D:\programFiles\nginx-1.28.2\logs\rsm_access.log -Tail 50
Get-Content D:\programFiles\nginx-1.28.2\logs\rsm_error.log -Tail 50
```

---

## 6. 更新部署速查

| 改了什么     | 操作                                         | 需要重启                          |
|----------|--------------------------------------------|-------------------------------|
| 前端代码     | `$env:REACT_APP_ENV="prod"; npm run build` | 不用重启 Nginx，Ctrl+F5 刷浏览器       |
| 后端代码     | 同步代码到 server/                              | `nssm restart OpenSpec-API`   |
| Nginx 配置 | 编辑 nginx.conf                              | `nssm restart OpenSpec-Nginx` |
| 数据库结构    | 运行迁移脚本                                     | `nssm restart OpenSpec-API`   |

---

## 7. 常见问题排查

### 静态资源 404 (X-Powered-By: ASP.NET)

**现象**: CSS/JS 返回 404，响应头含 `X-Powered-By: ASP.NET`。
**原因**: 请求没有 `/ty/rsm/` 前缀，被 IIS 拦截。
**排查**: 检查 `dist/index.html` 中资源路径是否带 `/ty/rsm/` 前缀。若没有，说明构建时 `REACT_APP_ENV` 未设为非 `dev` 值。

### API 请求 404

**现象**: `/api/v1/auth/login` 返回 404。
**排查**:

1. 检查请求 URL 是否带 `/ty/rsm` 前缀（外网访问时必须带）
2. 确认 `dist/umi.*.js` 中搜不到 `API_BASE_URL` 字符串（说明编译替换成功）
3. 确认登录等接口使用的是 umi `request`，而非原生 `fetch`

### uvicorn 响应旧代码

**现象**: 后端改了但行为没变。
**原因**: Windows 上 `--reload` 可能加载 stale `.pyc`。
**修复**:

```powershell
Get-ChildItem -Path D:\jjy\demand_management_v2\server -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force
nssm restart OpenSpec-API
```

### Umi 开发端口漂移

**现象**: `npm start` 后实际端口不是预期的 8000/8001。
**原因**: 端口被占用，Umi 自动跳到下一个可用端口。
**排查**: `netstat -ano | findstr "LISTENING" | findstr "800"`

### conda 遮蔽 Node.js

**现象**: `npm run build` 报错或行为异常。
**原因**: conda 环境的 PATH 优先级高于系统 Node.js。
**修复**: 构建前执行 `conda deactivate`。

---

## 8. 访问地址

| 环境            | 地址                                          |
|---------------|---------------------------------------------|
| 外网 (经 IIS)    | `https://tytapitest.1234567.com.cn/ty/rsm/` |
| 内网 (直连 Nginx) | `http://10.189.26.145:8080/ty/rsm/`         |
| 后端 API 文档     | `http://127.0.0.1:8000/docs` (仅堡垒机本地)       |
