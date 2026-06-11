import { useCallback, useEffect } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "../../app/app-context.jsx";
import { state } from "../../app/state.js";
import { useComposingInput } from "../../hooks/use-composing-input.js";
import { cx, filterValue, filterLabel } from "../../shared/utils.js";
import { TreeView } from "./TreeView.jsx";
import { TimetableView } from "../timetable/TimetableView.jsx";
import { AcademicStatusView, activeAcademicFilterCount } from "../academic/AcademicView.jsx";
import { academicFilterNatures, academicFilterTerms } from "../academic/filters.js";
import { QueryFilterDialog } from "./QueryFilterDialog.jsx";
import { Button } from "../../components/ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuCheckboxItem } from "../../components/ui/menu";
import { Tabs, TabsList, TabsTab, TabsPanel } from "../../components/ui/tabs";
import { Input } from "../../components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../components/ui/input-group";
import { Badge } from "../../components/ui/badge";
import { SlidersHorizontal, Wrench, RefreshCw, Download, CheckSquare, Trash2, Search, Filter, XIcon, RotateCcw, ExternalLink, FileJson } from "lucide-react";
import { Spinner } from "../../components/ui/spinner";

export function WorkspaceTabs() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.treeVersion;
  const academicNodes = snap.academicStatus?.nodes || [];
  const academicNodeCourses = snap.academicNodeCourses || {};
  const activeCourseTab = app.tree.activeCourseTab();
  const activeSearchTab = activeCourseTab?.type === "query" ? activeCourseTab : null;

  const applyResultFilter = useCallback((value) => {
    const tab = activeSearchTab;
    if (!tab) return;
    tab.localFilter = value;
    app.tree.saveTabsState();
    app.tree.applyLocalSearch();
  }, [activeSearchTab, app]);

  const resultFilter = useComposingInput(activeSearchTab?.localFilter || "", applyResultFilter);

  useEffect(() => {
    const closeOutside = (e) => {
      if (e.target.closest?.('[data-slot="menu-trigger"]')) return;
      if (e.target.closest?.('[data-slot="menu-popup"]')) return;
      state.openMenu = null;
    };
    document.addEventListener("click", closeOutside);
    return () => document.removeEventListener("click", closeOutside);
  }, []);

  function openFilterPicker(config) {
    const tab = activeSearchTab;
    if (!tab) return;
    const collegeIds = (tab.draftFilters?.collegeIds || []).map(filterValue).filter(Boolean);
    const parent = config.type === "major" && collegeIds.length === 1 ? { collegeId: collegeIds[0] } : {};
    state.filterPicker = {
      ...config,
      tabId: tab.id,
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

  function hasTreeSelection() {
    return app.tree.selectionStats().total > 0;
  }

  const dropdownTypeMap = {
    courseCategoryIds: "courseCategory",
    courseNatureIds: "courseNature",
    courseOwnershipIds: "courseOwnership",
    teachingModeIds: "teachingMode",
    weekdayIds: "weekday",
    periodIds: "period",
  };

  return (
    <>
      <TabsPanel value="tree" className="flex flex-col overflow-hidden">
        <div className="flex items-end gap-0 border-b border-border bg-muted/50 px-1.5 pt-0.5">
          {snap.courseTabs.map((tab) => {
            const isActive = snap.activeCourseTabId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={cx(
                  "group relative inline-flex items-center gap-0.5 h-7 px-2 text-[12px] font-medium rounded-t-md transition-colors",
                  isActive
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
                onClick={() => app.tree.activateCourseTab(tab.id)}
              >
                <span className="truncate max-w-[150px]">{tab.title}</span>
                {tab.id !== "default" && (
                  <button
                    type="button"
                    aria-label={`关闭${tab.title}`}
                    className="ml-0.5 flex items-center justify-center size-3.5 rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-opacity"
                    onClick={(e) => { e.stopPropagation(); app.tree.closeCourseTab(tab.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); app.tree.closeCourseTab(tab.id); } }}
                  >
                    <XIcon className="size-3" />
                  </button>
                )}
              </button>
            );
          })}
          <button type="button" className="inline-flex items-center justify-center h-7 px-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-card/50 rounded-t-md transition-colors" onClick={app.tree.createSearchTab}>+ 新查询</button>
        </div>
        <div className="flex items-center gap-1 toolbar-tight tree-result-toolbar min-h-[34px] flex-wrap py-[3px] px-1.5 bg-card border-b border-border max-lg:items-stretch">
          <div className="tree-actions flex flex-none items-center gap-1 mr-3.5">
            <Menu open={snap.openMenu === "display-menu"} onOpenChange={(open) => { state.openMenu = open ? "display-menu" : null; }}>
              <MenuTrigger><Button variant="ghost" size="sm"><SlidersHorizontal aria-hidden="true" />显示</Button></MenuTrigger>
              <MenuPopup>
                <MenuCheckboxItem variant="switch" checked={snap.filters.conflict} onCheckedChange={() => { app.tree.runDisplayAction("toggle-conflict"); }}>淡化时间冲突教学班</MenuCheckboxItem>
                <MenuCheckboxItem variant="switch" checked={snap.filters.noCapacity} onCheckedChange={() => { app.tree.runDisplayAction("toggle-no-capacity"); }}>淡化无余量教学班</MenuCheckboxItem>
                <MenuCheckboxItem variant="switch" checked={snap.filters.highlightCapacity} onCheckedChange={() => { app.tree.runDisplayAction("toggle-highlight-capacity"); }}>突出有余量教学班</MenuCheckboxItem>
                <MenuCheckboxItem variant="switch" checked={snap.filters.credit} onCheckedChange={() => { app.tree.runDisplayAction("toggle-credit"); }}>淡化超学分课程</MenuCheckboxItem>
                <MenuCheckboxItem variant="switch" checked={snap.filters.completed} onCheckedChange={() => { app.tree.runDisplayAction("toggle-completed"); }}>淡化已修读课程</MenuCheckboxItem>
              </MenuPopup>
            </Menu>
            <Menu open={snap.openMenu === "feature-menu"} onOpenChange={(open) => { state.openMenu = open ? "feature-menu" : null; }}>
              <MenuTrigger><Button variant="ghost" size="sm"><Wrench aria-hidden="true" />功能</Button></MenuTrigger>
              <MenuPopup>
                <MenuItem onClick={() => { app.tree.runFeatureAction("refresh-categories"); }}><RefreshCw aria-hidden="true" />刷新列表</MenuItem>
                <MenuItem onClick={() => { app.tree.runFeatureAction("export-courses"); }}><Download aria-hidden="true" />导出所有课程</MenuItem>
              </MenuPopup>
            </Menu>
            <QueryFilterDialog activeSearchTab={activeSearchTab} app={app} dropdownTypeMap={dropdownTypeMap} emptySearchFilters={emptySearchFilters} defaultFiltersForTab={defaultFiltersForTab} openFilterPicker={openFilterPicker} queryConditionCount={queryConditionCount} hasPendingQueryChanges={hasPendingQueryChanges} />
            {hasTreeSelection() && (
              <Menu open={snap.openMenu === "selection-menu"} onOpenChange={(open) => { state.openMenu = open ? "selection-menu" : null; }}>
                <MenuTrigger><Button variant="secondary" size="sm"><CheckSquare aria-hidden="true" />选择({app.tree.selectionStats().total})</Button></MenuTrigger>
                <MenuPopup>
                  <MenuItem onClick={() => app.grab.openGrabModalFromSelection()}>添加到抢课任务</MenuItem>
                  <MenuItem onClick={() => app.tree.clearTreeSelection()}><Trash2 aria-hidden="true" />清空全部选择</MenuItem>
                </MenuPopup>
              </Menu>
            )}
          </div>
          <div className="tree-result-filter">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <Filter className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                id="course-result-filter"
                type="search"
                placeholder="筛选"
                {...resultFilter}
                onKeyDown={(e) => { if (e.key === "Escape") applyResultFilter(""); }}
              />
              {activeSearchTab?.localFilter && (
                <InputGroupAddon align="inline-end">
                  <Button aria-label="清除筛选" onClick={() => applyResultFilter("")} size="icon-xs" variant="ghost">
                    <XIcon />
                  </Button>
                </InputGroupAddon>
              )}
            </InputGroup>
          </div>
        </div>
        <TreeView />
      </TabsPanel>

      <TabsPanel value="timetable" className="flex flex-col overflow-hidden">
        <TimetableView />
      </TabsPanel>

      <TabsPanel value="academic" className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 toolbar-tight academic-toolbar min-h-[34px] flex-wrap py-[3px] px-1.5 bg-card border-b border-border">
          <Menu open={snap.openMenu === "academic-filter-menu"} onOpenChange={(open) => { state.openMenu = open ? "academic-filter-menu" : null; }}>
            <MenuTrigger><Button variant="ghost" size="sm" id="academic-filter-button"><Filter aria-hidden="true" />{activeAcademicFilterCount(snap) > 0 ? `筛选(${activeAcademicFilterCount(snap)})` : "筛选"}</Button></MenuTrigger>
            <MenuPopup className="academic-filter-menu">
              <div className="field-group">
                <span className="text-sm font-medium">建议修读时间</span>
                <select
                  id="academic-filter-term"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors"
                  value={snap.academicFilters.suggestedTerm}
                  onChange={(v) => { state.academicFilters.suggestedTerm = v.target.value; app.academic.renderAcademicStatus(); }}
                >
                  <option value="all">全部时间</option>
                  {academicFilterTerms(academicNodes, academicNodeCourses).map((term) => <option key={term} value={term}>{term}</option>)}
                </select>
              </div>
              <div className="field-group">
                <span className="text-sm font-medium">修读状态</span>
                <select
                  id="academic-filter-status"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors"
                  value={snap.academicFilters.statusType}
                  onChange={(v) => { state.academicFilters.statusType = v.target.value; app.academic.renderAcademicStatus(); }}
                >
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
                <span className="text-sm font-medium">课程性质</span>
                <select
                  id="academic-filter-nature"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors"
                  value={snap.academicFilters.courseNature}
                  onChange={(v) => { state.academicFilters.courseNature = v.target.value; app.academic.renderAcademicStatus(); }}
                >
                  <option value="all">全部性质</option>
                  {academicFilterNatures(academicNodes, academicNodeCourses).map((nature) => <option key={nature} value={nature}>{nature}</option>)}
                </select>
              </div>
              <div className="field-group">
                <span className="text-sm font-medium">节点状态</span>
                <select
                  id="academic-filter-node-status"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors"
                  value={snap.academicFilters.nodeStatus}
                  onChange={(v) => { state.academicFilters.nodeStatus = v.target.value; app.academic.renderAcademicStatus(); }}
                >
                  <option value="all">全部节点状态</option>
                  <option value="not_full">学分未满</option>
                  <option value="node_failed">节点未过</option>
                  <option value="full">学分已满</option>
                  <option value="overflow">学分超出</option>
                  <option value="unknown">未知</option>
                </select>
              </div>
              <div className="academic-filter-actions">
                <Button variant="ghost" size="sm" id="academic-filter-reset" onClick={() => {
                  state.academicFilters.suggestedTerm = "all";
                  state.academicFilters.statusType = "all";
                  state.academicFilters.courseNature = "all";
                  state.academicFilters.nodeStatus = "all";
                  app.academic.renderAcademicStatus();
                }}><RotateCcw aria-hidden="true" />重置</Button>
              </div>
            </MenuPopup>
          </Menu>
          <Menu open={snap.openMenu === "academic-more-menu"} onOpenChange={(open) => { state.openMenu = open ? "academic-more-menu" : null; }}>
            <MenuTrigger><Button variant="ghost" size="sm" id="academic-more-button"><Wrench aria-hidden="true" />功能</Button></MenuTrigger>
            <MenuPopup>
              <MenuItem onClick={() => { app.academic.refreshAcademicStatus(true).catch(app.showError); }}><RefreshCw aria-hidden="true" />刷新学业情况</MenuItem>
              <MenuItem onClick={() => { app.academic.refreshAcademicStatus(true, true).catch(app.showError); }}><RefreshCw aria-hidden="true" />递归加载全部课程</MenuItem>
              <MenuItem onClick={() => { app.academic.showAcademicRawPage(); }}><ExternalLink aria-hidden="true" />查看教务原始网页</MenuItem>
              <MenuItem onClick={() => { app.academic.showAcademicDetailJson(); }}><FileJson aria-hidden="true" />查看学业明细原始 JSON</MenuItem>
              <MenuItem onClick={() => { app.academic.exportAcademicDataJson(); }}><Download aria-hidden="true" />导出当前学业数据 JSON</MenuItem>
            </MenuPopup>
          </Menu>
        </div>
        <AcademicStatusView />
      </TabsPanel>
    </>
  );
}
