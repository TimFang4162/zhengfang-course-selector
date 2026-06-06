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

function filterValue(item) {
  return item && typeof item === "object" ? item.value : item;
}

function filterLabel(item) {
  if (item && typeof item === "object") return item.label || item.value;
  return item;
}

function LoginOverlay() {
  const app = useAppContext();
  const savedAvailable = () => Boolean(state.bootstrap?.savedCredentials?.available);
  const activeTab = () => {
    const tab = state.auth.loginTab;
    if (tab === "saved" && savedAvailable()) return "saved";
    if (tab === "password") return "password";
    if (tab === "cookie") return "cookie";
    return savedAvailable() ? "saved" : "password";
  };

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
          <select id="base-url" value={state.auth.baseUrl} onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "__test__") {
              event.currentTarget.value = state.auth.baseUrl;
              app.auth.testLoginAddresses().catch(app.showError);
              return;
            }
            state.auth.baseUrl = value;
          }}>
            <For each={state.bootstrap?.addressChoices || []}>
              {(item) => <option value={item.url} selected={item.url === state.auth.baseUrl}>{item.url} ({item.description}{item.latencyMs ? `, ${item.latencyMs}ms` : ""})</option>}
            </For>
            <option value="__test__">测速</option>
            <option value="__custom__" selected={state.auth.baseUrl === "__custom__"}>{state.auth.customBaseUrl || "自定义地址"}</option>
          </select>
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
        <div class="login-tabs">
          <button type="button" classList={{ "login-tab": true, active: activeTab() === "saved" }} disabled={!savedAvailable()} onClick={() => { state.auth.loginTab = "saved"; }}>一键登录</button>
          <button type="button" classList={{ "login-tab": true, active: activeTab() === "password" }} onClick={() => { state.auth.loginTab = "password"; }}>账号密码</button>
          <button type="button" classList={{ "login-tab": true, active: activeTab() === "cookie" }} onClick={() => { state.auth.loginTab = "cookie"; }}>Cookie</button>
        </div>

        <Show when={activeTab() === "saved"}>
          <div class="login-tab-panel">
            <Show when={savedAvailable() && state.bootstrap?.savedCredentials} keyed>
              {(savedCredentials) => (
                <div class="saved-login-panel">
                  <span class="dim">已保存账号 {savedCredentials.masked}</span>
                  <button type="button" id="saved-login-button" onClick={() => app.auth.doLogin(true).catch(app.showError)}>以 {savedCredentials.masked} 登录</button>
                </div>
              )}
            </Show>
          </div>
        </Show>

        <Show when={activeTab() === "password"}>
          <div class="login-tab-panel">
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
        </Show>

        <Show when={activeTab() === "cookie"}>
          <div class="login-tab-panel">
            <div class="form-row">
              <label for="cookie-input">Cookie</label>
              <textarea
                id="cookie-input"
                placeholder={`从浏览器 DevTools → Application → Cookies 复制，或粘贴 document.cookie 的值，或直接粘贴请求头里的 Cookie 行。\n支持格式：name=value; name2=value2，或多行 name=value，或带 Cookie: 前缀。\n同名 cookie（如双 JSESSIONID）会按 path=/jwglxt 和 path=/ 自动拆分注入。`}
                value={state.auth.cookieInput}
                onInput={(event) => { state.auth.cookieInput = event.currentTarget.value; }}
                spellcheck={false}
              />
            </div>
            <div class="cookie-hint dim">提示：教务系统的 JSESSIONID 是必需的；WebVPN 地址还需 wpsvn 系列 cookie。同名 cookie 会自动按 path 区分。Cookie 仅保存在本进程内存中。</div>
            <div class="form-actions">
              <button type="button" id="cookie-login-button" onClick={() => app.auth.doLoginWithCookie().catch(app.showError)}>Cookie 登录</button>
              <span id="login-status" class="dim">{state.auth.loginStatus}</span>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

function WorkspaceTabs() {
  const app = useAppContext();
  const academicNodes = () => state.academicStatus?.nodes || [];
  const activeCourseTab = () => app.tree.activeCourseTab();
  const activeSearchTab = () => activeCourseTab()?.type === "query" ? activeCourseTab() : null;

  function toggleMenu(menu) {
    state.openMenu = state.openMenu === menu ? null : menu;
  }

  function closeMenus() {
    state.openMenu = null;
  }

  onMount(() => {
    const closeOutside = (event) => {
      if (event.target.closest?.(".menu-root")) return;
      if (event.target.closest?.(".multi-select-dropdown")) return;
      closeMenus();
      state.openDropdown = null;
    };
    document.addEventListener("click", closeOutside);
    onCleanup(() => document.removeEventListener("click", closeOutside));
  });

  function runRemoteSearch() {
    const tab = activeSearchTab();
    if (!tab) return;
    app.tree.runSearchTab(tab, true).catch(app.showError);
  }

  function applyResultFilter(value) {
    const tab = activeSearchTab();
    if (!tab) return;
    tab.localFilter = value;
    app.tree.saveTabsState();
    app.tree.applyLocalSearch();
  }

  function setFilterList(field, value) {
    const tab = activeSearchTab();
    if (!tab) return;
    tab.draftFilters[field] = value.split(/[ ,，]+/).map((item) => item.trim()).filter(Boolean);
    app.tree.saveTabsState();
  }

  function filterText(field) {
    return (activeSearchTab()?.draftFilters[field] || []).map(filterValue).join(",");
  }

  function optionKey(type, parent = {}, query = "") {
    return `${type}${parent.collegeId ? `:${parent.collegeId}` : ""}${query ? `:${query}` : ""}`;
  }

  function selectedLabels(field) {
    const values = activeSearchTab()?.draftFilters[field] || [];
    if (!values.length) return "全部";
    return values.map(filterLabel).join(", ");
  }

  function selectedSummary(field) {
    const values = activeSearchTab()?.draftFilters[field] || [];
    if (!values.length) return "全部";
    if (values.length === 1) return filterLabel(values[0]);
    return `${values.length} 项`;
  }

  function openFilterPicker(config) {
    const tab = activeSearchTab();
    if (!tab) return;
    const parent = config.type === "major" ? { collegeId: filterText("collegeIds") } : {};
    state.filterPicker = {
      ...config,
      parent,
      query: "",
      page: 1,
      selected: [...(tab.draftFilters[config.field] || [])],
    };
    app.tree.loadFilterOptions(config.type, parent, 1, "").catch(app.showError);
  }

  function emptySearchFilters() {
    return {
      keyword: "",
      collegeIds: [],
      majorIds: [],
      teachingCollegeIds: [],
      gradeIds: [],
      courseCategoryIds: [],
      courseNatureIds: [],
      courseOwnershipIds: [],
      teachingModeIds: [],
      weekdayIds: [],
      periodIds: [],
      credits: [],
      classNames: [],
      recommended: [],
      hasCapacity: [],
      timeConflict: [],
      retake: [],
    };
  }

  function defaultFiltersForTab(tab) {
    const filters = emptySearchFilters();
    if (tab?.id === "default") {
      const majorId = state.categories.find((category) => category.zyhId)?.zyhId;
      if (majorId) filters.majorIds = [{ value: majorId, label: `专业 ${majorId}` }];
    }
    return filters;
  }

  function queryConditionCount() {
    const tab = activeSearchTab();
    if (!tab?.draftFilters) return 0;
    let count = tab.query?.trim() ? 1 : 0;
    for (const [field, value] of Object.entries(tab.draftFilters)) {
      if (field === "keyword") continue;
      if (Array.isArray(value) && value.length) count += 1;
    }
    return count;
  }

  function normalizedFilterItems(items) {
    return [...(items || [])]
      .map((item) => String(filterValue(item)).trim())
      .filter(Boolean)
      .sort();
  }

  function hasPendingQueryChanges() {
    const tab = activeSearchTab();
    if (!tab?.draftFilters || !tab?.appliedFilters) return false;
    if ((tab.query || "").trim() !== (tab.appliedFilters.keyword || "").trim()) return true;
    for (const field of Object.keys(emptySearchFilters())) {
      if (field === "keyword") continue;
      const draft = normalizedFilterItems(tab.draftFilters[field]);
      const applied = normalizedFilterItems(tab.appliedFilters[field]);
      if (draft.length !== applied.length) return true;
      if (draft.some((value, index) => value !== applied[index])) return true;
    }
    return false;
  }

  function treeSelectionText() {
    const stats = app.tree.selectionStats();
    return stats.total ? `规则 ${stats.total} 项` : "未选择";
  }

  function hasTreeSelection() {
    return app.tree.selectionStats().total > 0;
  }

  function resetQueryConditions() {
    const tab = activeSearchTab();
    if (!tab) return;
    tab.query = "";
    tab.draftFilters = defaultFiltersForTab(tab);
    tab.appliedFilters = defaultFiltersForTab(tab);
    tab.scope = "all";
    tab.appliedScope = "all";
    tab.results = {};
    tab.expandedCategories.clear();
    tab.expandedCourses.clear();
    tab.title = tab.id === "default" ? "默认查询" : "查询";
    app.tree.saveTabsState();
    app.tree.renderTree();
  }

  function FilterButton(props) {
    return (
      <button type="button" class="filter-picker-button query-filter-button" onClick={props.onClick} title={selectedLabels(props.field)}>
        <span>{props.label}</span>
        <strong>{selectedSummary(props.field)}</strong>
      </button>
    );
  }

  const dropdownTypeMap = {
    courseCategoryIds: "courseCategory",
    courseNatureIds: "courseNature",
    courseOwnershipIds: "courseOwnership",
    teachingModeIds: "teachingMode",
    weekdayIds: "weekday",
    periodIds: "period",
  };

  function toggleDropdown(field) {
    if (state.openDropdown === field) {
      state.openDropdown = null;
      return;
    }
    state.openDropdown = field;
    const type = dropdownTypeMap[field];
    if (type && !state.filterOptions[type]?.loaded) app.tree.loadFilterOptions(type, {}, 1, "").catch(app.showError);
  }

  function MultiSelectDropdown(props) {
    const isOpen = () => state.openDropdown === props.field;
    const options = () => props.staticOptions || state.filterOptions[dropdownTypeMap[props.field]]?.items || [];
    const selected = () => activeSearchTab()?.draftFilters[props.field] || [];

    function isSelected(item) {
      return selected().some((s) => filterValue(s) === item.value);
    }

    function toggleItem(item) {
      const t = activeSearchTab();
      if (!t) return;
      const current = [...selected()];
      const idx = current.findIndex((s) => filterValue(s) === item.value);
      if (idx >= 0) current.splice(idx, 1);
      else current.push({ value: item.value, label: item.displayLabel || item.label });
      t.draftFilters[props.field] = current;
      app.tree.saveTabsState();
      app.tree.renderTree();
    }

    return (
      <div class="multi-select-dropdown">
        <button type="button" class="query-filter-button" onClick={() => toggleDropdown(props.field)}>
          <span>{props.label}</span>
          <strong>{selectedSummary(props.field)}</strong>
        </button>
        <Show when={isOpen()}>
          <div class="multi-select-menu">
            <For each={options()}>
              {(item) => (
                <label class="multi-select-option">
                  <input type="checkbox" checked={isSelected(item)} onChange={() => toggleItem(item)} />
                  <span>{item.displayLabel || item.label}</span>
                </label>
              )}
            </For>
          </div>
        </Show>
      </div>
    );
  }

  return (
    <>
      <section id="tab-tree" classList={{ "tab-panel": true, "section-panel": true, active: state.activeTab === "tree" }}>
        <div class="course-tab-strip">
          <For each={state.courseTabs}>
            {(tab) => (
              <span classList={{ "course-tab-shell": true, active: state.activeCourseTabId === tab.id }}>
                <button type="button" class="course-tab" onClick={() => app.tree.activateCourseTab(tab.id)}>{tab.title}</button>
                <button type="button" class="course-tab-close" aria-label={`关闭${tab.title}`} onClick={() => app.tree.closeCourseTab(tab.id)}>×</button>
              </span>
            )}
          </For>
          <button type="button" class="course-tab-new" onClick={app.tree.createSearchTab}>+ 新查询</button>
        </div>
        <Show when={activeSearchTab()?.queryPanelOpen}>
          <div class="course-query-panel">
            <div class="course-query-main">
              <input
                id="course-query-keyword"
                type="search"
                placeholder="课程号/课程名称/教学班名称/教师姓名/教师工号..."
                value={activeSearchTab()?.query || ""}
                onInput={(event) => { activeSearchTab().query = event.currentTarget.value; app.tree.saveTabsState(); }}
                onKeyDown={(event) => { if (event.key === "Enter") runRemoteSearch(); }}
              />
              <button type="button" id="remote-search" classList={{ "is-dirty": hasPendingQueryChanges() }} onClick={runRemoteSearch}>查询</button>
              <button type="button" id="reset-query" onClick={resetQueryConditions}>{activeSearchTab()?.id === "default" ? "恢复默认" : "重置条件"}</button>
            </div>
            <div class="course-query-grid">
              <FilterButton label="学院" field="collegeIds" onClick={() => openFilterPicker({ type: "college", field: "collegeIds", title: "学院" })} />
              <FilterButton label="专业" field="majorIds" onClick={() => openFilterPicker({ type: "major", field: "majorIds", title: "专业" })} />
              <label class="query-filter-field"><span>年级</span><input type="text" value={filterText("gradeIds")} placeholder="全部" onInput={(event) => setFilterList("gradeIds", event.currentTarget.value)} /></label>
              <FilterButton label="开课学院" field="teachingCollegeIds" onClick={() => openFilterPicker({ type: "teachingCollege", field: "teachingCollegeIds", title: "开课学院" })} />
              <MultiSelectDropdown label="课程类别" field="courseCategoryIds" />
              <MultiSelectDropdown label="课程性质" field="courseNatureIds" />
              <MultiSelectDropdown label="课程归属" field="courseOwnershipIds" />
              <MultiSelectDropdown label="教学模式" field="teachingModeIds" />
              <MultiSelectDropdown label="上课星期" field="weekdayIds" />
              <MultiSelectDropdown label="上课节次" field="periodIds" />
              <label class="query-filter-field"><span>教学班</span><input type="text" value={filterText("classNames")} placeholder="全部" onInput={(event) => setFilterList("classNames", event.currentTarget.value)} /></label>
              <label class="query-filter-field"><span>学分</span><input type="text" value={filterText("credits")} placeholder="全部" onInput={(event) => setFilterList("credits", event.currentTarget.value)} /></label>
              <MultiSelectDropdown label="是否重修" field="retake" staticOptions={[{ value: "1", label: "是" }, { value: "0", label: "否" }]} />
              <MultiSelectDropdown label="有无余量" field="hasCapacity" staticOptions={[{ value: "1", label: "有" }, { value: "0", label: "无" }]} />
            </div>
          </div>
        </Show>
        <div class="toolbar toolbar-tight tree-result-toolbar">
          <div class="tree-actions">
            <div class="menu-root">
              <button type="button" class="menu-button" id="display-menu-button" onClick={(event) => { event.stopPropagation(); toggleMenu("display-menu"); }}>显示</button>
              <div classList={{ "menu-popover": true, hidden: state.openMenu !== "display-menu" }} id="display-menu">
                <button type="button" data-action="toggle-conflict" onClick={() => { app.tree.runDisplayAction("toggle-conflict"); closeMenus(); }}>淡化时间冲突教学班:{state.filters.conflict ? "开" : "关"}</button>
                <button type="button" data-action="toggle-no-capacity" onClick={() => { app.tree.runDisplayAction("toggle-no-capacity"); closeMenus(); }}>淡化无余量教学班:{state.filters.noCapacity ? "开" : "关"}</button>
                <button type="button" data-action="toggle-highlight-capacity" onClick={() => { app.tree.runDisplayAction("toggle-highlight-capacity"); closeMenus(); }}>突出有余量教学班:{state.filters.highlightCapacity ? "开" : "关"}</button>
                <button type="button" data-action="toggle-credit" onClick={() => { app.tree.runDisplayAction("toggle-credit"); closeMenus(); }}>淡化超学分课程:{state.filters.credit ? "开" : "关"}</button>
                <button type="button" data-action="toggle-completed" onClick={() => { app.tree.runDisplayAction("toggle-completed"); closeMenus(); }}>淡化已修读课程:{state.filters.completed ? "开" : "关"}</button>
              </div>
            </div>
            <div class="menu-root">
              <button type="button" class="menu-button" id="feature-menu-button" onClick={(event) => { event.stopPropagation(); toggleMenu("feature-menu"); }}>功能</button>
              <div classList={{ "menu-popover": true, hidden: state.openMenu !== "feature-menu" }} id="feature-menu">
                <button type="button" data-action="refresh-categories" onClick={() => { app.tree.runFeatureAction("refresh-categories"); closeMenus(); }}>刷新列表</button>
                <button type="button" data-action="export-courses" onClick={() => { app.tree.runFeatureAction("export-courses"); closeMenus(); }}>导出所有课程</button>
              </div>
            </div>
            <button type="button" class="menu-button query-toggle-button" onClick={() => { activeSearchTab().queryPanelOpen = !activeSearchTab().queryPanelOpen; app.tree.saveTabsState(); app.tree.renderTree(); }}>
              查询({queryConditionCount()})
            </button>
            <button type="button" class="menu-button tree-selection-button" disabled={!hasTreeSelection()} onClick={() => app.grab.openGrabModalFromSelection()}>
              添加抢课任务
            </button>
            <button type="button" class="menu-button tree-selection-button" disabled={!hasTreeSelection()} onClick={() => app.tree.clearTreeSelection()}>
              清空选择
            </button>
            <span class="tree-selection-status">{treeSelectionText()}</span>
          </div>
          <div class="tree-result-filter">
            <input
              id="course-result-filter"
              type="search"
              placeholder="筛选"
              value={activeSearchTab()?.localFilter || ""}
              onInput={(event) => applyResultFilter(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Escape") applyResultFilter(""); }}
            />
            <button type="button" aria-label="清除筛选" disabled={!activeSearchTab()?.localFilter} onClick={() => applyResultFilter("")}>×</button>
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
                <button type="button" class="menu-button" id="academic-more-button" onClick={(event) => { event.stopPropagation(); toggleMenu("academic-more-menu"); }}>功能</button>
                <div classList={{ "menu-popover": true, hidden: state.openMenu !== "academic-more-menu" }} id="academic-more-menu">
                  <button type="button" id="academic-refresh" onClick={() => { closeMenus(); app.academic.refreshAcademicStatus(true).catch(app.showError); }}>刷新学业情况</button>
                  <button type="button" id="academic-show-raw" onClick={() => { closeMenus(); app.academic.showAcademicRawPage(); }}>查看教务原始网页</button>
                  <button type="button" id="academic-show-detail-json" onClick={() => { closeMenus(); app.academic.showAcademicDetailJson(); }}>查看学业明细原始 JSON</button>
                  <button type="button" id="academic-export-json" onClick={() => { closeMenus(); app.academic.exportAcademicDataJson(); }}>导出当前学业数据 JSON</button>
                </div>
              </div>
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
    app.logs.visibleLogItems().length;
    if (logListRef) logListRef.scrollTop = logListRef.scrollHeight;
  });

  return (
    <aside class="right-pane">
      <div class="log-shell">
        <div class="log-header">
          <span class="log-title">LOG</span>
          <div class="log-actions">
            <select id="log-filter-type" aria-label="日志类型" value={state.logFilterType} onChange={(event) => { state.logFilterType = event.currentTarget.value; }}>
              <option value="all">全部</option>
              <option value="request">请求</option>
              <option value="business">业务</option>
              <option value="debug">调试</option>
              <option value="system">系统</option>
            </select>
            <button type="button" id="clear-logs" onClick={() => app.logs.clearLogs().catch(app.showError)}>清空</button>
          </div>
        </div>
        <div id="log-list" class="log-list" ref={logListRef}>
          <For each={app.logs.visibleLogItems()}>
            {(item, index) => (
              <button
                type="button"
                class={`log-line is-${item.type || "business"} level-${item.level || "info"} is-clickable${item.phase === "start" ? " is-pending" : ""}`}
                data-log-key={app.logs.logEntryKey(item)}
                onClick={() => app.logs.openLogDetail(app.logs.logEntryKey(item))}
              >
                <span class="log-time">{app.logs.logTimestampText(item, index())}</span>
                <span class="log-type">{app.logs.logTypeLabel(item.type)}</span>
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
          <div class="log-actions">
            <button type="button" id="activity-add" onClick={(event) => { event.stopPropagation(); app.grab.openActivityAddMenu(event.currentTarget); }}>+</button>
          </div>
        </div>
        <div class="activity-panel">
          <table class="activity-table">
            <thead>
              <tr><th>任务</th><th>状态</th><th>进度</th></tr>
            </thead>
            <tbody id="activity-list">
              <For each={state.activities} fallback={<tr><td colspan="3" class="dim">暂无活动</td></tr>}>
                {(item) => (
                  <tr classList={{ "activity-row": true, "is-clickable": Boolean(state.grabTasks[item.id]) }} onClick={() => { const task = state.grabTasks[item.id]; if (task) app.grab.showGrabTaskDetail(task); }}>
                    <td>{item.name}</td>
                    <td>{item.status}</td>
                    <td>{item.progress} <Show when={state.grabTasks[item.id]}><button type="button" class="activity-more" onClick={(event) => { event.stopPropagation(); app.grab.openActivityTaskMenu(item.id, event.currentTarget); }}>⋯</button></Show></td>
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

  function accountLabel() {
    const studentNumber = state.auth.studentNumber || state.bootstrap?.savedCredentials?.studentNumber || "";
    if (!studentNumber) return "未登录账号";
    if (studentNumber.length <= 4) return studentNumber;
    return `${studentNumber.slice(0, 2)}***${studentNumber.slice(-2)}`;
  }

  function runAddressAction(event) {
    const value = event.currentTarget.value;
    if (value === "__test__") {
      event.currentTarget.value = state.auth.baseUrl;
      app.auth.testLoginAddresses().catch(app.showError);
      return;
    }
    if (value === "__custom__") {
      state.auth.baseUrl = "__custom__";
      state.auth.loginVisible = true;
      return;
    }
    state.auth.baseUrl = value;
    if (state.bootstrap) state.bootstrap.baseUrl = value;
  }

  function runAccountAction(event) {
    const action = event.currentTarget.value;
    event.currentTarget.value = "";
    if (action === "show-login") {
      app.auth.setLoginBaseUrl(state.auth.baseUrl);
      state.auth.loginVisible = true;
      return;
    }
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
              <select id="workspace-base-url" aria-label="教务地址" value={state.auth.baseUrl} onChange={runAddressAction}>
                <For each={state.bootstrap?.addressChoices || []}>
                  {(item) => <option value={item.url} selected={item.url === state.auth.baseUrl}>{item.url} ({item.description}{item.latencyMs ? `, ${item.latencyMs}ms` : ""})</option>}
                </For>
                <option value="__test__">测速</option>
                <option value="__custom__" selected={state.auth.baseUrl === "__custom__"}>{state.auth.customBaseUrl || "自定义地址"}</option>
              </select>
              <select id="account-action" aria-label="账号操作" onChange={runAccountAction}>
                <option value="">{accountLabel()}</option>
                <option value="show-login">切换账号</option>
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
  const classConflictEntries = () => {
    const item = state.modalClass?.item;
    if (!item?.slots?.length) return [];
    const itemSlots = new Set(item.slots.map((slot) => slot.join("-")));
    return (state.timetable.entries || []).filter((entry) => (entry.slots || []).some((slot) => itemSlots.has(slot.join("-"))));
  };
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
    if (state.modalClass?.course) return state.modalClass.course.courseName;
    return "课程详情";
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
    return entry.type === "request" ? `${entry.method || "HTTP"} ${entry.path || ""}` : `${app.logs.logTypeText(entry.type)} #${entry.id}`;
  };
  const pickerKey = () => {
    const picker = state.filterPicker;
    if (!picker) return "";
    return `${picker.type}${picker.parent?.collegeId ? `:${picker.parent.collegeId}` : ""}${picker.query ? `:${picker.query}` : ""}`;
  };
  const pickerOptions = () => state.filterOptions[pickerKey()]?.items || [];
  const pickerHasMore = () => Boolean(state.filterOptions[pickerKey()]?.hasMore);
  const pickerPage = () => state.filterOptions[pickerKey()]?.page || 1;
  const pickerIsMajor = () => state.filterPicker?.type === "major";
  const pickerSelectedItems = () => {
    const selected = state.filterPicker?.selected || [];
    return selected.map((item) => {
      const value = filterValue(item);
      const option = pickerOptions().find((option) => option.value === value);
      return { value, label: filterLabel(item) || option?.displayLabel || option?.label || value };
    });
  };
  const pickerOptionSelected = (value) => (state.filterPicker?.selected || []).some((item) => filterValue(item) === value);
  const togglePickerValue = (value, label) => {
    const selected = state.filterPicker.selected;
    const idx = selected.findIndex((item) => filterValue(item) === value);
    if (idx >= 0) selected.splice(idx, 1);
    else selected.push({ value, label: label || value });
  };
  const applyPicker = () => {
    const tab = app.tree.activeCourseTab();
    if (tab?.type === "query" && state.filterPicker) {
      tab.draftFilters[state.filterPicker.field] = [...state.filterPicker.selected];
      if (state.filterPicker.field === "collegeIds") tab.draftFilters.majorIds = [];
    }
    state.filterPicker = null;
    app.tree.saveTabsState();
    app.tree.renderTree();
  };

  return (
    <>
      <div id="filter-picker-modal" classList={{ modal: true, hidden: !state.filterPicker }}>
        <div class="modal-card surface filter-picker-card">
          <div class="modal-header">
            <div>
              <div class="eyebrow">Filter Picker</div>
              <strong>{state.filterPicker?.title || "筛选项"}</strong>
            </div>
            <button type="button" onClick={() => { state.filterPicker = null; }}>关闭</button>
          </div>
          <div class="modal-content filter-picker-body">
            <div class="filter-picker-toolbar">
              <input type="search" placeholder="搜索选项" value={state.filterPicker?.query || ""} onInput={(event) => { state.filterPicker.query = event.currentTarget.value; }} onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                state.filterPicker.page = 1;
                app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, 1, state.filterPicker.query).catch(app.showError);
              }} />
              <button type="button" onClick={() => app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, 1, state.filterPicker.query).catch(app.showError)}>搜索</button>
            </div>
            <Show when={pickerSelectedItems().length}>
              <div class="filter-picker-selected">
                <span class="dim">已选</span>
                <For each={pickerSelectedItems()}>
                  {(item) => (
                    <button type="button" class="filter-chip" onClick={() => togglePickerValue(item.value)} title={`移除 ${item.label}`}>
                      <span>{item.label}</span>
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div classList={{ "filter-picker-list": true, "filter-picker-table-wrap": pickerIsMajor() }}>
              <Show when={pickerIsMajor()} fallback={
                <For each={pickerOptions()}>
                  {(item) => (
                    <label class="filter-picker-option">
                      <input type="checkbox" checked={pickerOptionSelected(item.value)} onChange={() => togglePickerValue(item.value, item.displayLabel || item.label)} />
                      <span>{item.displayLabel || item.label}</span>
                      <span class="dim">{item.value}</span>
                    </label>
                  )}
                </For>
              }>
                <table class="filter-picker-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>专业代码</th>
                      <th>专业名称</th>
                      <th>学院</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={pickerOptions()}>
                      {(item) => (
                        <tr onClick={() => togglePickerValue(item.value, item.displayLabel || item.label)} classList={{ selected: pickerOptionSelected(item.value) }}>
                          <td><input type="checkbox" checked={pickerOptionSelected(item.value)} onClick={(event) => event.stopPropagation()} onChange={() => togglePickerValue(item.value, item.displayLabel || item.label)} /></td>
                          <td>{item.raw?.zyh || item.value}</td>
                          <td>{item.raw?.zymc || item.label}</td>
                          <td>{item.raw?.jgmc || ""}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>
              <Show when={!pickerOptions().length}>
                <div class="tree-placeholder">无选项，输入关键词后搜索或稍后重试</div>
              </Show>
            </div>
            <Show when={pickerHasMore()}>
              <button type="button" class="tree-more" onClick={() => app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, pickerPage() + 1, state.filterPicker.query).catch(app.showError)}>加载更多...</button>
            </Show>
          </div>
          <div class="modal-actions">
            <button type="button" onClick={() => { state.filterPicker.selected = []; }}>清空</button>
            <button type="button" onClick={applyPicker}>应用</button>
          </div>
        </div>
      </div>

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
                  <Show when={classConflictEntries().length}>
                    <div class="class-meta"><div>冲突课程</div><div><For each={classConflictEntries()}>{(entry) => <div>{entry.name} <span class="dim">{entry.classNo || "-"} / {entry.sksj || "-"}</span></div>}</For></div></div>
                  </Show>
                  <Show when={state.teacherDetail === null}>
                    <button type="button" class="tree-more" onClick={() => app.timetable.loadTeacherDetail(item.teacherJghId, item.kchId || state.modalClass?.course?.kchId)} style="margin-top:8px">查看教师详情</button>
                  </Show>
                  <Show when={state.teacherDetail?._loading}>
                    <div class="dim" style="margin-top:8px">加载教师详情中...</div>
                  </Show>
                  <Show when={state.teacherDetail && !state.teacherDetail._loading}>
                    <details class="debug-details" open>
                      <summary>教师详情</summary>
                      <Show when={state.teacherDetail.name}
                        fallback={<div class="dim" style="margin-top:6px">暂无教师详情数据</div>}
                      >
                        <div class="debug-grid">
                          <Show when={state.teacherDetail.name}><div>教师姓名</div><div>{state.teacherDetail.name}</div></Show>
                          <Show when={state.teacherDetail.pinyin}><div>姓名拼音</div><div>{state.teacherDetail.pinyin}</div></Show>
                          <Show when={state.teacherDetail.gender}><div>性别</div><div>{state.teacherDetail.gender}</div></Show>
                          <Show when={state.teacherDetail.title}><div>职称</div><div>{state.teacherDetail.title}</div></Show>
                          <Show when={state.teacherDetail.department}><div>所在单位</div><div>{state.teacherDetail.department}</div></Show>
                          <Show when={state.teacherDetail.education}><div>最高学历</div><div>{state.teacherDetail.education}</div></Show>
                          <Show when={state.teacherDetail.email}><div>电子邮箱</div><div>{state.teacherDetail.email}</div></Show>
                          <Show when={state.teacherDetail.research}><div>研究方向</div><div>{state.teacherDetail.research}</div></Show>
                          <Show when={state.teacherDetail.office}><div>科室名称</div><div>{state.teacherDetail.office}</div></Show>
                          <Show when={state.teacherDetail.introduction}><div>教师简介</div><div>{state.teacherDetail.introduction}</div></Show>
                        </div>
                      </Show>
                    </details>
                  </Show>
                </>
              )}
            </Show>
            <Show when={state.modalClass?.course && !state.modalClass?.item ? state.modalClass.course : null} keyed>
              {(course) => (
                <>
                  <div class="class-meta"><div>课程</div><div>{course.courseName}</div></div>
                  <div class="class-meta"><div>课程号</div><div>{course.kchId || "-"}</div></div>
                  <div class="class-meta"><div>学分</div><div>{course.creditText || "-"}</div></div>
                  <div class="class-meta"><div>教学班</div><div>{course.classCount ?? "-"}</div></div>
                  <div class="class-meta"><div>已选</div><div>{state.timetable.selectedCourseIds?.includes(course.kchId) ? "是" : "否"}</div></div>
                  <Show when={state.courseDetail === null}>
                    <button type="button" class="tree-more" onClick={() => app.timetable.loadCourseDetail(course.kchId)} style="margin-top:8px">查看课程详情</button>
                  </Show>
                  <Show when={state.courseDetail?._loading}>
                    <div class="dim" style="margin-top:8px">加载课程详情中...</div>
                  </Show>
                  <Show when={state.courseDetail && !state.courseDetail._loading}>
                    <details class="debug-details" open>
                      <summary>课程基本信息</summary>
                      <Show when={state.courseDetail.code || state.courseDetail.name}
                        fallback={<div class="dim" style="margin-top:6px">暂无课程详情数据</div>}
                      >
                        <div class="debug-grid">
                          <Show when={state.courseDetail.name}><div>课程名称</div><div>{state.courseDetail.name}</div></Show>
                          <Show when={state.courseDetail.englishName}><div>英文名称</div><div>{state.courseDetail.englishName}</div></Show>
                          <Show when={state.courseDetail.academy}><div>开课学院</div><div>{state.courseDetail.academy}</div></Show>
                          <Show when={state.courseDetail.category}><div>课程类别</div><div>{state.courseDetail.category}</div></Show>
                          <Show when={state.courseDetail.ownership}><div>课程归属</div><div>{state.courseDetail.ownership}</div></Show>
                          <Show when={state.courseDetail.credits}><div>学分</div><div>{state.courseDetail.credits}</div></Show>
                          <Show when={state.courseDetail.weeklyHours}><div>周学时</div><div>{state.courseDetail.weeklyHours}</div></Show>
                          <Show when={state.courseDetail.gradeLevel}><div>成绩录入级别</div><div>{state.courseDetail.gradeLevel}</div></Show>
                          <Show when={state.courseDetail.canAudit}><div>可否申请免听</div><div>{state.courseDetail.canAudit}</div></Show>
                          <Show when={state.courseDetail.makeupExam}><div>统一安排补考否</div><div>{state.courseDetail.makeupExam}</div></Show>
                          <Show when={state.courseDetail.canRetake}><div>是否可补考</div><div>{state.courseDetail.canRetake}</div></Show>
                          <Show when={state.courseDetail.quickSelect}><div>可否快速选课</div><div>{state.courseDetail.quickSelect}</div></Show>
                          <Show when={state.courseDetail.isPractice}><div>是否是实践课</div><div>{state.courseDetail.isPractice}</div></Show>
                          <Show when={state.courseDetail.startYear}><div>课程启用年级</div><div>{state.courseDetail.startYear}</div></Show>
                          <Show when={state.courseDetail.prerequisites}><div>预修课</div><div>{state.courseDetail.prerequisites}</div></Show>
                          <Show when={state.courseDetail.targetAudience}><div>面向对象</div><div>{state.courseDetail.targetAudience}</div></Show>
                          <Show when={state.courseDetail.introduction}><div>课程简介</div><div>{state.courseDetail.introduction}</div></Show>
                          <Show when={state.courseDetail.syllabus}><div>教学大纲</div><div>{state.courseDetail.syllabus}</div></Show>
                        </div>
                      </Show>
                    </details>
                  </Show>
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
            <Show when={state.modalClass?.entry || state.modalClass?.item}>
              <button type="button" id="modal-action" onClick={() => app.timetable.executeModalAction().catch(app.showError)}>{modalActionLabel()}</button>
            </Show>
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
                      <div class="class-meta"><div>类型</div><div>{app.logs.logTypeText(entry.type)} / {entry.level || "info"}</div></div>
                      <div class="class-meta"><div>消息</div><div><pre class="log-detail-pre">{app.logs.formatLogDetailBlock(entry.message || "")}</pre></div></div>
                    </>
                  )}
                >
                  <div class="class-meta"><div>时间</div><div>{entry.timestamp}</div></div>
                  <div class="class-meta"><div>类型</div><div>{app.logs.logTypeText(entry.type)} / {entry.level || "info"}</div></div>
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
