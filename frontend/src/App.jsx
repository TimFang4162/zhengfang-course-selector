import { For, Show, createEffect, onCleanup, onMount } from "solid-js";
import { useAppContext } from "./app/app-context.jsx";
import { state } from "./app/state.js";
import { isSelectedClass } from "./app/state.js";
import { TreeView } from "./features/tree/TreeView.jsx";
import { TimetableView } from "./features/timetable/TimetableView.jsx";
import { AcademicStatusView, activeAcademicFilterCount } from "./features/academic/AcademicView.jsx";
import { academicFilterNatures, academicFilterTerms } from "./features/academic/filters.js";
import { GrabModal, GrabTaskModal } from "./features/grab/GrabView.jsx";
import { FloatingMenu } from "./components/FloatingMenu.jsx";
import { formatDebugJson } from "./shared/utils.js";

function LoginOverlay() {
  const app = useAppContext();

  return (
    <div id="login-overlay" classList={{ overlay: true, hidden: !state.auth.loginVisible }}>
      <div class="login-card surface">
        <div class="card-header login-header">
          <div>
            <div class="eyebrow">Local Console</div>
            <h1>JWXT Web UI</h1>
          </div>
          <div class="header-badge">Enterprise</div>
        </div>
        <div class="form-row address-row">
          <label for="base-url">教务地址</label>
          <div class="address-controls">
            <select id="base-url" value={state.auth.baseUrl} onChange={(event) => { state.auth.baseUrl = event.currentTarget.value; app.auth.syncCustomAddressInput(); }}>
              <For each={state.bootstrap?.addressChoices || []}>
                {(item) => <option value={item.url} selected={item.url === state.auth.baseUrl}>{item.url} ({item.description}{item.latencyMs ? `, ${item.latencyMs}ms` : ""})</option>}
              </For>
              <option value="__custom__" selected={state.auth.baseUrl === "__custom__"}>自定义地址...</option>
            </select>
            <button type="button" id="test-addresses" onClick={() => app.auth.testLoginAddresses().catch(app.showError)}>测速</button>
          </div>
          <input
            id="custom-base-url"
            classList={{ hidden: state.auth.baseUrl !== "__custom__" }}
            type="url"
            placeholder="https://jwxt.example.edu.cn"
            value={state.auth.customBaseUrl}
            onInput={(event) => { state.auth.customBaseUrl = event.currentTarget.value; }}
          />
        </div>
        <div class="form-row checkbox-row">
          <label><input type="checkbox" id="disable-ssl-verify" checked={state.auth.disableSslVerify} onChange={(event) => { state.auth.disableSslVerify = event.currentTarget.checked; app.auth.updateSslVerifySetting().catch(app.showError); }} /> 禁用 SSL 验证</label>
          <span class="dim">应用于登录、选课请求和测速</span>
        </div>
        <input type="checkbox" id="use-saved" class="hidden" checked={state.auth.useSaved} onChange={(event) => { state.auth.useSaved = event.currentTarget.checked; }} />
        <Show when={state.bootstrap?.savedCredentials?.available && state.bootstrap.savedCredentials} fallback={<div class="saved-login-panel"><span id="saved-hint" class="dim">无已保存凭据</span></div>} keyed>
          {(savedCredentials) => (
          <div id="saved-login-panel" class="saved-login-panel">
            <span id="saved-hint" class="dim">已保存账号 {savedCredentials.masked}</span>
            <button type="button" id="saved-login-button" onClick={() => app.auth.doLogin(true).catch(app.showError)}>以 {savedCredentials.masked} 登录</button>
          </div>
          )}
        </Show>
        <div class="form-row login-separator">
          <span>账号密码登录</span>
        </div>
        <div class="form-row">
          <label for="student-number">学号</label>
          <input id="student-number" type="text" autocomplete="username" value={state.auth.studentNumber} onInput={(event) => { state.auth.studentNumber = event.currentTarget.value; }} />
        </div>
        <div class="form-row">
          <label for="password">密码</label>
          <input id="password" type="password" autocomplete="current-password" value={state.auth.password} onInput={(event) => { state.auth.password = event.currentTarget.value; }} />
        </div>
        <div class="form-row checkbox-row">
          <label><input type="checkbox" id="save-creds" checked={state.auth.saveCredentials} onChange={(event) => { state.auth.saveCredentials = event.currentTarget.checked; }} /> 保存本次凭据</label>
        </div>
        <div class="form-actions">
          <button type="button" id="login-button" onClick={() => app.auth.doLogin().catch(app.showError)}>账号密码登录</button>
          <span id="login-status" class="dim">{state.auth.loginStatus}</span>
        </div>
      </div>
    </div>
  );
}

function WorkspaceTabs() {
  const app = useAppContext();
  const academicNodes = () => state.academicStatus?.nodes || [];

  function toggleMenu(menu) {
    state.openMenu = state.openMenu === menu ? null : menu;
  }

  function closeMenus() {
    state.openMenu = null;
  }

  onMount(() => {
    const closeOutside = (event) => {
      if (event.target.closest?.(".menu-root")) return;
      closeMenus();
    };
    document.addEventListener("click", closeOutside);
    onCleanup(() => document.removeEventListener("click", closeOutside));
  });

  function runRemoteSearch() {
    app.tree.applyLocalSearch();
    const categoryIds = state.search.scope === "all" ? state.categories.map((item) => item.id) : [state.search.scope];
    for (const categoryId of categoryIds) {
      if (!state.categoryCourses[categoryId]?.loaded) {
        state.expandedCategories.add(categoryId);
        app.tree.loadCategoryCourses(categoryId, 1).catch(app.showError);
      }
    }
  }

  return (
    <>
      <section id="tab-tree" classList={{ "tab-panel": true, "section-panel": true, active: state.activeTab === "tree" }}>
        <div class="toolbar toolbar-tight">
          <div class="tree-actions">
            <div class="menu-root">
              <button type="button" class="menu-button" id="display-menu-button" onClick={(event) => { event.stopPropagation(); toggleMenu("display-menu"); }}>显示</button>
              <div classList={{ "menu-popover": true, hidden: state.openMenu !== "display-menu" }} id="display-menu">
                <button type="button" data-action="toggle-conflict" onClick={() => { app.tree.runDisplayAction("toggle-conflict"); closeMenus(); }}>灰色显示冲突教学班:{state.filters.conflict ? "开" : "关"}</button>
                <button type="button" data-action="toggle-credit" onClick={() => { app.tree.runDisplayAction("toggle-credit"); closeMenus(); }}>隐藏超学分课程:{state.filters.credit ? "开" : "关"}</button>
              </div>
            </div>
            <div class="menu-root">
              <button type="button" class="menu-button" id="feature-menu-button" onClick={(event) => { event.stopPropagation(); toggleMenu("feature-menu"); }}>功能</button>
              <div classList={{ "menu-popover": true, hidden: state.openMenu !== "feature-menu" }} id="feature-menu">
                <button type="button" data-action="export-courses" onClick={() => { app.tree.runFeatureAction("export-courses"); closeMenus(); }}>导出所有课程</button>
              </div>
            </div>
          </div>
          <div class="tree-search">
            <input
              id="course-search"
              type="search"
              placeholder="搜索课程/教师/教学班"
              value={state.search.query}
              onInput={(event) => { state.search.query = event.currentTarget.value; }}
              onKeyDown={(event) => { if (event.key === "Enter") app.tree.applyLocalSearch(); }}
            />
            <select id="search-scope" aria-label="搜索范围" value={state.search.scope} onChange={(event) => { state.search.scope = event.currentTarget.value; app.tree.applyLocalSearch(); }}>
              <option value="all">全部大类</option>
              <For each={state.categories}>
                {(category) => <option value={category.id}>{category.name}</option>}
              </For>
            </select>
            <button type="button" id="local-search" onClick={app.tree.applyLocalSearch}>本地搜索</button>
            <button type="button" id="remote-search" onClick={runRemoteSearch}>远程搜索</button>
          </div>
        </div>
        <TreeView />
      </section>

      <section id="tab-timetable" classList={{ "tab-panel": true, "section-panel": true, active: state.activeTab === "timetable" }}>
        <TimetableView />
      </section>

      <section id="tab-academic" classList={{ "tab-panel": true, "section-panel": true, active: state.activeTab === "academic" }}>
        <div class="toolbar toolbar-tight academic-toolbar">
          <div class="menu-root">
                <button type="button" class="menu-button" id="academic-filter-button" onClick={(event) => { event.stopPropagation(); toggleMenu("academic-filter-menu"); }}>{activeAcademicFilterCount() > 0 ? `筛选(${activeAcademicFilterCount()})` : "筛选"}</button>
                <div classList={{ "menu-popover": true, hidden: state.openMenu !== "academic-filter-menu", "academic-filter-menu": true }} id="academic-filter-menu">
                  <div class="field-group">
                    <label for="academic-filter-term">建议修读时间</label>
                    <select id="academic-filter-term" value={state.academicFilters.suggestedTerm} onChange={(event) => { state.academicFilters.suggestedTerm = event.currentTarget.value; app.academic.renderAcademicStatus(); }}>
                      <option value="all">全部时间</option>
                      <For each={academicFilterTerms(academicNodes())}>{(term) => <option value={term}>{term}</option>}</For>
                    </select>
                  </div>
                  <div class="field-group">
                    <label for="academic-filter-status">修读状态</label>
                    <select id="academic-filter-status" value={state.academicFilters.statusType} onChange={(event) => { state.academicFilters.statusType = event.currentTarget.value; app.academic.renderAcademicStatus(); }}>
                  <option value="all">全部状态</option>
                  <option value="studying">在修</option>
                  <option value="passed">已修</option>
                  <option value="failed">未过</option>
                  <option value="not_started">未修</option>
                  <option value="substituted">课程替代</option>
                  <option value="warning_ignored">预警不审核</option>
                  <option value="unknown">未知</option>
                </select>
              </div>
                  <div class="field-group">
                    <label for="academic-filter-nature">课程性质</label>
                    <select id="academic-filter-nature" value={state.academicFilters.courseNature} onChange={(event) => { state.academicFilters.courseNature = event.currentTarget.value; app.academic.renderAcademicStatus(); }}>
                      <option value="all">全部性质</option>
                      <For each={academicFilterNatures(academicNodes())}>{(nature) => <option value={nature}>{nature}</option>}</For>
                    </select>
                  </div>
                  <div class="field-group">
                    <label for="academic-filter-node-status">节点状态</label>
                    <select id="academic-filter-node-status" value={state.academicFilters.nodeStatus} onChange={(event) => { state.academicFilters.nodeStatus = event.currentTarget.value; app.academic.renderAcademicStatus(); }}>
                  <option value="all">全部节点状态</option>
                  <option value="not_full">学分未满</option>
                  <option value="node_failed">节点未过</option>
                  <option value="full">学分已满</option>
                  <option value="overflow">学分超出</option>
                  <option value="unknown">未知</option>
                </select>
                  </div>
                  <div class="academic-filter-actions">
                    <button type="button" id="academic-filter-reset" onClick={() => {
                      state.academicFilters.suggestedTerm = "all";
                      state.academicFilters.statusType = "all";
                      state.academicFilters.courseNature = "all";
                      state.academicFilters.nodeStatus = "all";
                      app.academic.renderAcademicStatus();
                    }}>重置</button>
                  </div>
            </div>
          </div>
          <div class="menu-root">
                <button type="button" class="menu-button" id="academic-more-button" onClick={(event) => { event.stopPropagation(); toggleMenu("academic-more-menu"); }}>更多</button>
                <div classList={{ "menu-popover": true, hidden: state.openMenu !== "academic-more-menu" }} id="academic-more-menu">
                  <button type="button" id="academic-show-raw" onClick={() => { closeMenus(); app.academic.showAcademicRawPage(); }}>查看教务原始网页</button>
                  <button type="button" id="academic-show-detail-json" onClick={() => { closeMenus(); app.academic.showAcademicDetailJson(); }}>查看学业明细原始 JSON</button>
                  <button type="button" id="academic-export-json" onClick={() => { closeMenus(); app.academic.exportAcademicDataJson(); }}>导出当前学业数据 JSON</button>
                </div>
              </div>
              <button type="button" id="academic-refresh" onClick={() => app.academic.refreshAcademicStatus(true).catch(app.showError)}>刷新</button>
        </div>
            <AcademicStatusView />
      </section>
    </>
  );
}

function RightPane() {
  const app = useAppContext();
  let logListRef;

  createEffect(() => {
    state.logItems.length;
    if (logListRef) logListRef.scrollTop = logListRef.scrollHeight;
  });

  return (
    <aside class="right-pane">
      <div class="log-shell">
        <div class="log-header">
          <span class="log-title">LOG</span>
          <button type="button" id="clear-logs" onClick={() => app.logs.clearLogs().catch(app.showError)}>清空</button>
        </div>
        <div id="log-list" class="log-list" ref={logListRef}>
          <For each={state.logItems}>
            {(item) => (
              <button
                type="button"
                class={`log-line${item.type === "request" ? " is-request" : ""}${item.detail || item.type === "request" ? " is-clickable" : ""}${item.phase === "start" ? " is-pending" : ""}`}
                data-log-key={app.logs.logEntryKey(item)}
                onClick={() => app.logs.openLogDetail(app.logs.logEntryKey(item))}
              >
                <span class="log-time">[{item.timestamp}]</span>
                <span class="log-message">{app.logs.describeLogEntry(item)}</span>
              </button>
            )}
          </For>
        </div>
      </div>
      <div id="activity-splitter" class="splitter splitter-horizontal" aria-hidden="true"></div>
      <div class="activity-shell">
        <div class="log-header">
          <span class="log-title">ACTIVITY</span>
        </div>
        <div class="activity-panel">
          <table class="activity-table">
            <thead>
              <tr><th>任务</th><th>状态</th><th>进度</th></tr>
            </thead>
            <tbody id="activity-list">
              <For each={state.activities} fallback={<tr><td colspan="3" class="dim">暂无活动</td></tr>}>
                {(item) => (
                  <tr>
                    <td>{item.name}</td>
                    <td>{item.status}</td>
                    <td>{item.progress} <button type="button" class="activity-more" onClick={(event) => { event.stopPropagation(); app.grab.openActivityTaskMenu(item.id, event.currentTarget); }}>⋯</button></td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  );
}

function AppShell() {
  const app = useAppContext();

  function runAccountAction(event) {
    const action = event.currentTarget.value;
    event.currentTarget.value = "";
    if (action === "show-login") {
      app.auth.setLoginBaseUrl(state.auth.baseUrl);
      state.auth.loginVisible = true;
      return;
    }
    if (action === "refresh-categories") {
      app.tree.refreshCategories(true).catch(app.showError);
      return;
    }
    if (action === "refresh-timetable") {
      app.tree.refreshTimetable().catch(app.showError);
      return;
    }
    if (action === "refresh-academic") app.academic.refreshAcademicStatus(true).catch(app.showError);
  }

  return (
    <div class="app-shell">
      <div class="main-layout">
        <main class="left-pane">
          <div class="workspace-header">
            <div class="tabs compact-surface">
              <button type="button" classList={{ tab: true, active: state.activeTab === "tree" }} data-tab="tree" onClick={() => app.tree.switchTab("tree")}>课程树</button>
              <button type="button" classList={{ tab: true, active: state.activeTab === "timetable" }} data-tab="timetable" onClick={() => app.tree.switchTab("timetable")}>当前课表</button>
              <button type="button" classList={{ tab: true, active: state.activeTab === "academic" }} data-tab="academic" onClick={() => app.tree.switchTab("academic")}>学业情况</button>
            </div>
            <div class="workspace-controls">
              <select id="workspace-base-url" aria-label="教务地址" value={state.auth.baseUrl} onChange={(event) => { state.auth.baseUrl = event.currentTarget.value; if (state.bootstrap) state.bootstrap.baseUrl = event.currentTarget.value; }}>
                <For each={state.bootstrap?.addressChoices || []}>
                  {(item) => <option value={item.url} selected={item.url === state.auth.baseUrl}>{item.url} ({item.description}{item.latencyMs ? `, ${item.latencyMs}ms` : ""})</option>}
                </For>
              </select>
              <select id="account-action" aria-label="账号操作" onChange={runAccountAction}>
                <option value="">账号操作</option>
                <option value="show-login">切换账号</option>
                <option value="refresh-categories">刷新列表</option>
                <option value="refresh-timetable">刷新课表</option>
                <option value="refresh-academic">刷新学业情况</option>
              </select>
              <button type="button" id="toggle-sidebar" title="折叠侧栏" onClick={app.tree.toggleSidebar}>{state.sidebarCollapsed ? "⇥" : "⇤"}</button>
            </div>
          </div>

          <WorkspaceTabs />
        </main>

        <div id="main-splitter" class="splitter splitter-vertical" aria-hidden="true"></div>

        <RightPane />
      </div>
    </div>
  );
}

function ModalLayer() {
  const app = useAppContext();
  const classDebugPayload = () => {
    if (!state.modalClass) return null;
    if (state.modalClass.entry) return { source: "timetable", entry: state.modalClass.entry };
    return {
      source: "class-list",
      categoryId: state.modalClass.categoryId,
      course: state.modalClass.course,
      classItem: state.modalClass.item,
    };
  };
  const modalTitle = () => {
    if (state.modalClass?.entry) return `${state.modalClass.entry.name} / ${state.modalClass.entry.classNo || "-"}`;
    if (state.modalClass?.course && state.modalClass?.item) return `${state.modalClass.course.courseName} / ${state.modalClass.item.classNo}`;
    return "教学班详情";
  };
  const modalActionLabel = () => {
    if (state.modalClass?.entry) return "退课";
    if (state.modalClass?.item) return isSelectedClass(state.modalClass.item) ? "退课" : "选课";
    return "操作";
  };
  const logDetailEntry = () => state.logDetailKey ? state.logEntries.get(state.logDetailKey) : null;
  const logDetailTitle = () => {
    const entry = logDetailEntry();
    if (!entry) return "日志详情";
    return entry.type === "request" ? `${entry.method || "HTTP"} ${entry.path || ""}` : `日志 #${entry.id}`;
  };

  return (
    <>
      <div id="class-modal" classList={{ modal: true, hidden: !state.modalClass }}>
        <div class="modal-card surface">
          <div class="modal-header">
            <div>
              <div class="eyebrow">Class Detail</div>
              <strong id="modal-title">{modalTitle()}</strong>
            </div>
            <button type="button" id="modal-close" onClick={app.timetable.closeClassModal}>关闭</button>
          </div>
          <div id="modal-content" class="modal-content">
            <Show when={state.modalClass?.entry} keyed>
              {(entry) => (
                <>
                  <div class="class-meta"><div>课程</div><div>{entry.name}</div></div>
                  <div class="class-meta"><div>课程号</div><div>{entry.kchId || "-"}</div></div>
                  <div class="class-meta"><div>教学班</div><div>{entry.classNo || "-"}</div></div>
                  <div class="class-meta"><div>学分</div><div>{entry.creditText || "-"}</div></div>
                  <div class="class-meta"><div>上课教师</div><div>{entry.teacherName || ""} <span class="dim">{entry.teacherTitle || ""}</span></div></div>
                  <div class="class-meta"><div>上课时间</div><div>{entry.sksj || "-"}</div></div>
                  <div class="class-meta"><div>教学地点</div><div>{entry.location || "-"}</div></div>
                </>
              )}
            </Show>
            <Show when={state.modalClass?.item} keyed>
              {(item) => (
                <>
                  <div class="class-meta"><div>教学班</div><div>{item.classNo}</div></div>
                  <div class="class-meta"><div>课程号</div><div>{item.kchId || state.modalClass?.course?.kchId || "-"}</div></div>
                  <div class="class-meta"><div>上课教师</div><div>{item.teacherName || ""} <span class="dim">{item.teacherTitle || ""}</span></div></div>
                  <div class="class-meta"><div>上课时间</div><div>{item.sksj || ""}</div></div>
                  <div class="class-meta"><div>教学地点</div><div>{item.location || ""}</div></div>
                  <div class="class-meta"><div>开课学院</div><div>{item.academy || "-"}</div></div>
                  <div class="class-meta"><div>选课备注</div><div>{item.remark || "-"}</div></div>
                  <div class="class-meta"><div>课程性质</div><div>{item.courseProperty || "-"}</div></div>
                  <div class="class-meta"><div>已选/容量</div><div>{item.selectedCount}/{item.capacity}</div></div>
                </>
              )}
            </Show>
            <Show when={classDebugPayload()} keyed>
              {(payload) => (
                <>
                  <details class="debug-details">
                    <summary>抢课 / 选课关键字段</summary>
                    <div class="debug-grid">
                      <div>来源</div><div>{payload.source}</div>
                      <div>categoryId</div><div>{payload.categoryId ?? "-"}</div>
                      <div>course.kchId</div><div>{payload.course?.kchId || payload.entry?.kchId || "-"}</div>
                      <div>classNo</div><div>{payload.classItem?.classNo || payload.entry?.classNo || "-"}</div>
                      <div>容量</div><div>{payload.classItem ? `${payload.classItem.selectedCount}/${payload.classItem.capacity}` : "-"}</div>
                    </div>
                  </details>
                  <details class="debug-details">
                    <summary>时间 slots</summary>
                    <pre class="debug-pre">{formatDebugJson(payload.classItem?.slots || payload.entry?.slots || [])}</pre>
                  </details>
                  <details class="debug-details">
                    <summary>原始详情 JSON</summary>
                    <pre class="debug-pre">{formatDebugJson(payload)}</pre>
                  </details>
                </>
              )}
            </Show>
          </div>
          <div class="modal-actions">
            <button type="button" id="modal-action" onClick={() => app.timetable.executeModalAction().catch(app.showError)}>{modalActionLabel()}</button>
          </div>
        </div>
      </div>

      <GrabModal />
      <GrabTaskModal />

      <div id="speed-modal" classList={{ modal: true, hidden: !state.speedModalVisible }}>
        <div class="modal-card surface">
          <div class="modal-header">
            <div>
              <div class="eyebrow">Connectivity</div>
              <strong>教务地址测速</strong>
            </div>
            <button type="button" id="speed-close" onClick={app.auth.closeSpeedModal}>关闭</button>
          </div>
          <div id="speed-content" class="modal-content speed-content">
            <table class="speed-table">
              <thead><tr><th>地址</th><th>状态</th><th>耗时</th><th>说明</th></tr></thead>
              <tbody>
                <For each={state.speedRows}>
                  {(row) => (
                    <tr class={row.statusClass}>
                      <td><button type="button" class="link-button" onClick={() => { app.auth.setLoginBaseUrl(row.url); app.auth.closeSpeedModal(); }}>{row.url}</button><div class="dim">{row.label}</div></td>
                      <td>{row.status}</td>
                      <td>{row.ms}</td>
                      <td>{row.message}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="log-detail-modal" classList={{ modal: true, hidden: !state.logDetailKey }}>
        <div class="modal-card surface">
          <div class="modal-header">
            <div>
              <div class="eyebrow">Request Detail</div>
              <strong id="log-detail-title">{logDetailTitle()}</strong>
            </div>
            <button type="button" id="log-detail-close" onClick={app.logs.closeLogDetail}>关闭</button>
          </div>
          <div id="log-detail-content" class="modal-content">
            <Show when={logDetailEntry()} keyed>
              {(entry) => (
                <Show
                  when={entry.type === "request"}
                  fallback={(
                    <>
                      <div class="class-meta"><div>时间</div><div>{entry.timestamp}</div></div>
                      <div class="class-meta"><div>消息</div><div><pre class="log-detail-pre">{app.logs.formatLogDetailBlock(entry.message || "")}</pre></div></div>
                    </>
                  )}
                >
                  <div class="class-meta"><div>时间</div><div>{entry.timestamp}</div></div>
                  <div class="class-meta"><div>状态</div><div>{String(entry.status ?? "ERROR")}</div></div>
                  <div class="class-meta"><div>耗时</div><div>{String(entry.ms ?? 0)}ms</div></div>
                  <div class="class-meta"><div>URL</div><div>{entry.detail?.url || ""}</div></div>
                  <div class="class-meta"><div>请求头</div><div><pre class="log-detail-pre">{app.logs.formatLogDetailBlock(entry.detail?.requestHeaders || {})}</pre></div></div>
                  <div class="class-meta"><div>请求体</div><div><pre class="log-detail-pre">{app.logs.formatLogDetailBlock(entry.detail?.requestBody || "")}</pre></div></div>
                  <div class="class-meta"><div>响应头</div><div><pre class="log-detail-pre">{app.logs.formatLogDetailBlock(entry.detail?.responseHeaders || {})}</pre></div></div>
                  <div class="class-meta"><div>响应体</div><div><pre class="log-detail-pre">{app.logs.formatLogDetailBlock(entry.detail?.responseBody || entry.detail?.error || "")}</pre></div></div>
                </Show>
              )}
            </Show>
          </div>
        </div>
      </div>

      <div id="academic-raw-modal" classList={{ modal: true, hidden: !state.rawModalVisible }}>
        <div class="modal-card surface grab-card">
          <div class="modal-header">
            <div>
              <div class="eyebrow">Academic Raw Page</div>
              <strong id="academic-raw-title">{state.rawModalTitle}</strong>
            </div>
            <button type="button" id="academic-raw-close" onClick={app.academic.closeAcademicRawModal}>关闭</button>
          </div>
          <div class="raw-tabs">
            <Show when={state.rawPreviewVisible}>
              <button type="button" classList={{ "raw-tab": true, active: state.rawTab === "preview" }} data-raw-tab="preview" onClick={() => app.academic.switchAcademicRawTab("preview")}>渲染</button>
            </Show>
            <button type="button" classList={{ "raw-tab": true, active: state.rawTab === "source" }} data-raw-tab="source" onClick={() => app.academic.switchAcademicRawTab("source")}>原始内容</button>
          </div>
          <div class="modal-content academic-raw-body">
            <iframe id="academic-raw-preview" classList={{ "academic-raw-pane": true, active: true, "academic-raw-frame": true, hidden: state.rawTab !== "preview" }} title="教务原始网页渲染预览" srcdoc={state.rawPreviewSrcdoc}></iframe>
            <div id="academic-raw-content" classList={{ "academic-raw-pane": true, hidden: state.rawTab !== "source", "academic-raw-editor": true }}></div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <>
      <LoginOverlay />
      <AppShell />
      <ModalLayer />
      <FloatingMenu />
    </>
  );
}
