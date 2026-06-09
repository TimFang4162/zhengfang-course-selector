import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "./app/app-context.jsx";
import { state, isSelectedClass } from "./app/state.js";
import { TreeView } from "./features/tree/TreeView.jsx";
import { TimetableView } from "./features/timetable/TimetableView.jsx";
import { AcademicStatusView, activeAcademicFilterCount } from "./features/academic/AcademicView.jsx";
import { academicFilterNatures, academicFilterTerms } from "./features/academic/filters.js";
import { GrabModal, GrabTaskModal } from "./features/grab/GrabView.jsx";
import { FloatingMenu } from "./components/FloatingMenu.jsx";
import { formatDebugJson, cx } from "./shared/utils.js";

function filterValue(item) {
  return item && typeof item === "object" ? item.value : item;
}

function filterLabel(item) {
  if (item && typeof item === "object") return item.label || item.value;
  return item;
}

function LoginOverlay() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  const savedAvailable = Boolean(snap.bootstrap?.savedCredentials?.available);
  const tab = snap.auth.loginTab;
  const activeTab = (tab === "saved" && savedAvailable) ? "saved" : tab === "password" ? "password" : tab === "cookie" ? "cookie" : savedAvailable ? "saved" : "password";

  return (
    <div id="login-overlay" className={cx("overlay", { hidden: !snap.auth.loginVisible })}>
      <div className="login-card surface">
        <div className="card-header login-header">
          <div>
            <div className="eyebrow">Local Console</div>
            <h1>JWXT Web UI</h1>
          </div>
          <div className="header-badge">Enterprise</div>
        </div>
        <div className="form-row address-row">
          <label htmlFor="base-url">教务地址</label>
          <select id="base-url" value={snap.auth.baseUrl} onChange={(e) => {
            const value = e.currentTarget.value;
            if (value === "__test__") {
              e.currentTarget.value = state.auth.baseUrl;
              app.auth.testLoginAddresses().catch(app.showError);
              return;
            }
            state.auth.baseUrl = value;
          }}>
            {(snap.bootstrap?.addressChoices || []).map((item) => <option key={item.url} value={item.url}>{item.url} ({item.description}{item.latencyMs ? `, ${item.latencyMs}ms` : ""})</option>)}
            <option value="__test__">测速</option>
            <option value="__custom__">{snap.auth.customBaseUrl || "自定义地址"}</option>
          </select>
          <input
            id="custom-base-url"
            className={cx({ hidden: snap.auth.baseUrl !== "__custom__" })}
            type="url"
            placeholder="https://jwxt.example.edu.cn"
            value={snap.auth.customBaseUrl}
            onInput={(e) => { state.auth.customBaseUrl = e.currentTarget.value; }}
          />
        </div>
        <div className="form-row checkbox-row">
          <label><input type="checkbox" id="disable-ssl-verify" checked={snap.auth.disableSslVerify} onChange={(e) => { state.auth.disableSslVerify = e.currentTarget.checked; app.auth.updateSslVerifySetting().catch(app.showError); }} /> 禁用 SSL 验证</label>
          <span className="dim">应用于登录、选课请求和测速</span>
        </div>
        <div className="login-tabs">
          <button type="button" className={cx("login-tab", { active: activeTab === "saved" })} disabled={!savedAvailable} onClick={() => { state.auth.loginTab = "saved"; }}>一键登录</button>
          <button type="button" className={cx("login-tab", { active: activeTab === "password" })} onClick={() => { state.auth.loginTab = "password"; }}>账号密码</button>
          <button type="button" className={cx("login-tab", { active: activeTab === "cookie" })} onClick={() => { state.auth.loginTab = "cookie"; }}>Cookie</button>
        </div>

        {activeTab === "saved" && (
          <div className="login-tab-panel">
            {savedAvailable && snap.bootstrap?.savedCredentials && (
              <div className="saved-login-panel">
                <span className="dim">已保存账号 {snap.bootstrap.savedCredentials.masked}</span>
                <button type="button" id="saved-login-button" onClick={() => app.auth.doLogin(true).catch(app.showError)}>以 {snap.bootstrap.savedCredentials.masked} 登录</button>
              </div>
            )}
          </div>
        )}

        {activeTab === "password" && (
          <div className="login-tab-panel">
            <div className="form-row">
              <label htmlFor="student-number">学号</label>
              <input id="student-number" type="text" autoComplete="username" value={snap.auth.studentNumber} onInput={(e) => { state.auth.studentNumber = e.currentTarget.value; }} />
            </div>
            <div className="form-row">
              <label htmlFor="password">密码</label>
              <input id="password" type="password" autoComplete="current-password" value={snap.auth.password} onInput={(e) => { state.auth.password = e.currentTarget.value; }} />
            </div>
            <div className="form-row checkbox-row">
              <label><input type="checkbox" id="save-creds" checked={snap.auth.saveCredentials} onChange={(e) => { state.auth.saveCredentials = e.currentTarget.checked; }} /> 保存本次凭据</label>
            </div>
            <div className="form-actions">
              <button type="button" id="login-button" onClick={() => app.auth.doLogin().catch(app.showError)}>账号密码登录</button>
              <span id="login-status" className="dim">{snap.auth.loginStatus}</span>
            </div>
          </div>
        )}

        {activeTab === "cookie" && (
          <div className="login-tab-panel">
            <div className="form-row">
              <label htmlFor="cookie-input">Cookie</label>
              <textarea
                id="cookie-input"
                placeholder={`从浏览器 DevTools → Application → Cookies 复制，或粘贴 document.cookie 的值，或直接粘贴请求头里的 Cookie 行。\n支持格式：name=value; name2=value2，或多行 name=value，或带 Cookie: 前缀。\n同名 cookie（如双 JSESSIONID）会按 path=/jwglxt 和 path=/ 自动拆分注入。`}
                value={snap.auth.cookieInput}
                onInput={(e) => { state.auth.cookieInput = e.currentTarget.value; }}
                spellCheck={false}
              />
            </div>
            <div className="cookie-hint dim">提示：教务系统的 JSESSIONID 是必需的；WebVPN 地址还需 wpsvn 系列 cookie。同名 cookie 会自动按 path 区分。Cookie 仅保存在本进程内存中。</div>
            <div className="form-actions">
              <button type="button" id="cookie-login-button" onClick={() => app.auth.doLoginWithCookie().catch(app.showError)}>Cookie 登录</button>
              <span id="login-status" className="dim">{snap.auth.loginStatus}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MultiSelectDropdown({ field, label, staticOptions, ctx }) {
  const { activeSearchTab, dropdownTypeMap, toggleDropdown, selectedSummary, app } = ctx;
  const snapOpen = useSnapshot(state).openDropdown;
  const isOpen = snapOpen === field;
  const filterOpts = useSnapshot(state).filterOptions;
  const options = staticOptions || filterOpts[dropdownTypeMap[field]]?.items || [];
  const selected = activeSearchTab?.draftFilters[field] || [];

  function isSelected(item) {
    return selected.some((s) => filterValue(s) === item.value);
  }

  function toggleItem(item) {
    const t = activeSearchTab;
    if (!t) return;
    const current = [...selected];
    const idx = current.findIndex((s) => filterValue(s) === item.value);
    if (idx >= 0) current.splice(idx, 1);
    else current.push({ value: item.value, label: item.displayLabel || item.label });
    t.draftFilters[field] = current;
    app.tree.saveTabsState();
    app.tree.renderTree();
  }

  return (
    <div className="multi-select-dropdown">
      <button type="button" className="query-filter-button" onClick={() => toggleDropdown(field)}>
        <span>{label}</span>
        <strong>{selectedSummary(field)}</strong>
      </button>
      {isOpen && (
        <div className="multi-select-menu">
          {options.map((item) => (
            <label key={item.value} className="multi-select-option">
              <input type="checkbox" checked={isSelected(item)} onChange={() => toggleItem(item)} />
              <span>{item.displayLabel || item.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceTabs() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  const academicNodes = snap.academicStatus?.nodes || [];
  const academicNodeCourses = snap.academicNodeCourses || {};
  const activeCourseTab = app.tree.activeCourseTab();
  const activeSearchTab = activeCourseTab?.type === "query" ? activeCourseTab : null;

  function toggleMenu(menu) {
    state.openMenu = state.openMenu === menu ? null : menu;
  }

  function closeMenus() {
    state.openMenu = null;
  }

  useEffect(() => {
    const closeOutside = (e) => {
      if (e.target.closest?.(".menu-root")) return;
      if (e.target.closest?.(".multi-select-dropdown")) return;
      state.openMenu = null;
      state.openDropdown = null;
    };
    document.addEventListener("click", closeOutside);
    return () => document.removeEventListener("click", closeOutside);
  }, []);

  function runRemoteSearch() {
    const tab = activeSearchTab;
    if (!tab) return;
    app.tree.runSearchTab(tab, true).catch(app.showError);
  }

  function applyResultFilter(value) {
    const tab = activeSearchTab;
    if (!tab) return;
    tab.localFilter = value;
    app.tree.saveTabsState();
    app.tree.applyLocalSearch();
  }

  function setFilterList(field, value) {
    const tab = activeSearchTab;
    if (!tab) return;
    tab.draftFilters[field] = value.split(/[ ,，]+/).map((s) => s.trim()).filter(Boolean);
    app.tree.saveTabsState();
  }

  function filterText(field) {
    return (activeSearchTab?.draftFilters[field] || []).map(filterValue).join(",");
  }

  function optionKey(type, parent = {}, query = "") {
    return `${type}${parent.collegeId ? `:${parent.collegeId}` : ""}${query ? `:${query}` : ""}`;
  }

  function selectedLabels(field) {
    const values = activeSearchTab?.draftFilters[field] || [];
    if (!values.length) return "全部";
    return values.map(filterLabel).join(", ");
  }

  function selectedSummary(field) {
    const values = activeSearchTab?.draftFilters[field] || [];
    if (!values.length) return "全部";
    if (values.length === 1) return filterLabel(values[0]);
    return `${values.length} 项`;
  }

  function openFilterPicker(config) {
    const tab = activeSearchTab;
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
      keyword: "", collegeIds: [], majorIds: [], teachingCollegeIds: [], gradeIds: [],
      courseCategoryIds: [], courseNatureIds: [], courseOwnershipIds: [], teachingModeIds: [],
      weekdayIds: [], periodIds: [], credits: [], classNames: [], recommended: [],
      hasCapacity: [], timeConflict: [], retake: [],
    };
  }

  function defaultFiltersForTab(tab) {
    const filters = emptySearchFilters();
    if (tab?.id === "default") {
      const majorId = state.categories.find((c) => c.zyhId)?.zyhId;
      if (majorId) filters.majorIds = [{ value: majorId, label: `专业 ${majorId}` }];
    }
    return filters;
  }

  function queryConditionCount() {
    const tab = activeSearchTab;
    if (!tab?.draftFilters) return 0;
    let count = tab.query?.trim() ? 1 : 0;
    for (const [field, value] of Object.entries(tab.draftFilters)) {
      if (field === "keyword") continue;
      if (Array.isArray(value) && value.length) count += 1;
    }
    return count;
  }

  function normalizedFilterItems(items) {
    return [...(items || [])].map((item) => String(filterValue(item)).trim()).filter(Boolean).sort();
  }

  function hasPendingQueryChanges() {
    const tab = activeSearchTab;
    if (!tab?.draftFilters || !tab?.appliedFilters) return false;
    if ((tab.query || "").trim() !== (tab.appliedFilters.keyword || "").trim()) return true;
    for (const field of Object.keys(emptySearchFilters())) {
      if (field === "keyword") continue;
      const draft = normalizedFilterItems(tab.draftFilters[field]);
      const applied = normalizedFilterItems(tab.appliedFilters[field]);
      if (draft.length !== applied.length) return true;
      if (draft.some((v, i) => v !== applied[i])) return true;
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
    const tab = activeSearchTab;
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

  const dropdownTypeMap = {
    courseCategoryIds: "courseCategory",
    courseNatureIds: "courseNature",
    courseOwnershipIds: "courseOwnership",
    teachingModeIds: "teachingMode",
    weekdayIds: "weekday",
    periodIds: "period",
  };

  function toggleDropdown(field) {
    if (state.openDropdown === field) { state.openDropdown = null; return; }
    state.openDropdown = field;
    const type = dropdownTypeMap[field];
    if (type && !state.filterOptions[type]?.loaded) app.tree.loadFilterOptions(type, {}, 1, "").catch(app.showError);
  }

  function multiSelectCtx() {
    return { activeSearchTab, dropdownTypeMap, toggleDropdown, selectedSummary, app };
  }

  return (
    <>
      <section id="tab-tree" className={cx("tab-panel section-panel", { active: snap.activeTab === "tree" })}>
        <div className="course-tab-strip">
          {snap.courseTabs.map((tab) => (
            <span key={tab.id} className={cx("course-tab-shell", { active: snap.activeCourseTabId === tab.id })}>
              <button type="button" className="course-tab" onClick={() => app.tree.activateCourseTab(tab.id)}>{tab.title}</button>
              <button type="button" className="course-tab-close" aria-label={`关闭${tab.title}`} onClick={() => app.tree.closeCourseTab(tab.id)}>×</button>
            </span>
          ))}
          <button type="button" className="course-tab-new" onClick={app.tree.createSearchTab}>+ 新查询</button>
        </div>
        {activeSearchTab?.queryPanelOpen && (
          <div className="course-query-panel">
            <div className="course-query-main">
              <input
                id="course-query-keyword"
                type="search"
                placeholder="课程号/课程名称/教学班名称/教师姓名/教师工号..."
                value={activeSearchTab?.query || ""}
                onInput={(e) => { activeSearchTab.query = e.currentTarget.value; app.tree.saveTabsState(); }}
                onKeyDown={(e) => { if (e.key === "Enter") runRemoteSearch(); }}
              />
              <button type="button" id="remote-search" className={cx({ "is-dirty": hasPendingQueryChanges() })} onClick={runRemoteSearch}>查询</button>
              <button type="button" id="reset-query" onClick={resetQueryConditions}>{activeSearchTab?.id === "default" ? "恢复默认" : "重置条件"}</button>
            </div>
            <div className="course-query-grid">
              <button type="button" className="filter-picker-button query-filter-button" onClick={() => openFilterPicker({ type: "college", field: "collegeIds", title: "学院" })} title={selectedLabels("collegeIds")}><span>学院</span><strong>{selectedSummary("collegeIds")}</strong></button>
              <button type="button" className="filter-picker-button query-filter-button" onClick={() => openFilterPicker({ type: "major", field: "majorIds", title: "专业" })} title={selectedLabels("majorIds")}><span>专业</span><strong>{selectedSummary("majorIds")}</strong></button>
              <label className="query-filter-field"><span>年级</span><input type="text" value={filterText("gradeIds")} placeholder="全部" onInput={(e) => setFilterList("gradeIds", e.currentTarget.value)} /></label>
              <button type="button" className="filter-picker-button query-filter-button" onClick={() => openFilterPicker({ type: "teachingCollege", field: "teachingCollegeIds", title: "开课学院" })} title={selectedLabels("teachingCollegeIds")}><span>开课学院</span><strong>{selectedSummary("teachingCollegeIds")}</strong></button>
              <MultiSelectDropdown label="课程类别" field="courseCategoryIds" ctx={multiSelectCtx()} />
              <MultiSelectDropdown label="课程性质" field="courseNatureIds" ctx={multiSelectCtx()} />
              <MultiSelectDropdown label="课程归属" field="courseOwnershipIds" ctx={multiSelectCtx()} />
              <MultiSelectDropdown label="教学模式" field="teachingModeIds" ctx={multiSelectCtx()} />
              <MultiSelectDropdown label="上课星期" field="weekdayIds" ctx={multiSelectCtx()} />
              <MultiSelectDropdown label="上课节次" field="periodIds" ctx={multiSelectCtx()} />
              <label className="query-filter-field"><span>教学班</span><input type="text" value={filterText("classNames")} placeholder="全部" onInput={(e) => setFilterList("classNames", e.currentTarget.value)} /></label>
              <label className="query-filter-field"><span>学分</span><input type="text" value={filterText("credits")} placeholder="全部" onInput={(e) => setFilterList("credits", e.currentTarget.value)} /></label>
              <MultiSelectDropdown label="是否重修" field="retake" staticOptions={[{ value: "1", label: "是" }, { value: "0", label: "否" }]} ctx={multiSelectCtx()} />
              <MultiSelectDropdown label="有无余量" field="hasCapacity" staticOptions={[{ value: "1", label: "有" }, { value: "0", label: "无" }]} ctx={multiSelectCtx()} />
            </div>
          </div>
        )}
        <div className="toolbar toolbar-tight tree-result-toolbar">
          <div className="tree-actions">
            <div className="menu-root">
              <button type="button" className="menu-button" id="display-menu-button" onClick={(e) => { e.stopPropagation(); toggleMenu("display-menu"); }}>显示</button>
              <div className={cx("menu-popover", { hidden: snap.openMenu !== "display-menu" })} id="display-menu">
                <button type="button" data-action="toggle-conflict" onClick={() => { app.tree.runDisplayAction("toggle-conflict"); closeMenus(); }}>淡化时间冲突教学班:{snap.filters.conflict ? "开" : "关"}</button>
                <button type="button" data-action="toggle-no-capacity" onClick={() => { app.tree.runDisplayAction("toggle-no-capacity"); closeMenus(); }}>淡化无余量教学班:{snap.filters.noCapacity ? "开" : "关"}</button>
                <button type="button" data-action="toggle-highlight-capacity" onClick={() => { app.tree.runDisplayAction("toggle-highlight-capacity"); closeMenus(); }}>突出有余量教学班:{snap.filters.highlightCapacity ? "开" : "关"}</button>
                <button type="button" data-action="toggle-credit" onClick={() => { app.tree.runDisplayAction("toggle-credit"); closeMenus(); }}>淡化超学分课程:{snap.filters.credit ? "开" : "关"}</button>
                <button type="button" data-action="toggle-completed" onClick={() => { app.tree.runDisplayAction("toggle-completed"); closeMenus(); }}>淡化已修读课程:{snap.filters.completed ? "开" : "关"}</button>
              </div>
            </div>
            <div className="menu-root">
              <button type="button" className="menu-button" id="feature-menu-button" onClick={(e) => { e.stopPropagation(); toggleMenu("feature-menu"); }}>功能</button>
              <div className={cx("menu-popover", { hidden: snap.openMenu !== "feature-menu" })} id="feature-menu">
                <button type="button" data-action="refresh-categories" onClick={() => { app.tree.runFeatureAction("refresh-categories"); closeMenus(); }}>刷新列表</button>
                <button type="button" data-action="export-courses" onClick={() => { app.tree.runFeatureAction("export-courses"); closeMenus(); }}>导出所有课程</button>
              </div>
            </div>
            <button type="button" className="menu-button query-toggle-button" onClick={() => { activeSearchTab.queryPanelOpen = !activeSearchTab.queryPanelOpen; app.tree.saveTabsState(); app.tree.renderTree(); }}>
              查询({queryConditionCount()})
            </button>
            <button type="button" className="menu-button tree-selection-button" disabled={!hasTreeSelection()} onClick={() => app.grab.openGrabModalFromSelection()}>
              添加抢课任务
            </button>
            <button type="button" className="menu-button tree-selection-button" disabled={!hasTreeSelection()} onClick={() => app.tree.clearTreeSelection()}>
              清空选择
            </button>
            <span className="tree-selection-status">{treeSelectionText()}</span>
          </div>
          <div className="tree-result-filter">
            <input
              id="course-result-filter"
              type="search"
              placeholder="筛选"
              value={activeSearchTab?.localFilter || ""}
              onInput={(e) => applyResultFilter(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Escape") applyResultFilter(""); }}
            />
            <button type="button" aria-label="清除筛选" disabled={!activeSearchTab?.localFilter} onClick={() => applyResultFilter("")}>×</button>
          </div>
        </div>
        <TreeView />
      </section>

      <section id="tab-timetable" className={cx("tab-panel section-panel", { active: snap.activeTab === "timetable" })}>
        <TimetableView />
      </section>

      <section id="tab-academic" className={cx("tab-panel section-panel", { active: snap.activeTab === "academic" })}>
        <div className="toolbar toolbar-tight academic-toolbar">
          <div className="menu-root">
            <button type="button" className="menu-button" id="academic-filter-button" onClick={(e) => { e.stopPropagation(); toggleMenu("academic-filter-menu"); }}>{activeAcademicFilterCount(snap) > 0 ? `筛选(${activeAcademicFilterCount(snap)})` : "筛选"}</button>
            <div className={cx("menu-popover academic-filter-menu", { hidden: snap.openMenu !== "academic-filter-menu" })} id="academic-filter-menu">
              <div className="field-group">
                <label htmlFor="academic-filter-term">建议修读时间</label>
                <select id="academic-filter-term" value={snap.academicFilters.suggestedTerm} onChange={(e) => { state.academicFilters.suggestedTerm = e.currentTarget.value; app.academic.renderAcademicStatus(); }}>
                  <option value="all">全部时间</option>
                  {academicFilterTerms(academicNodes, academicNodeCourses).map((term) => <option key={term} value={term}>{term}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="academic-filter-status">修读状态</label>
                <select id="academic-filter-status" value={snap.academicFilters.statusType} onChange={(e) => { state.academicFilters.statusType = e.currentTarget.value; app.academic.renderAcademicStatus(); }}>
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
              <div className="field-group">
                <label htmlFor="academic-filter-nature">课程性质</label>
                <select id="academic-filter-nature" value={snap.academicFilters.courseNature} onChange={(e) => { state.academicFilters.courseNature = e.currentTarget.value; app.academic.renderAcademicStatus(); }}>
                  <option value="all">全部性质</option>
                  {academicFilterNatures(academicNodes, academicNodeCourses).map((nature) => <option key={nature} value={nature}>{nature}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="academic-filter-node-status">节点状态</label>
                <select id="academic-filter-node-status" value={snap.academicFilters.nodeStatus} onChange={(e) => { state.academicFilters.nodeStatus = e.currentTarget.value; app.academic.renderAcademicStatus(); }}>
                  <option value="all">全部节点状态</option>
                  <option value="not_full">学分未满</option>
                  <option value="node_failed">节点未过</option>
                  <option value="full">学分已满</option>
                  <option value="overflow">学分超出</option>
                  <option value="unknown">未知</option>
                </select>
              </div>
              <div className="academic-filter-actions">
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
          <div className="menu-root">
            <button type="button" className="menu-button" id="academic-more-button" onClick={(e) => { e.stopPropagation(); toggleMenu("academic-more-menu"); }}>功能</button>
            <div className={cx("menu-popover", { hidden: snap.openMenu !== "academic-more-menu" })} id="academic-more-menu">
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
  const snap = useSnapshot(state);
  const logListRef = useRef(null);
  const prevLogCount = useRef(0);

  const visibleItems = snap.logFilterType === "all" ? snap.logItems : snap.logItems.filter((item) => item.type === snap.logFilterType);
  useEffect(() => {
    if (visibleItems.length !== prevLogCount.current && logListRef.current) {
      logListRef.current.scrollTop = logListRef.current.scrollHeight;
    }
    prevLogCount.current = visibleItems.length;
  }, [visibleItems.length]);

  return (
    <aside className="right-pane">
      <div className="log-shell">
        <div className="log-header">
          <span className="log-title">LOG</span>
          <div className="log-actions">
            <select id="log-filter-type" aria-label="日志类型" value={snap.logFilterType} onChange={(e) => { state.logFilterType = e.currentTarget.value; }}>
              <option value="all">全部</option>
              <option value="request">请求</option>
              <option value="business">业务</option>
              <option value="debug">调试</option>
              <option value="system">系统</option>
            </select>
            <button type="button" id="clear-logs" onClick={() => app.logs.clearLogs().catch(app.showError)}>清空</button>
          </div>
        </div>
        <div id="log-list" className="log-list" ref={logListRef}>
          {visibleItems.map((item, index) => (
            <button
              key={app.logs.logEntryKey(item)}
              type="button"
              className={`log-line is-${item.type || "business"} level-${item.level || "info"} is-clickable${item.phase === "start" ? " is-pending" : ""}`}
              data-log-key={app.logs.logEntryKey(item)}
              onClick={() => app.logs.openLogDetail(app.logs.logEntryKey(item))}
            >
              <span className="log-time">{app.logs.logTimestampText(item, index)}</span>
              <span className="log-type">{app.logs.logTypeLabel(item.type)}</span>
              <span className="log-message">{app.logs.describeLogEntry(item)}</span>
            </button>
          ))}
        </div>
      </div>
      <div id="activity-splitter" className="splitter splitter-horizontal" aria-hidden="true"></div>
      <div className="activity-shell">
        <div className="log-header">
          <span className="log-title">ACTIVITY</span>
          <div className="log-actions">
            <button type="button" id="activity-add" onClick={(e) => { e.stopPropagation(); app.grab.openActivityAddMenu(e.currentTarget); }}>+</button>
          </div>
        </div>
        <div className="activity-panel">
          <table className="activity-table">
            <thead>
              <tr><th>任务</th><th>状态</th><th>进度</th></tr>
            </thead>
            <tbody id="activity-list">
              {snap.activities.length ? snap.activities.map((item) => (
                <tr key={item.id} className={cx("activity-row", { "is-clickable": Boolean(state.grabTasks[item.id]) })} onClick={() => { const task = state.grabTasks[item.id]; if (task) app.grab.showGrabTaskDetail(task); }}>
                  <td>{item.name}</td>
                  <td>{item.status}</td>
                  <td>{item.progress} {snap.grabTasks[item.id] && <button type="button" className="activity-more" onClick={(e) => { e.stopPropagation(); app.grab.openActivityTaskMenu(item.id, e.currentTarget); }}>⋯</button>}</td>
                </tr>
              )) : <tr><td colSpan="3" className="dim">暂无活动</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  );
}

function AppShell() {
  const app = useAppContext();
  const snap = useSnapshot(state);

  function accountLabel() {
    const studentNumber = snap.auth.studentNumber || snap.bootstrap?.savedCredentials?.studentNumber || "";
    if (!studentNumber) return "未登录账号";
    if (studentNumber.length <= 4) return studentNumber;
    return `${studentNumber.slice(0, 2)}***${studentNumber.slice(-2)}`;
  }

  function runAddressAction(e) {
    const value = e.currentTarget.value;
    if (value === "__test__") {
      e.currentTarget.value = state.auth.baseUrl;
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

  function runAccountAction(e) {
    const action = e.currentTarget.value;
    e.currentTarget.value = "";
    if (action === "show-login") {
      app.auth.setLoginBaseUrl(state.auth.baseUrl);
      state.auth.loginVisible = true;
      return;
    }
  }

  return (
    <div className="app-shell">
      <div className="main-layout">
        <main className="left-pane">
          <div className="workspace-header">
            <div className="tabs compact-surface">
              <button type="button" className={cx("tab", { active: snap.activeTab === "tree" })} data-tab="tree" onClick={() => app.tree.switchTab("tree")}>课程树</button>
              <button type="button" className={cx("tab", { active: snap.activeTab === "timetable" })} data-tab="timetable" onClick={() => app.tree.switchTab("timetable")}>当前课表</button>
              <button type="button" className={cx("tab", { active: snap.activeTab === "academic" })} data-tab="academic" onClick={() => app.tree.switchTab("academic")}>学业情况</button>
            </div>
            <div className="workspace-controls">
              <select id="workspace-base-url" aria-label="教务地址" value={snap.auth.baseUrl} onChange={runAddressAction}>
                {(snap.bootstrap?.addressChoices || []).map((item) => <option key={item.url} value={item.url}>{item.url} ({item.description}{item.latencyMs ? `, ${item.latencyMs}ms` : ""})</option>)}
                <option value="__test__">测速</option>
                <option value="__custom__">{snap.auth.customBaseUrl || "自定义地址"}</option>
              </select>
              <select id="account-action" aria-label="账号操作" onChange={runAccountAction}>
                <option value="">{accountLabel()}</option>
                <option value="show-login">切换账号</option>
              </select>
              <button type="button" id="toggle-sidebar" title="折叠侧栏" onClick={app.tree.toggleSidebar}>{snap.sidebarCollapsed ? "⇥" : "⇤"}</button>
            </div>
          </div>

          <WorkspaceTabs />
        </main>

        <div id="main-splitter" className="splitter splitter-vertical" aria-hidden="true"></div>

        <RightPane />
      </div>
    </div>
  );
}

function ModalLayer() {
  const app = useAppContext();
  const snap = useSnapshot(state);

  const modalClass = snap.modalClass;
  const classConflictEntries = (() => {
    const item = modalClass?.item;
    if (!item?.slots?.length) return [];
    const itemSlots = new Set(item.slots.map((s) => s.join("-")));
    return (snap.timetable.entries || []).filter((entry) => (entry.slots || []).some((s) => itemSlots.has(s.join("-"))));
  })();
  const classDebugPayload = (() => {
    if (!modalClass) return null;
    if (modalClass.entry) return { source: "timetable", entry: modalClass.entry };
    return { source: "class-list", categoryId: modalClass.categoryId, course: modalClass.course, classItem: modalClass.item };
  })();
  const modalTitle = (() => {
    if (modalClass?.entry) return `${modalClass.entry.name} / ${modalClass.entry.classNo || "-"}`;
    if (modalClass?.course && modalClass?.item) return `${modalClass.course.courseName} / ${modalClass.item.classNo}`;
    if (modalClass?.course) return modalClass.course.courseName;
    return "课程详情";
  })();
  const modalActionLabel = (() => {
    if (modalClass?.entry) return "退课";
    if (modalClass?.item) return isSelectedClass(modalClass.item) ? "退课" : "选课";
    return "操作";
  })();
  const logDetailEntry = snap.logDetailKey ? snap.logEntries.get(snap.logDetailKey) : null;
  const logDetailTitle = (() => {
    if (!logDetailEntry) return "日志详情";
    return logDetailEntry.type === "request" ? `${logDetailEntry.method || "HTTP"} ${logDetailEntry.path || ""}` : `${app.logs.logTypeText(logDetailEntry.type)} #${logDetailEntry.id}`;
  })();
  const picker = snap.filterPicker;
  const pickerKeyStr = (() => {
    if (!picker) return "";
    return `${picker.type}${picker.parent?.collegeId ? `:${picker.parent.collegeId}` : ""}${picker.query ? `:${picker.query}` : ""}`;
  })();
  const pickerOptions = snap.filterOptions[pickerKeyStr]?.items || [];
  const pickerHasMore = Boolean(snap.filterOptions[pickerKeyStr]?.hasMore);
  const pickerPage = snap.filterOptions[pickerKeyStr]?.page || 1;
  const pickerIsMajor = picker?.type === "major";
  const pickerSelectedItems = (() => {
    const selected = picker?.selected || [];
    return selected.map((item) => {
      const value = filterValue(item);
      const option = pickerOptions.find((o) => o.value === value);
      return { value, label: filterLabel(item) || option?.displayLabel || option?.label || value };
    });
  })();
  const pickerOptionSelected = (value) => (picker?.selected || []).some((item) => filterValue(item) === value);
  const togglePickerValue = (value, label) => {
    const selected = picker.selected;
    const idx = selected.findIndex((item) => filterValue(item) === value);
    if (idx >= 0) selected.splice(idx, 1);
    else selected.push({ value, label: label || value });
  };
  const applyPicker = () => {
    const tab = app.tree.activeCourseTab();
    if (tab?.type === "query" && picker) {
      tab.draftFilters[picker.field] = [...picker.selected];
      if (picker.field === "collegeIds") tab.draftFilters.majorIds = [];
    }
    state.filterPicker = null;
    app.tree.saveTabsState();
    app.tree.renderTree();
  };

  return (
    <>
      <div id="filter-picker-modal" className={cx("modal", { hidden: !picker })}>
        <div className="modal-card surface filter-picker-card">
          <div className="modal-header">
            <div>
              <div className="eyebrow">Filter Picker</div>
              <strong>{picker?.title || "筛选项"}</strong>
            </div>
            <button type="button" onClick={() => { state.filterPicker = null; }}>关闭</button>
          </div>
          <div className="modal-content filter-picker-body">
            <div className="filter-picker-toolbar">
              <input type="search" placeholder="搜索选项" value={picker?.query || ""} onInput={(e) => { state.filterPicker.query = e.currentTarget.value; }} onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                state.filterPicker.page = 1;
                app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, 1, state.filterPicker.query).catch(app.showError);
              }} />
              <button type="button" onClick={() => app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, 1, state.filterPicker.query).catch(app.showError)}>搜索</button>
            </div>
            {pickerSelectedItems.length > 0 && (
              <div className="filter-picker-selected">
                <span className="dim">已选</span>
                {pickerSelectedItems.map((item) => (
                  <button key={item.value} type="button" className="filter-chip" onClick={() => togglePickerValue(item.value)} title={`移除 ${item.label}`}>
                    <span>{item.label}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
            <div className={cx("filter-picker-list", { "filter-picker-table-wrap": pickerIsMajor })}>
              {pickerIsMajor ? (
                <table className="filter-picker-table">
                  <thead><tr><th></th><th>专业代码</th><th>专业名称</th><th>学院</th></tr></thead>
                  <tbody>
                    {pickerOptions.map((item) => (
                      <tr key={item.value} onClick={() => togglePickerValue(item.value, item.displayLabel || item.label)} className={cx({ selected: pickerOptionSelected(item.value) })}>
                        <td><input type="checkbox" checked={pickerOptionSelected(item.value)} onClick={(e) => e.stopPropagation()} onChange={() => togglePickerValue(item.value, item.displayLabel || item.label)} /></td>
                        <td>{item.raw?.zyh || item.value}</td>
                        <td>{item.raw?.zymc || item.label}</td>
                        <td>{item.raw?.jgmc || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                pickerOptions.map((item) => (
                  <label key={item.value} className="filter-picker-option">
                    <input type="checkbox" checked={pickerOptionSelected(item.value)} onChange={() => togglePickerValue(item.value, item.displayLabel || item.label)} />
                    <span>{item.displayLabel || item.label}</span>
                    <span className="dim">{item.value}</span>
                  </label>
                ))
              )}
              {!pickerOptions.length && <div className="tree-placeholder">无选项，输入关键词后搜索或稍后重试</div>}
            </div>
            {pickerHasMore && (
              <button type="button" className="tree-more" onClick={() => app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, pickerPage + 1, state.filterPicker.query).catch(app.showError)}>加载更多...</button>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" onClick={() => { state.filterPicker.selected = []; }}>清空</button>
            <button type="button" onClick={applyPicker}>应用</button>
          </div>
        </div>
      </div>

      <div id="class-modal" className={cx("modal", { hidden: !modalClass })}>
        <div className="modal-card surface">
          <div className="modal-header">
            <div>
              <div className="eyebrow">Class Detail</div>
              <strong id="modal-title">{modalTitle}</strong>
            </div>
            <button type="button" id="modal-close" onClick={app.timetable.closeClassModal}>关闭</button>
          </div>
          <div id="modal-content" className="modal-content">
            {modalClass?.entry && (
              <>
                <div className="class-meta"><div>课程</div><div>{modalClass.entry.name}</div></div>
                <div className="class-meta"><div>课程号</div><div>{modalClass.entry.kchId || "-"}</div></div>
                <div className="class-meta"><div>教学班</div><div>{modalClass.entry.classNo || "-"}</div></div>
                <div className="class-meta"><div>学分</div><div>{modalClass.entry.creditText || "-"}</div></div>
                <div className="class-meta"><div>上课教师</div><div>{modalClass.entry.teacherName || ""} <span className="dim">{modalClass.entry.teacherTitle || ""}</span></div></div>
                <div className="class-meta"><div>上课时间</div><div>{modalClass.entry.sksj || "-"}</div></div>
                <div className="class-meta"><div>教学地点</div><div>{modalClass.entry.location || "-"}</div></div>
              </>
            )}
            {modalClass?.item && (
              <>
                <div className="class-meta"><div>教学班</div><div>{modalClass.item.classNo}</div></div>
                <div className="class-meta"><div>课程号</div><div>{modalClass.item.kchId || modalClass?.course?.kchId || "-"}</div></div>
                <div className="class-meta"><div>上课教师</div><div>{modalClass.item.teacherName || ""} <span className="dim">{modalClass.item.teacherTitle || ""}</span></div></div>
                <div className="class-meta"><div>上课时间</div><div>{modalClass.item.sksj || ""}</div></div>
                <div className="class-meta"><div>教学地点</div><div>{modalClass.item.location || ""}</div></div>
                <div className="class-meta"><div>开课学院</div><div>{modalClass.item.academy || "-"}</div></div>
                <div className="class-meta"><div>选课备注</div><div>{modalClass.item.remark || "-"}</div></div>
                <div className="class-meta"><div>课程性质</div><div>{modalClass.item.courseProperty || "-"}</div></div>
                <div className="class-meta"><div>已选/容量</div><div>{modalClass.item.selectedCount}/{modalClass.item.capacity}</div></div>
                {classConflictEntries.length > 0 && (
                  <div className="class-meta"><div>冲突课程</div><div>{classConflictEntries.map((entry) => <div key={entry.doJxbId}>{entry.name} <span className="dim">{entry.classNo || "-"} / {entry.sksj || "-"}</span></div>)}</div></div>
                )}
                {snap.teacherDetail === null && (
                  <button type="button" className="tree-more" onClick={() => app.timetable.loadTeacherDetail(modalClass.item.teacherJghId, modalClass.item.kchId || modalClass?.course?.kchId)} style={{ marginTop: 8 }}>查看教师详情</button>
                )}
                {snap.teacherDetail?._loading && <div className="dim" style={{ marginTop: 8 }}>加载教师详情中...</div>}
                {snap.teacherDetail && !snap.teacherDetail._loading && (
                  <details className="debug-details" open>
                    <summary>教师详情</summary>
                    {snap.teacherDetail.name ? (
                      <div className="debug-grid">
                        {snap.teacherDetail.name && <><div>教师姓名</div><div>{snap.teacherDetail.name}</div></>}
                        {snap.teacherDetail.pinyin && <><div>姓名拼音</div><div>{snap.teacherDetail.pinyin}</div></>}
                        {snap.teacherDetail.gender && <><div>性别</div><div>{snap.teacherDetail.gender}</div></>}
                        {snap.teacherDetail.title && <><div>职称</div><div>{snap.teacherDetail.title}</div></>}
                        {snap.teacherDetail.department && <><div>所在单位</div><div>{snap.teacherDetail.department}</div></>}
                        {snap.teacherDetail.education && <><div>最高学历</div><div>{snap.teacherDetail.education}</div></>}
                        {snap.teacherDetail.email && <><div>电子邮箱</div><div>{snap.teacherDetail.email}</div></>}
                        {snap.teacherDetail.research && <><div>研究方向</div><div>{snap.teacherDetail.research}</div></>}
                        {snap.teacherDetail.office && <><div>科室名称</div><div>{snap.teacherDetail.office}</div></>}
                        {snap.teacherDetail.introduction && <><div>教师简介</div><div>{snap.teacherDetail.introduction}</div></>}
                      </div>
                    ) : <div className="dim" style={{ marginTop: 6 }}>暂无教师详情数据</div>}
                  </details>
                )}
              </>
            )}
            {modalClass?.course && !modalClass?.item && (
              <>
                <div className="class-meta"><div>课程</div><div>{modalClass.course.courseName}</div></div>
                <div className="class-meta"><div>课程号</div><div>{modalClass.course.kchId || "-"}</div></div>
                <div className="class-meta"><div>学分</div><div>{modalClass.course.creditText || "-"}</div></div>
                <div className="class-meta"><div>教学班</div><div>{modalClass.course.classCount ?? "-"}</div></div>
                <div className="class-meta"><div>已选</div><div>{snap.timetable.selectedCourseIds?.includes(modalClass.course.kchId) ? "是" : "否"}</div></div>
                {snap.courseDetail === null && (
                  <button type="button" className="tree-more" onClick={() => app.timetable.loadCourseDetail(modalClass.course.kchId)} style={{ marginTop: 8 }}>查看课程详情</button>
                )}
                {snap.courseDetail?._loading && <div className="dim" style={{ marginTop: 8 }}>加载课程详情中...</div>}
                {snap.courseDetail && !snap.courseDetail._loading && (
                  <details className="debug-details" open>
                    <summary>课程基本信息</summary>
                    {snap.courseDetail.code || snap.courseDetail.name ? (
                      <div className="debug-grid">
                        {snap.courseDetail.name && <><div>课程名称</div><div>{snap.courseDetail.name}</div></>}
                        {snap.courseDetail.englishName && <><div>英文名称</div><div>{snap.courseDetail.englishName}</div></>}
                        {snap.courseDetail.academy && <><div>开课学院</div><div>{snap.courseDetail.academy}</div></>}
                        {snap.courseDetail.category && <><div>课程类别</div><div>{snap.courseDetail.category}</div></>}
                        {snap.courseDetail.ownership && <><div>课程归属</div><div>{snap.courseDetail.ownership}</div></>}
                        {snap.courseDetail.credits && <><div>学分</div><div>{snap.courseDetail.credits}</div></>}
                        {snap.courseDetail.weeklyHours && <><div>周学时</div><div>{snap.courseDetail.weeklyHours}</div></>}
                        {snap.courseDetail.gradeLevel && <><div>成绩录入级别</div><div>{snap.courseDetail.gradeLevel}</div></>}
                        {snap.courseDetail.canAudit && <><div>可否申请免听</div><div>{snap.courseDetail.canAudit}</div></>}
                        {snap.courseDetail.makeupExam && <><div>统一安排补考否</div><div>{snap.courseDetail.makeupExam}</div></>}
                        {snap.courseDetail.canRetake && <><div>是否可补考</div><div>{snap.courseDetail.canRetake}</div></>}
                        {snap.courseDetail.quickSelect && <><div>可否快速选课</div><div>{snap.courseDetail.quickSelect}</div></>}
                        {snap.courseDetail.isPractice && <><div>是否是实践课</div><div>{snap.courseDetail.isPractice}</div></>}
                        {snap.courseDetail.startYear && <><div>课程启用年级</div><div>{snap.courseDetail.startYear}</div></>}
                        {snap.courseDetail.prerequisites && <><div>预修课</div><div>{snap.courseDetail.prerequisites}</div></>}
                        {snap.courseDetail.targetAudience && <><div>面向对象</div><div>{snap.courseDetail.targetAudience}</div></>}
                        {snap.courseDetail.introduction && <><div>课程简介</div><div>{snap.courseDetail.introduction}</div></>}
                        {snap.courseDetail.syllabus && <><div>教学大纲</div><div>{snap.courseDetail.syllabus}</div></>}
                      </div>
                    ) : <div className="dim" style={{ marginTop: 6 }}>暂无课程详情数据</div>}
                  </details>
                )}
              </>
            )}
            {classDebugPayload && (
              <>
                <details className="debug-details">
                  <summary>抢课 / 选课关键字段</summary>
                  <div className="debug-grid">
                    <div>来源</div><div>{classDebugPayload.source}</div>
                    <div>categoryId</div><div>{classDebugPayload.categoryId ?? "-"}</div>
                    <div>course.kchId</div><div>{classDebugPayload.course?.kchId || classDebugPayload.entry?.kchId || "-"}</div>
                    <div>classNo</div><div>{classDebugPayload.classItem?.classNo || classDebugPayload.entry?.classNo || "-"}</div>
                    <div>容量</div><div>{classDebugPayload.classItem ? `${classDebugPayload.classItem.selectedCount}/${classDebugPayload.classItem.capacity}` : "-"}</div>
                  </div>
                </details>
                <details className="debug-details">
                  <summary>时间 slots</summary>
                  <pre className="debug-pre">{formatDebugJson(classDebugPayload.classItem?.slots || classDebugPayload.entry?.slots || [])}</pre>
                </details>
                <details className="debug-details">
                  <summary>原始详情 JSON</summary>
                  <pre className="debug-pre">{formatDebugJson(classDebugPayload)}</pre>
                </details>
              </>
            )}
          </div>
          <div className="modal-actions">
            {(modalClass?.entry || modalClass?.item) && (
              <button type="button" id="modal-action" onClick={() => app.timetable.executeModalAction().catch(app.showError)}>{modalActionLabel}</button>
            )}
          </div>
        </div>
      </div>

      <GrabModal />
      <GrabTaskModal />

      <div id="speed-modal" className={cx("modal", { hidden: !snap.speedModalVisible })}>
        <div className="modal-card surface">
          <div className="modal-header">
            <div>
              <div className="eyebrow">Connectivity</div>
              <strong>教务地址测速</strong>
            </div>
            <button type="button" id="speed-close" onClick={app.auth.closeSpeedModal}>关闭</button>
          </div>
          <div id="speed-content" className="modal-content speed-content">
            <table className="speed-table">
              <thead><tr><th>地址</th><th>状态</th><th>耗时</th><th>说明</th></tr></thead>
              <tbody>
                {snap.speedRows.map((row) => (
                  <tr key={row.url} className={row.statusClass}>
                    <td><button type="button" className="link-button" onClick={() => { app.auth.setLoginBaseUrl(row.url); app.auth.closeSpeedModal(); }}>{row.url}</button><div className="dim">{row.label}</div></td>
                    <td>{row.status}</td>
                    <td>{row.ms}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="log-detail-modal" className={cx("modal", { hidden: !snap.logDetailKey })}>
        <div className="modal-card surface">
          <div className="modal-header">
            <div>
              <div className="eyebrow">Request Detail</div>
              <strong id="log-detail-title">{logDetailTitle}</strong>
            </div>
            <button type="button" id="log-detail-close" onClick={app.logs.closeLogDetail}>关闭</button>
          </div>
          <div id="log-detail-content" className="modal-content">
            {logDetailEntry && (
              logDetailEntry.type === "request" ? (
                <>
                  <div className="class-meta"><div>时间</div><div>{logDetailEntry.timestamp}</div></div>
                  <div className="class-meta"><div>类型</div><div>{app.logs.logTypeText(logDetailEntry.type)} / {logDetailEntry.level || "info"}</div></div>
                  <div className="class-meta"><div>状态</div><div>{String(logDetailEntry.status ?? "ERROR")}</div></div>
                  <div className="class-meta"><div>耗时</div><div>{String(logDetailEntry.ms ?? 0)}ms</div></div>
                  <div className="class-meta"><div>URL</div><div>{logDetailEntry.detail?.url || ""}</div></div>
                  <div className="class-meta"><div>请求头</div><div><pre className="log-detail-pre">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.requestHeaders || {})}</pre></div></div>
                  <div className="class-meta"><div>请求体</div><div><pre className="log-detail-pre">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.requestBody || "")}</pre></div></div>
                  <div className="class-meta"><div>响应头</div><div><pre className="log-detail-pre">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.responseHeaders || {})}</pre></div></div>
                  <div className="class-meta"><div>响应体</div><div><pre className="log-detail-pre">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.responseBody || logDetailEntry.detail?.error || "")}</pre></div></div>
                </>
              ) : (
                <>
                  <div className="class-meta"><div>时间</div><div>{logDetailEntry.timestamp}</div></div>
                  <div className="class-meta"><div>类型</div><div>{app.logs.logTypeText(logDetailEntry.type)} / {logDetailEntry.level || "info"}</div></div>
                  <div className="class-meta"><div>消息</div><div><pre className="log-detail-pre">{app.logs.formatLogDetailBlock(logDetailEntry.message || "")}</pre></div></div>
                </>
              )
            )}
          </div>
        </div>
      </div>

      <div id="academic-course-modal" className={cx("modal", { hidden: !snap.academicCourseDetail })}>
        <div className="modal-card surface">
          <div className="modal-header">
            <div>
              <div className="eyebrow">Course Detail</div>
              <strong id="academic-course-title">{snap.academicCourseDetail?.name || "课程基本信息"}</strong>
            </div>
            <button type="button" id="academic-course-close" onClick={app.academic.closeAcademicCourseDetail}>关闭</button>
          </div>
          <div className="modal-content">
            {snap.academicCourseDetail?._loading && <div className="dim" style={{ marginTop: 8 }}>加载课程详情中...</div>}
            {snap.academicCourseDetail?._error && <div className="dim" style={{ marginTop: 8 }}>加载课程详情失败</div>}
            {snap.academicCourseDetail && !snap.academicCourseDetail._loading && !snap.academicCourseDetail._error && snap.academicCourseDetail.name && (
              <>
                <details className="debug-details" open>
                  <summary>课程基本信息</summary>
                  <div className="debug-grid">
                    {snap.academicCourseDetail.name && <><div>课程名称</div><div>{snap.academicCourseDetail.name}</div></>}
                    {snap.academicCourseDetail.englishName && <><div>英文名称</div><div>{snap.academicCourseDetail.englishName}</div></>}
                    {snap.academicCourseDetail.academy && <><div>开课部门</div><div>{snap.academicCourseDetail.academy}</div></>}
                    {snap.academicCourseDetail.credits && <><div>学分</div><div>{snap.academicCourseDetail.credits}</div></>}
                    {snap.academicCourseDetail.category && <><div>课程类别</div><div>{snap.academicCourseDetail.category}</div></>}
                    {snap.academicCourseDetail.ownership && <><div>课程归属</div><div>{snap.academicCourseDetail.ownership}</div></>}
                    {snap.academicCourseDetail.director && <><div>课程负责人</div><div>{snap.academicCourseDetail.director}</div></>}
                    {snap.academicCourseDetail.isPracticeText && <><div>是否实践课</div><div>{snap.academicCourseDetail.isPracticeText}</div></>}
                    {snap.academicCourseDetail.totalHours && <><div>课程学时</div><div>{snap.academicCourseDetail.totalHours}</div></>}
                    {snap.academicCourseDetail.gradeLevel && <><div>成绩录入级别</div><div>{snap.academicCourseDetail.gradeLevel}</div></>}
                    {snap.academicCourseDetail.canAudit && <><div>申请免听</div><div>{snap.academicCourseDetail.canAudit}</div></>}
                    {snap.academicCourseDetail.makeupExam && <><div>统一安排补考</div><div>{snap.academicCourseDetail.makeupExam}</div></>}
                    {snap.academicCourseDetail.quickSelect && <><div>快速选课</div><div>{snap.academicCourseDetail.quickSelect}</div></>}
                    {snap.academicCourseDetail.startYear && <><div>课程启用年级</div><div>{snap.academicCourseDetail.startYear}</div></>}
                    {snap.academicCourseDetail.prerequisites && <><div>预修要求</div><div>{snap.academicCourseDetail.prerequisites}</div></>}
                    {snap.academicCourseDetail.targetAudience && <><div>面向对象</div><div>{snap.academicCourseDetail.targetAudience}</div></>}
                    {snap.academicCourseDetail.introductionZh && <><div>中文课程简介</div><div>{snap.academicCourseDetail.introductionZh}</div></>}
                    {snap.academicCourseDetail.introductionEn && <><div>英文课程简介</div><div>{snap.academicCourseDetail.introductionEn}</div></>}
                    {snap.academicCourseDetail.syllabusZh && <><div>中文教学大纲</div><div>{snap.academicCourseDetail.syllabusZh}</div></>}
                    {snap.academicCourseDetail.syllabusEn && <><div>英文教学大纲</div><div>{snap.academicCourseDetail.syllabusEn}</div></>}
                    {snap.academicCourseDetail.remarks && <><div>备注</div><div>{snap.academicCourseDetail.remarks}</div></>}
                  </div>
                </details>
                {snap.academicCourseDetail.hoursBreakdown?.length > 0 && (
                  <details className="debug-details" open>
                    <summary>学时分配</summary>
                    <table className="academic-course-table" style={{ margin: "4px 0", width: "100%" }}>
                      <thead><tr><th>分项</th><th>周数/周学时</th><th>总学时</th><th>标记</th></tr></thead>
                      <tbody>
                        {snap.academicCourseDetail.hoursBreakdown.map((row, i) => (
                          <tr key={i}>
                            <td>{row.item}</td>
                            <td>{row.weekly || "-"}</td>
                            <td>{row.total || "-"}</td>
                            <td>{row.mark || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div id="academic-raw-modal" className={cx("modal", { hidden: !snap.rawModalVisible })}>
        <div className="modal-card surface grab-card">
          <div className="modal-header">
            <div>
              <div className="eyebrow">Academic Raw Page</div>
              <strong id="academic-raw-title">{snap.rawModalTitle}</strong>
            </div>
            <button type="button" id="academic-raw-close" onClick={app.academic.closeAcademicRawModal}>关闭</button>
          </div>
          <div className="raw-tabs">
            {snap.rawPreviewVisible && (
              <button type="button" className={cx("raw-tab", { active: snap.rawTab === "preview" })} data-raw-tab="preview" onClick={() => app.academic.switchAcademicRawTab("preview")}>渲染</button>
            )}
            <button type="button" className={cx("raw-tab", { active: snap.rawTab === "source" })} data-raw-tab="source" onClick={() => app.academic.switchAcademicRawTab("source")}>原始内容</button>
          </div>
          <div className="modal-content academic-raw-body">
            <iframe id="academic-raw-preview" className={cx("academic-raw-pane academic-raw-frame", { active: true, hidden: snap.rawTab !== "preview" })} title="教务原始网页渲染预览" srcDoc={snap.rawPreviewSrcdoc}></iframe>
            <div id="academic-raw-content" className={cx("academic-raw-pane academic-raw-editor", { hidden: snap.rawTab !== "source" })}></div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const app = useAppContext();
  useEffect(() => {
    app.start().catch(console.error);
  }, [app]);
  return (
    <>
      <LoginOverlay />
      <AppShell />
      <ModalLayer />
      <FloatingMenu />
    </>
  );
}
