# JWXT

当前目录结构：

```text
jwxt/
├── 1.py                      # 旧参考脚本
├── 2.py                      # 当前 Textual TUI 主程序
├── main.py                   # Web UI 默认入口
├── webui_server.py           # 本地 Web UI HTTP 服务
├── webui/
│   ├── index.html            # Web UI 页面
│   ├── styles.css            # Web UI 样式
│   └── app.js                # Web UI 前端逻辑
├── pyproject.toml            # Python 依赖
├── uv.lock                   # uv 锁文件
├── .jwxt_credentials.json    # 本地保存的凭据
├── 选课流程与API分析.md       # HAR/接口分析文档
└── www.google.com_*.har      # 抓包证据文件
```

当前实现：

- `2.py` 仍然是可用的 TUI 版本。
- `webui_server.py` + `webui/` 是新加的本地 Web UI。
- Web UI 保持和 TUI 一致的两栏布局：
  - 左侧：课程树 / 当前课表
  - 右侧：日志

运行 Web UI：

```bash
uv run python main.py
```

打开：

```text
http://127.0.0.1:8765
```
