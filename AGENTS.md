# AGENTS.md

## Tooling
- Use `uv` for Python commands; do not call system Python directly.
- Use `bun` for frontend commands and dependency changes.
- Python requires `>=3.14`; frontend dependencies are locked by `bun.lock`.

## App Shape
- This repo is Web UI only; the old Textual TUI was removed.
- Python API/server entrypoint: `main.py` -> `jwxt.web.server.main()`.
- Stateful JWXT session and cookies live in process memory in `jwxt/core.py` via a global `requests.Session`; service restarts require re-login.
- `jwxt/web/service.py` owns Web API business state; `jwxt/web/grab.py` is the grab-task/expression mixin; `jwxt/web/server.py` is only HTTP routing/static serving.
- Frontend source is in `frontend/`; `jwxt/web/static/` is generated Bun output served by Python.

## Commands
- Run production/local app: `uv run python main.py`, then open `http://127.0.0.1:8765`.
- Frontend dev with HMR: start `uv run python main.py` first, then `bun run dev`; Bun serves `http://127.0.0.1:5173` and proxies `/api/*` to `http://127.0.0.1:8765`.
- Build frontend static assets: `bun run build`.
- Frontend build check without touching served static assets: `bun run check`.
- Python syntax check: `uv run python -m py_compile "main.py" "jwxt/core.py" "jwxt/web/grab.py" "jwxt/web/service.py" "jwxt/web/server.py"`.

## Frontend Notes
- Do not edit `jwxt/web/static/chunk-*` directly; edit `frontend/src/*` and run `bun run build`.
- `frontend/build.ts` deletes the output directory before building to avoid stale chunks.
- Monaco is bundled from local `monaco-editor`; do not reintroduce CDN `vs/loader` or `window.require`.
- `solid-js` is installed, but current UI is still mostly imperative DOM code; `frontend/src/solid-entry.js` is only a non-JSX migration seam.

## Local State / Secrets
- `.jwxt_credentials.json` contains local login credentials and must never be committed.
- HAR files and caches are ignored; `docs/` may contain local capture evidence, but `*.har` stays ignored.
- `node_modules/`, `.venv/`, `__pycache__/`, `.ruff_cache/`, and `.DS_Store` are ignored.

## Gotchas
- Port `8765` is often already occupied by an old Python server; use a temporary-port smoke test or stop the old process before claiming the app is broken.
- `bun run dev` depends on the Python API server for `/api/*`; frontend loading alone does not prove API routes work.
- `jwxt/core.py` defaults `sess.verify = False`; the Web UI SSL checkbox updates this session setting and address testing uses the same choice.
