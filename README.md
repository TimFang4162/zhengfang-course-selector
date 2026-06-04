# JWXT

当前目录结构：

```text
jwxt/
├── main.py                   # Web UI 默认入口
├── frontend/
│   ├── index.html            # Bun 前端入口 HTML
│   ├── build.ts              # Bun 静态构建脚本
│   ├── dev.ts                # Bun HMR 开发服务器，代理 /api/* 到 Python
│   └── src/                  # 前端源码
├── jwxt/
│   ├── core.py               # 教务登录、请求、解析、选退课核心逻辑
│   └── web/
│       ├── static/           # Bun 构建后的 Web UI 静态资源
│       │   ├── index.html
│       │   └── chunk-*.{js,css}
│       ├── grab.py           # 抢课表达式、预览和任务调度
│       ├── service.py        # Web API 业务服务
│       └── server.py         # 本地 Web UI HTTP 服务
├── pyproject.toml            # Python 依赖
├── package.json              # Bun 前端脚本和依赖
├── bun.lock                  # Bun 锁文件
├── uv.lock                   # uv 锁文件
├── .jwxt_credentials.json    # 本地保存的凭据
└── docs/                     # 接口分析文档和本地抓包证据
```

当前实现：

- 项目已移除 Textual TUI，仅保留本地 Web UI。
- `jwxt/core.py` 提供教务系统核心请求与解析逻辑。
- `jwxt/web/server.py` 提供本地 HTTP API 和静态文件服务。
- Web UI 使用两栏布局：
  - 左侧：课程树 / 当前课表
  - 右侧：日志 / 活动

运行 Web UI：

```bash
uv run python main.py
```

打开：

```text
http://127.0.0.1:8765
```

前端开发模式：

```bash
uv run python main.py
bun run dev
```

打开：

```text
http://127.0.0.1:5173
```

`bun run dev` 会启用 Bun HMR，并将 `/api/*` 代理到 `http://127.0.0.1:8765`。

状态职责、上游请求边界和 SSE/普通请求分工见 `docs/state-and-events.md`。

构建前端静态资源：

```bash
bun run build
```
