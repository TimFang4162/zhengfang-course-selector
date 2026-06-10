import { useCallback, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "./app/app-context.jsx";
import { state, isSelectedClass } from "./app/state.js";
import { useComposingInput } from "./hooks/use-composing-input.js";
import { TreeView } from "./features/tree/TreeView.jsx";
import { TimetableView } from "./features/timetable/TimetableView.jsx";
import { AcademicStatusView, activeAcademicFilterCount } from "./features/academic/AcademicView.jsx";
import { academicFilterNatures, academicFilterTerms } from "./features/academic/filters.js";
import { GrabModal, GrabTaskModal } from "./features/grab/GrabView.jsx";
import { formatDebugJson, cx } from "./shared/utils.js";
import { Button } from "./components/ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuCheckboxItem } from "./components/ui/menu";
import { apiPost } from "./api/client.js";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogHeader, DialogTitle, DialogPanel, DialogFooter } from "./components/ui/dialog";
import { Tabs, TabsList, TabsTab, TabsPanel } from "./components/ui/tabs";
import { Input } from "./components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./components/ui/input-group";
import { Checkbox } from "./components/ui/checkbox";
import { Textarea } from "./components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem, SelectGroup, SelectGroupLabel, SelectSeparator } from "./components/ui/select";
import { Card, CardPanel } from "./components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionPanel } from "./components/ui/accordion";
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxPopup, ComboboxStatus, ComboboxValue } from "./components/ui/combobox";
import { Spinner } from "./components/ui/spinner";
import { Field, FieldDescription, FieldLabel } from "./components/ui/field";
import { Activity, BookOpen, Braces, CalendarDays, Check, CheckSquare, ChevronRightIcon, Clock, Download, Ellipsis, ExternalLink, Eye, FileJson, Filter, FolderTree, Gauge, GraduationCap, Inbox, KeyRound, PanelRightClose, PanelRightOpen, Play, Plus, RefreshCw, Repeat, RotateCcw, ScrollText, Search, SlidersHorizontal, Square, Trash2, User, Wrench, XIcon } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Label } from "./components/ui/label";

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
  const defaultTab = savedAvailable ? "saved" : "password";
  const activeTab = (tab === "saved" && !savedAvailable) ? defaultTab : tab || defaultTab;
  const customUrl = useComposingInput(snap.auth.customBaseUrl, useCallback((v) => { state.auth.customBaseUrl = v; }, []));
  const studentNumber = useComposingInput(snap.auth.studentNumber, useCallback((v) => { state.auth.studentNumber = v; }, []));
  const password = useComposingInput(snap.auth.password, useCallback((v) => { state.auth.password = v; }, []));
  const cookieInput = useComposingInput(snap.auth.cookieInput, useCallback((v) => { state.auth.cookieInput = v; }, []));

  return (
    <div id="login-overlay" className={cx("fixed inset-0 z-20 flex items-center justify-center bg-[var(--vscode-overlay-bg)]", { "!hidden": !snap.auth.loginVisible })}>
      <Card className="relative w-[420px]">
        <CardPanel>
        {snap.bootstrap?.authenticated && (
          <Button
            variant="ghost"
            className="absolute top-1.5 right-1.5 min-w-7 h-7 p-0"
            onClick={() => { state.auth.loginVisible = false; }}
            aria-label="关闭"
          ><XIcon /></Button>
        )}
        <div className="grid gap-1.5 mb-3">
          <Label htmlFor="base-url">教务地址</Label>
          <Select id="base-url" value={snap.auth.baseUrl} onValueChange={(v) => {
            if (v === "__test__") {
              state.auth.testAddressJustClicked = true;
              app.auth.testLoginAddresses().catch(app.showError);
              return;
            }
            state.auth.baseUrl = v;
          }}>
            <SelectTrigger id="base-url" className="flex-1"><SelectValue placeholder="选择教务地址">{(value) => {
              if (!value || value === "__test__" || value === "__custom__") return null;
              return value.replace(/^https?:\/\//, "");
            }}</SelectValue></SelectTrigger>
            <SelectPopup>
              <SelectGroup>
                <SelectGroupLabel>教务地址</SelectGroupLabel>
                {(snap.bootstrap?.addressChoices || []).map((item) => <SelectItem key={item.url} value={item.url}>{item.url.replace(/^https?:\/\//, "")} ({item.description}{item.latencyMs ? `, ${item.latencyMs}ms` : ""})</SelectItem>)}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectGroupLabel>操作</SelectGroupLabel>
                <SelectItem value="__test__"><span className="flex items-center gap-2"><Gauge className="size-4" /><span className="truncate">测速</span></span></SelectItem>
                <SelectItem value="__custom__">{snap.auth.customBaseUrl || "自定义地址"}</SelectItem>
              </SelectGroup>
            </SelectPopup>
          </Select>
          <Input
            id="custom-base-url"
            className={cx({ "!hidden": snap.auth.baseUrl !== "__custom__" })}
            type="url"
            placeholder="https://jwxt.example.edu.cn"
            {...customUrl}
          />
        </div>
        <div className="mb-3">
          <Label className="gap-1.5"><Checkbox id="disable-ssl-verify" checked={snap.auth.disableSslVerify} onCheckedChange={(checked) => { state.auth.disableSslVerify = checked; app.auth.updateSslVerifySetting().catch(app.showError); }} /> 禁用 SSL 验证</Label>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => { state.auth.loginTab = v; }}>
          <TabsList>
            <TabsTab value="saved" disabled={!savedAvailable}>一键登录</TabsTab>
            <TabsTab value="password">账号密码</TabsTab>
            <TabsTab value="cookie">Cookie</TabsTab>
          </TabsList>
        </Tabs>

        {activeTab === "saved" && (
          <div className="flex flex-col">
            {savedAvailable && snap.bootstrap?.savedCredentials && (
              <div className="flex items-center gap-1.5 justify-between mb-3 p-2.5 border border-border bg-background">
                <span className="text-muted-foreground">已保存账号 {snap.bootstrap.savedCredentials.masked}</span>
                <Button variant="default" id="saved-login-button" onClick={() => app.auth.doLogin(true).catch(app.showError)}>以 {snap.bootstrap.savedCredentials.masked} 登录</Button>
              </div>
            )}
          </div>
        )}

        {activeTab === "password" && (
          <div className="flex flex-col">
            <div className="grid gap-1.5 mb-3">
              <Label htmlFor="student-number">学号</Label>
              <Input id="student-number" autoComplete="username" {...studentNumber} />
            </div>
            <div className="grid gap-1.5 mb-3">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" autoComplete="current-password" {...password} />
            </div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <Label className="gap-1.5"><Checkbox id="save-creds" checked={snap.auth.saveCredentials} onCheckedChange={(checked) => { state.auth.saveCredentials = checked; }} /> 保存本次凭据</Label>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="default" id="login-button" onClick={() => app.auth.doLogin().catch(app.showError)}>账号密码登录</Button>
              <span id="login-status" className="text-muted-foreground">{snap.auth.loginStatus}</span>
            </div>
          </div>
        )}

        {activeTab === "cookie" && (
          <div className="flex flex-col">
            <div className="grid gap-1.5 mb-3">
              <Label htmlFor="cookie-input">Cookie</Label>
              <Textarea
                id="cookie-input"
                placeholder={`从浏览器 DevTools → Application → Cookies 复制，或粘贴 document.cookie 的值，或直接粘贴请求头里的 Cookie 行。\n支持格式：name=value; name2=value2，或多行 name=value，或带 Cookie: 前缀。\n同名 cookie（如双 JSESSIONID）会按 path=/jwglxt 和 path=/ 自动拆分注入。`}
                {...cookieInput}
                spellCheck={false}
              />
            </div>
            <div className="-mt-1 mb-3 text-[11px] leading-[1.5] text-muted-foreground">提示：教务系统的 JSESSIONID 是必需的；WebVPN 地址还需 wpsvn 系列 cookie。同名 cookie 会自动按 path 区分。Cookie 仅保存在本进程内存中。</div>
            <div className="flex items-center gap-1">
              <Button variant="default" id="cookie-login-button" onClick={() => app.auth.doLoginWithCookie().catch(app.showError)}>Cookie 登录</Button>
              <span id="login-status" className="text-muted-foreground">{snap.auth.loginStatus}</span>
            </div>
          </div>
        )}
      </CardPanel>
    </Card>
    </div>
  );
}

function summarizeFilterValues(filters, field) {
  const values = filters?.[field] || [];
  if (!values.length) return "全部";
  if (values.length === 1) return filterLabel(values[0]);
  return `${values.length} 项`;
}

function describeFilterValues(filters, field) {
  const values = filters?.[field] || [];
  if (!values.length) return "全部";
  return values.map(filterLabel).join(", ");
}

function cloneDialogFilters(filters) {
  if (!filters) return null;
  const cloned = {};
  for (const [key, value] of Object.entries(filters)) {
    cloned[key] = Array.isArray(value) ? value.map((item) => (item && typeof item === "object" ? { ...item } : item)) : value;
  }
  return cloned;
}

function normalizeComboboxItems(items) {
  return (items || []).map((item) => ({
    value: String(item.value),
    label: item.displayLabel || item.label || String(item.value),
  }));
}

function StaticFilterCombobox({ fieldId, label, description, items, value, onChange, placeholder, loading }) {
  const normalizedItems = normalizeComboboxItems(items);
  const selectedItems = (value || []).map((selected) => {
    const targetValue = String(filterValue(selected));
    return normalizedItems.find((item) => item.value === targetValue) || {
      value: targetValue,
      label: filterLabel(selected) || targetValue,
    };
  });

  return (
    <Field>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Combobox items={normalizedItems} multiple value={selectedItems} onValueChange={(next) => {
        const values = Array.isArray(next) ? next : [];
        onChange(values.map((item) => ({ value: item.value, label: item.label })));
      }}>
        <ComboboxChips>
          <ComboboxValue>
            {(selected = []) => (
              <>
                {selected.map((item) => (
                  <ComboboxChip key={item.value} aria-label={item.label}>
                    {item.label}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput id={fieldId} aria-label={label} placeholder={selected.length ? undefined : placeholder} />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxPopup>
          {loading && !normalizedItems.length ? (
            <ComboboxStatus>
              <Spinner className="mr-1.5 size-4" />
              加载中...
            </ComboboxStatus>
          ) : (
            <>
              <ComboboxEmpty>无匹配选项</ComboboxEmpty>
              <ComboboxList>
                {(item) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </>
          )}
        </ComboboxPopup>
      </Combobox>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function QueryFilterDialog({ activeSearchTab, app, dropdownTypeMap, emptySearchFilters, defaultFiltersForTab, openFilterPicker, queryConditionCount, hasPendingQueryChanges }) {
  const snap = useSnapshot(state);
  const [open, setOpen] = useState(false);
  const snapshotRef = useRef(null);
  const committedRef = useRef(false);

  const proxyTab = state.courseTabs.find((tab) => tab.id === snap.activeCourseTabId && tab.type === "query");
  const snapTab = snap.courseTabs.find((tab) => tab.id === snap.activeCourseTabId && tab.type === "query");
  const draft = snapTab?.draftFilters || {};
  const queryValue = snapTab?.query || "";

  const commitQuery = useCallback((v) => {
    if (!proxyTab) return;
    proxyTab.query = v;
    app.tree.saveTabsState();
    app.tree.renderTree();
  }, [proxyTab, app]);
  const commitList = useCallback((field, text) => {
    if (!proxyTab) return;
    proxyTab.draftFilters[field] = text.split(/[ ,，]+/).map((item) => item.trim()).filter(Boolean);
    app.tree.saveTabsState();
    app.tree.renderTree();
  }, [proxyTab, app]);

  const queryField = useComposingInput(queryValue, commitQuery);
  const gradeField = useComposingInput((draft.gradeIds || []).map(filterValue).join(","), useCallback((v) => { commitList("gradeIds", v); }, [commitList]));
  const classNameField = useComposingInput((draft.classNames || []).map(filterValue).join(","), useCallback((v) => { commitList("classNames", v); }, [commitList]));
  const creditField = useComposingInput((draft.credits || []).map(filterValue).join(","), useCallback((v) => { commitList("credits", v); }, [commitList]));

  useEffect(() => {
    if (!open) return;
    for (const type of Object.values(dropdownTypeMap)) {
      if (!snap.filterOptions[type]?.loaded) {
        app.tree.loadFilterOptions(type, {}, 1, "").catch(app.showError);
      }
    }
  }, [app, dropdownTypeMap, open, snap.filterOptions]);

  if (!proxyTab?.draftFilters) return null;

  function snapshotCurrentState() {
    snapshotRef.current = {
      query: proxyTab.query || "",
      draftFilters: cloneDialogFilters(proxyTab.draftFilters),
    };
    committedRef.current = false;
  }

  function restoreSnapshot() {
    if (!snapshotRef.current) return;
    proxyTab.query = snapshotRef.current.query;
    proxyTab.draftFilters = cloneDialogFilters(snapshotRef.current.draftFilters);
    app.tree.saveTabsState();
    app.tree.renderTree();
  }

  function handleOpenChange(nextOpen) {
    if (nextOpen) {
      snapshotCurrentState();
      setOpen(true);
      return;
    }
    if (!committedRef.current) restoreSnapshot();
    setOpen(false);
  }

  function setItems(field, items) {
    proxyTab.draftFilters[field] = items;
    app.tree.saveTabsState();
    app.tree.renderTree();
  }

  function commitDraft() {
    committedRef.current = true;
    app.tree.saveTabsState();
    app.tree.renderTree();
    setOpen(false);
  }

  function runQuery() {
    committedRef.current = true;
    app.tree.runSearchTab(proxyTab, true).catch(app.showError);
    setOpen(false);
  }

  function resetDraft() {
    proxyTab.query = "";
    proxyTab.draftFilters = defaultFiltersForTab(proxyTab);
    app.tree.saveTabsState();
    app.tree.renderTree();
  }

  const optionItems = (field) => snap.filterOptions[dropdownTypeMap[field]]?.items || [];
  const isOptionLoading = (field) => snap.loadingFilterOptions.has(dropdownTypeMap[field]);
  const selectedCollegeIds = (draft.collegeIds || []).map(filterValue).filter(Boolean);
  const majorDescription = selectedCollegeIds.length === 1
    ? describeFilterValues(draft, "majorIds")
    : "选择 1 个学院可缩小专业范围";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button type="button" variant={hasPendingQueryChanges() ? "secondary" : "ghost"} size="sm" onClick={() => handleOpenChange(true)}>
        <Search aria-hidden="true" />{`查询(${queryConditionCount()})`}
      </Button>
      <DialogPopup className="course-filter-dialog" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>课程查询</DialogTitle>
          <DialogDescription>关键词和筛选条件统一放在这里；学院、专业、开课学院继续使用独立对话框选择。</DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={(e) => { e.preventDefault(); commitDraft(); runQuery(); }}>
          <DialogPanel className="pt-0" scrollFade={false}>
            <div className="course-filter-grid">
              <Field className="col-span-full">
                <FieldLabel htmlFor="query-filter-keyword">关键词</FieldLabel>
                <Input id="query-filter-keyword" type="search" placeholder="课程号/课程名称/教学班名称/教师姓名/教师工号..." {...queryField} />
                <FieldDescription>支持课程号、课程名、教学班名、教师姓名或工号。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="query-filter-college">学院</FieldLabel>
                <Button id="query-filter-college" type="button" variant="outline" className="justify-between font-normal" onClick={() => openFilterPicker({ type: "college", field: "collegeIds", title: "学院" })} title={describeFilterValues(draft, "collegeIds")}>
                  <span className="truncate">{summarizeFilterValues(draft, "collegeIds")}</span>
                  <ChevronRightIcon className="size-4 shrink-0 opacity-60" />
                </Button>
                <FieldDescription>{describeFilterValues(draft, "collegeIds")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="query-filter-major">专业</FieldLabel>
                <Button id="query-filter-major" type="button" variant="outline" className="justify-between font-normal" onClick={() => openFilterPicker({ type: "major", field: "majorIds", title: "专业" })} title={majorDescription}>
                  <span className="truncate">{summarizeFilterValues(draft, "majorIds")}</span>
                  <ChevronRightIcon className="size-4 shrink-0 opacity-60" />
                </Button>
                <FieldDescription>{majorDescription}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="query-filter-teaching-college">开课学院</FieldLabel>
                <Button id="query-filter-teaching-college" type="button" variant="outline" className="justify-between font-normal" onClick={() => openFilterPicker({ type: "teachingCollege", field: "teachingCollegeIds", title: "开课学院" })} title={describeFilterValues(draft, "teachingCollegeIds")}>
                  <span className="truncate">{summarizeFilterValues(draft, "teachingCollegeIds")}</span>
                  <ChevronRightIcon className="size-4 shrink-0 opacity-60" />
                </Button>
                <FieldDescription>{describeFilterValues(draft, "teachingCollegeIds")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="query-filter-grade">年级</FieldLabel>
                <Input id="query-filter-grade" type="text" placeholder="例如 2023,2024" {...gradeField} />
                <FieldDescription>支持逗号或空格分隔多个值</FieldDescription>
              </Field>
              <StaticFilterCombobox fieldId="query-filter-course-category" label="课程类别" items={optionItems("courseCategoryIds")} value={draft.courseCategoryIds} onChange={(items) => setItems("courseCategoryIds", items)} placeholder="搜索课程类别" loading={isOptionLoading("courseCategoryIds")} />
              <StaticFilterCombobox fieldId="query-filter-course-nature" label="课程性质" items={optionItems("courseNatureIds")} value={draft.courseNatureIds} onChange={(items) => setItems("courseNatureIds", items)} placeholder="搜索课程性质" loading={isOptionLoading("courseNatureIds")} />
              <StaticFilterCombobox fieldId="query-filter-course-ownership" label="课程归属" items={optionItems("courseOwnershipIds")} value={draft.courseOwnershipIds} onChange={(items) => setItems("courseOwnershipIds", items)} placeholder="搜索课程归属" loading={isOptionLoading("courseOwnershipIds")} />
              <StaticFilterCombobox fieldId="query-filter-teaching-mode" label="教学模式" items={optionItems("teachingModeIds")} value={draft.teachingModeIds} onChange={(items) => setItems("teachingModeIds", items)} placeholder="搜索教学模式" loading={isOptionLoading("teachingModeIds")} />
              <StaticFilterCombobox fieldId="query-filter-weekday" label="上课星期" items={optionItems("weekdayIds")} value={draft.weekdayIds} onChange={(items) => setItems("weekdayIds", items)} placeholder="搜索上课星期" loading={isOptionLoading("weekdayIds")} />
              <StaticFilterCombobox fieldId="query-filter-period" label="上课节次" items={optionItems("periodIds")} value={draft.periodIds} onChange={(items) => setItems("periodIds", items)} placeholder="搜索上课节次" loading={isOptionLoading("periodIds")} />
              <Field>
                <FieldLabel htmlFor="query-filter-class-name">教学班</FieldLabel>
                <Input id="query-filter-class-name" type="text" placeholder="支持多个教学班名称" {...classNameField} />
                <FieldDescription>支持逗号或空格分隔多个值</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="query-filter-credit">学分</FieldLabel>
                <Input id="query-filter-credit" type="text" placeholder="例如 2,3,4" {...creditField} />
                <FieldDescription>按教务系统原值匹配</FieldDescription>
              </Field>
              <StaticFilterCombobox fieldId="query-filter-retake" label="是否重修" items={[{ value: "1", label: "是" }, { value: "0", label: "否" }]} value={draft.retake} onChange={(items) => setItems("retake", items)} placeholder="选择是否重修" />
              <StaticFilterCombobox fieldId="query-filter-has-capacity" label="有无余量" items={[{ value: "1", label: "有" }, { value: "0", label: "无" }]} value={draft.hasCapacity} onChange={(items) => setItems("hasCapacity", items)} placeholder="选择余量状态" />
            </div>
          </DialogPanel>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={resetDraft}><Trash2 aria-hidden="true" />清空</Button>
            <div className="flex items-center gap-2">
              <DialogClose render={<Button type="button" variant="ghost" />}>取消</DialogClose>
              <Button type="submit" className={cx("query-dialog-submit", { "is-dirty": hasPendingQueryChanges() })}><Search aria-hidden="true" />查询</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function WorkspaceTabs() {
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
        <div className="flex flex-wrap items-center gap-2 justify-between min-h-[34px] py-[3px] px-1.5 bg-card border-b border-border max-lg:items-stretch">
          <div className="flex flex-none items-center gap-1 mr-3.5">
            <Menu open={snap.openMenu === "display-menu"} onOpenChange={(open) => { state.openMenu = open ? "display-menu" : null; }}>
              <MenuTrigger><Button variant="ghost" size="sm"><SlidersHorizontal aria-hidden="true" />显示</Button></MenuTrigger>
              <MenuPopup>
                <MenuCheckboxItem checked={snap.filters.conflict} onCheckedChange={() => { app.tree.runDisplayAction("toggle-conflict"); }}>淡化时间冲突教学班</MenuCheckboxItem>
                <MenuCheckboxItem checked={snap.filters.noCapacity} onCheckedChange={() => { app.tree.runDisplayAction("toggle-no-capacity"); }}>淡化无余量教学班</MenuCheckboxItem>
                <MenuCheckboxItem checked={snap.filters.highlightCapacity} onCheckedChange={() => { app.tree.runDisplayAction("toggle-highlight-capacity"); }}>突出有余量教学班</MenuCheckboxItem>
                <MenuCheckboxItem checked={snap.filters.credit} onCheckedChange={() => { app.tree.runDisplayAction("toggle-credit"); }}>淡化超学分课程</MenuCheckboxItem>
                <MenuCheckboxItem checked={snap.filters.completed} onCheckedChange={() => { app.tree.runDisplayAction("toggle-completed"); }}>淡化已修读课程</MenuCheckboxItem>
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
          <div className="ml-auto min-w-[150px] max-w-[240px] max-lg:flex-1 max-lg:max-w-none max-lg:ml-0">
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
        <div className="flex flex-wrap items-center gap-2 justify-start min-h-[34px] py-[3px] px-1.5 bg-card border-b border-border">
          <Menu open={snap.openMenu === "academic-filter-menu"} onOpenChange={(open) => { state.openMenu = open ? "academic-filter-menu" : null; }}>
            <MenuTrigger><Button variant="ghost" size="sm" id="academic-filter-button">{activeAcademicFilterCount(snap) > 0 ? `筛选(${activeAcademicFilterCount(snap)})` : "筛选"}</Button></MenuTrigger>
            <MenuPopup className="academic-filter-menu">
              <div>
                <Label htmlFor="academic-filter-term">建议修读时间</Label>
                <Select id="academic-filter-term" value={snap.academicFilters.suggestedTerm} onValueChange={(v) => { state.academicFilters.suggestedTerm = v; app.academic.renderAcademicStatus(); }}>
                  <SelectTrigger id="academic-filter-term"><SelectValue /></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="all">全部时间</SelectItem>
                    {academicFilterTerms(academicNodes, academicNodeCourses).map((term) => <SelectItem key={term} value={term}>{term}</SelectItem>)}
                  </SelectPopup>
                </Select>
              </div>
              <div>
                <Label htmlFor="academic-filter-status">修读状态</Label>
                <Select id="academic-filter-status" value={snap.academicFilters.statusType} onValueChange={(v) => { state.academicFilters.statusType = v; app.academic.renderAcademicStatus(); }}>
                  <SelectTrigger id="academic-filter-status"><SelectValue /></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="studying">在修</SelectItem>
                    <SelectItem value="passed">已修</SelectItem>
                    <SelectItem value="failed">未过</SelectItem>
                    <SelectItem value="not_started">未修</SelectItem>
                    <SelectItem value="substituted">课程替代</SelectItem>
                    <SelectItem value="warning_ignored">预警不审核</SelectItem>
                    <SelectItem value="unknown">未知</SelectItem>
                  </SelectPopup>
                </Select>
              </div>
              <div>
                <Label htmlFor="academic-filter-nature">课程性质</Label>
                <Select id="academic-filter-nature" value={snap.academicFilters.courseNature} onValueChange={(v) => { state.academicFilters.courseNature = v; app.academic.renderAcademicStatus(); }}>
                  <SelectTrigger id="academic-filter-nature"><SelectValue /></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="all">全部性质</SelectItem>
                    {academicFilterNatures(academicNodes, academicNodeCourses).map((nature) => <SelectItem key={nature} value={nature}>{nature}</SelectItem>)}
                  </SelectPopup>
                </Select>
              </div>
              <div>
                <Label htmlFor="academic-filter-node-status">节点状态</Label>
                <Select id="academic-filter-node-status" value={snap.academicFilters.nodeStatus} onValueChange={(v) => { state.academicFilters.nodeStatus = v; app.academic.renderAcademicStatus(); }}>
                  <SelectTrigger id="academic-filter-node-status"><SelectValue /></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="all">全部节点状态</SelectItem>
                    <SelectItem value="not_full">学分未满</SelectItem>
                    <SelectItem value="node_failed">节点未过</SelectItem>
                    <SelectItem value="full">学分已满</SelectItem>
                    <SelectItem value="overflow">学分超出</SelectItem>
                    <SelectItem value="unknown">未知</SelectItem>
                  </SelectPopup>
                </Select>
              </div>
              <div className="flex justify-end mt-2">
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
    <aside className="right-pane min-h-0 overflow-hidden flex flex-col h-full bg-background max-lg:min-h-[320px] max-lg:border-t max-lg:border-border">
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-background">
        <div className="flex items-center justify-between gap-2 min-h-[35px] px-[7px] py-[3px] pl-[10px] bg-[var(--vscode-panel-header-bg)] border-b border-[var(--vscode-border)]">
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] uppercase tracking-[0.08em] text-[var(--vscode-fg-muted)]"><ScrollText className="size-3.5" />日志</span>
          <div className=" flex items-center gap-1">
            <Select id="log-filter-type" value={snap.logFilterType} onValueChange={(v) => { state.logFilterType = v; }}>
              <SelectTrigger id="log-filter-type" aria-label="日志类型"><SelectValue /></SelectTrigger>
              <SelectPopup>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="request">请求</SelectItem>
                <SelectItem value="business">业务</SelectItem>
                <SelectItem value="debug">调试</SelectItem>
                <SelectItem value="system">系统</SelectItem>
              </SelectPopup>
            </Select>
            <Button variant="ghost" size="sm" id="clear-logs" onClick={() => app.logs.clearLogs().catch(app.showError)}><Trash2 aria-hidden="true" />清空</Button>
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
              <span className="text-muted-foreground/70 whitespace-nowrap">{app.logs.logTimestampText(item, index)}</span>
              <span className="log-type text-muted-foreground/70 text-[11px] whitespace-nowrap">{app.logs.logTypeLabel(item.type)}</span>
              <span className="log-message min-w-0 text-muted-foreground whitespace-pre-wrap break-all">{app.logs.describeLogEntry(item)}</span>
            </button>
          ))}
        </div>
      </div>
      <div id="activity-splitter" className="splitter splitter-horizontal relative z-[2] select-none touch-none bg-background flex-none w-1.5 cursor-row-resize" aria-hidden="true"></div>
      <div className="activity-shell flex flex-col overflow-hidden bg-background">
        <div className="flex items-center justify-between gap-2 min-h-[35px] px-[7px] py-[3px] pl-[10px] bg-[var(--vscode-panel-header-bg)] border-b border-[var(--vscode-border)]">
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] uppercase tracking-[0.08em] text-[var(--vscode-fg-muted)]"><Activity className="size-3.5" />活动</span>
          <div className=" flex items-center gap-1">
            <Menu>
              <MenuTrigger><Button variant="ghost" id="activity-add" onClick={(e) => e.stopPropagation()}><Plus /></Button></MenuTrigger>
              <MenuPopup>
                <MenuItem onClick={() => app.grab.openManualGrabModal()}>添加抢课任务</MenuItem>
              </MenuPopup>
            </Menu>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <Table className="w-full border-collapse table-fixed text-[13px]">
            <TableHeader>
              <TableRow><TableHead className="sticky top-0 bg-card border-b border-border-subtle px-2 py-[5px] text-left align-top text-muted-foreground font-medium">任务</TableHead><TableHead className="sticky top-0 bg-card border-b border-border-subtle px-2 py-[5px] text-left align-top text-muted-foreground font-medium">状态</TableHead><TableHead className="sticky top-0 bg-card border-b border-border-subtle px-2 py-[5px] text-left align-top text-muted-foreground font-medium">进度</TableHead></TableRow>
            </TableHeader>
            <TableBody id="activity-list">
              {snap.activities.length ? snap.activities.map((item) => (
                <TableRow key={item.id} className={cx({ "is-clickable": Boolean(state.grabTasks[item.id]) })} onClick={() => { const task = state.grabTasks[item.id]; if (task) app.grab.showGrabTaskDetail(task); }}>
                  <TableCell className="border-b border-border-subtle px-2 py-[5px] text-left align-top overflow-hidden text-ellipsis whitespace-nowrap">{item.name}</TableCell>
                  <TableCell className="border-b border-border-subtle px-2 py-[5px] text-left align-top overflow-hidden text-ellipsis whitespace-nowrap">{item.status}</TableCell>
                  <TableCell className="border-b border-border-subtle px-2 py-[5px] text-left align-top overflow-hidden text-ellipsis whitespace-nowrap">{item.progress} {snap.grabTasks[item.id] && (
  <Menu>
    <MenuTrigger><Button variant="ghost" size="icon-xs" className="float-right min-w-[22px] min-h-5 px-[5px] border-transparent bg-transparent" onClick={(e) => e.stopPropagation()}><Ellipsis /></Button></MenuTrigger>
    <MenuPopup>
      {snap.grabTasks[item.id] && <MenuItem onClick={() => app.grab.showGrabTaskDetail(snap.grabTasks[item.id])}><Eye aria-hidden="true" />详情</MenuItem>}
      <MenuItem onClick={() => { apiPost("/api/grab/tasks/start", { id: item.id }).then(() => app.grab.pollGrabTasks()).catch(app.showError); }}><Play aria-hidden="true" />启动</MenuItem>
      <MenuItem onClick={() => { apiPost("/api/grab/tasks/stop", { id: item.id }).then(() => app.grab.pollGrabTasks()).catch(app.showError); }}><Square aria-hidden="true" />停止</MenuItem>
    </MenuPopup>
  </Menu>
)}</TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan="3" className="text-muted-foreground"><Inbox className="inline size-4 mr-1 align-[-2px]" />暂无活动</TableCell></TableRow>}
            </TableBody>
          </Table>
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

  function runAddressAction(value) {
    if (value === "__test__") {
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

  return (
    <div className="h-dvh overflow-hidden">
      <div className="main-layout h-dvh overflow-hidden">
        <main className="left-pane min-h-0 overflow-hidden flex flex-col h-full gap-0 p-0 bg-card border-r border-border">
          <Tabs className="flex-1 min-h-0" value={snap.activeTab} onValueChange={(v) => app.tree.switchTab(v)}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch min-h-[35px] bg-muted border-b border-border">
              <TabsList variant="underline" className="p-0">
                <TabsTab value="tree"><FolderTree className="size-4" />课程树</TabsTab>
                <TabsTab value="timetable"><CalendarDays className="size-4" />当前课表</TabsTab>
                <TabsTab value="academic"><GraduationCap className="size-4" />学业情况</TabsTab>
              </TabsList>
              <div className="flex items-center gap-1 py-[3px] px-1.5 max-lg:flex-wrap">
                <Select id="workspace-base-url" aria-label="教务地址" value={snap.auth.baseUrl} onValueChange={runAddressAction}>
                  <SelectTrigger id="workspace-base-url" className="max-w-[220px] min-h-[26px] text-[13px]"><SelectValue>{(value) => {
                    if (!value || value === "__test__" || value === "__custom__") return snap.auth.baseUrl;
                    return value.replace(/^https?:\/\//, "");
                  }}</SelectValue></SelectTrigger>
                  <SelectPopup>
                    <SelectGroup>
                      <SelectGroupLabel>教务地址</SelectGroupLabel>
                      {(snap.bootstrap?.addressChoices || []).map((item) => <SelectItem key={item.url} value={item.url}>{item.url.replace(/^https?:\/\//, "")} ({item.description}{item.latencyMs ? `, ${item.latencyMs}ms` : ""})</SelectItem>)}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectGroupLabel>操作</SelectGroupLabel>
                      <SelectItem value="__test__"><span className="flex items-center gap-2"><Gauge className="size-4" /><span className="truncate">测速</span></span></SelectItem>
                      <SelectItem value="__custom__">{snap.auth.customBaseUrl || "自定义地址"}</SelectItem>
                    </SelectGroup>
                  </SelectPopup>
                </Select>
                <Select id="account-action" aria-label="账号操作" onValueChange={(value) => {
                  if (value === "show-login") {
                    app.auth.setLoginBaseUrl(state.auth.baseUrl);
                    state.auth.loginVisible = true;
                  }
                }}>
                  <SelectTrigger id="account-action" className="max-w-[220px] min-h-[26px] text-[13px]"><SelectValue>{accountLabel()}</SelectValue></SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="show-login"><span className="flex items-center gap-2"><Repeat className="size-4" /><span className="truncate">切换账号</span></span></SelectItem>
                  </SelectPopup>
                </Select>
                <Button variant="ghost" id="toggle-sidebar" className="min-w-7 min-h-[26px] py-0.5 px-[7px]" title="折叠侧栏" onClick={app.tree.toggleSidebar}>{snap.sidebarCollapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}</Button>
              </div>
            </div>
            <WorkspaceTabs />
          </Tabs>
        </main>

        <div id="main-splitter" className="splitter splitter-vertical relative z-[2] select-none touch-none bg-background cursor-col-resize max-lg:hidden" aria-hidden="true"></div>

        <RightPane />
      </div>
    </div>
  );
}

function ModalLayer() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  const picker = snap.filterPicker;

  const pickerSearch = useComposingInput(picker?.query || "", useCallback((v) => { state.filterPicker.query = v; }, []));

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
    const proxyPicker = state.filterPicker;
    if (!proxyPicker) return;
    const selected = proxyPicker.selected;
    const idx = selected.findIndex((item) => filterValue(item) === value);
    if (idx >= 0) selected.splice(idx, 1);
    else selected.push({ value, label: label || value });
  };
  const applyPicker = () => {
    const proxyPicker = state.filterPicker;
    if (!proxyPicker) return;
    const tab = state.courseTabs.find((t) => t.id === proxyPicker.tabId);
    if (tab?.type === "query") {
      tab.draftFilters[proxyPicker.field] = [...proxyPicker.selected];
      if (proxyPicker.field === "collegeIds") tab.draftFilters.majorIds = [];
    }
    state.filterPicker = null;
    app.tree.saveTabsState();
    app.tree.renderTree();
  };
  const pickerLoading = snap.loadingFilterOptions.has(pickerKeyStr);

  return (
    <>
      <Dialog open={!!picker} onOpenChange={(open) => { if (!open) state.filterPicker = null; }}>
        <DialogPopup className="sm:max-w-2xl">
          <DialogHeader>
            <span className="text-muted-foreground">筛选</span>
            <DialogTitle>{picker?.title || "..."}</DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-3" scrollFade={false}>
            <form className="flex gap-1.5" onSubmit={(e) => {
              e.preventDefault();
              state.filterPicker.page = 1;
              app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, 1, state.filterPicker.query).catch(app.showError);
            }}>
              <Input type="search" className="flex-1" placeholder="搜索选项" {...pickerSearch} onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                state.filterPicker.page = 1;
                app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, 1, state.filterPicker.query).catch(app.showError);
              }} />
              <Button variant="ghost" size="sm" type="submit" disabled={pickerLoading}>
                {pickerLoading && <Spinner />}
                {pickerLoading ? "搜索中..." : "搜索"}
              </Button>
            </form>
            {pickerSelectedItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">已选</span>
                {pickerSelectedItems.map((item) => (
                  <Badge key={item.value} variant="secondary" render={<button type="button" />} onClick={() => togglePickerValue(item.value)}>
                    {item.label}
                    <XIcon className="-me-0.5" />
                  </Badge>
                ))}
              </div>
            )}
            <div className="max-h-[min(420px,55vh)] overflow-auto">
              {!pickerOptions.length ? (
                !pickerLoading && <div className="py-2 px-2 text-muted-foreground text-sm">无选项，输入关键词后搜索或稍后重试</div>
              ) : pickerIsMajor ? (
                <Table className="w-full min-w-max border-collapse text-xs">
                  <TableHeader><TableRow><TableHead className="w-[34px] text-center"></TableHead><TableHead className="text-muted-foreground font-semibold">专业代码</TableHead><TableHead className="text-muted-foreground font-semibold">专业名称</TableHead><TableHead className="text-muted-foreground font-semibold">学院</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {pickerOptions.map((item) => (
                      <TableRow key={item.value} onClick={() => togglePickerValue(item.value, item.displayLabel || item.label)} className={cx("hover:bg-accent", { "bg-accent/50": pickerOptionSelected(item.value) })}>
                        <TableCell className="w-[34px] text-center"><Checkbox checked={pickerOptionSelected(item.value)} onClick={(e) => e.stopPropagation()} onCheckedChange={() => togglePickerValue(item.value, item.displayLabel || item.label)} /></TableCell>
                        <TableCell>{item.raw?.zyh || item.value}</TableCell>
                        <TableCell>{item.raw?.zymc || item.label}</TableCell>
                        <TableCell>{item.raw?.jgmc || ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                pickerOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-1.5 py-0.5 min-h-7 text-left text-sm hover:bg-accent"
                    onClick={() => togglePickerValue(item.value, item.displayLabel || item.label)}
                  >
                    <Checkbox checked={pickerOptionSelected(item.value)} onClick={(e) => e.stopPropagation()} onCheckedChange={() => togglePickerValue(item.value, item.displayLabel || item.label)} />
                    <span className="flex-1 truncate">{item.displayLabel || item.label}</span>
                    <span className="text-muted-foreground text-xs shrink-0">{item.value}</span>
                  </button>
                ))
              )}
            </div>
            {pickerHasMore && (
              <Button variant="ghost" size="sm" className="self-start text-info" disabled={pickerLoading} onClick={() => app.tree.loadFilterOptions(state.filterPicker.type, state.filterPicker.parent || {}, pickerPage + 1, state.filterPicker.query).catch(app.showError)}>
                {pickerLoading && <Spinner />}
                加载更多
              </Button>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { state.filterPicker.selected = []; }}><Trash2 aria-hidden="true" />清空</Button>
            <Button variant="default" onClick={applyPicker}>应用</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog open={!!modalClass} onOpenChange={(open) => { if (!open) app.timetable.closeClassModal(); }}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div id="modal-content" className="min-h-0 p-2.5 overflow-y-auto bg-background border border-border">
              {modalClass?.entry && (
                <>
                  <div className="class-meta"><div>课程</div><div>{modalClass.entry.name}</div></div>
                  <div className="class-meta"><div>课程号</div><div>{modalClass.entry.kchId || "-"}</div></div>
                  <div className="class-meta"><div>教学班</div><div>{modalClass.entry.classNo || "-"}</div></div>
                  <div className="class-meta"><div>学分</div><div>{modalClass.entry.creditText || "-"}</div></div>
                  <div className="class-meta"><div>上课教师</div><div>{modalClass.entry.teacherName || ""} <span className="text-muted-foreground">{modalClass.entry.teacherTitle || ""}</span></div></div>
                  <div className="class-meta"><div>上课时间</div><div>{modalClass.entry.sksj || "-"}</div></div>
                  <div className="class-meta"><div>教学地点</div><div>{modalClass.entry.location || "-"}</div></div>
                </>
              )}
              {modalClass?.item && (
                <>
                  <div className="class-meta"><div>教学班</div><div>{modalClass.item.classNo}</div></div>
                  <div className="class-meta"><div>课程号</div><div>{modalClass.item.kchId || modalClass?.course?.kchId || "-"}</div></div>
                  <div className="class-meta"><div>上课教师</div><div>{modalClass.item.teacherName || ""} <span className="text-muted-foreground">{modalClass.item.teacherTitle || ""}</span></div></div>
                  <div className="class-meta"><div>上课时间</div><div>{modalClass.item.sksj || ""}</div></div>
                  <div className="class-meta"><div>教学地点</div><div>{modalClass.item.location || ""}</div></div>
                  <div className="class-meta"><div>开课学院</div><div>{modalClass.item.academy || "-"}</div></div>
                  <div className="class-meta"><div>选课备注</div><div>{modalClass.item.remark || "-"}</div></div>
                  <div className="class-meta"><div>课程性质</div><div>{modalClass.item.courseProperty || "-"}</div></div>
                  <div className="class-meta"><div>已选/容量</div><div>{modalClass.item.selectedCount}/{modalClass.item.capacity}</div></div>
                  {classConflictEntries.length > 0 && (
                    <div className="class-meta"><div>冲突课程</div><div>{classConflictEntries.map((entry) => <div key={entry.doJxbId}>{entry.name} <span className="text-muted-foreground">{entry.classNo || "-"} / {entry.sksj || "-"}</span></div>)}</div></div>
                  )}
                  {snap.teacherDetail === null && (
                    <Button variant="link" size="sm" className="mt-2" onClick={() => app.timetable.loadTeacherDetail(modalClass.item.teacherJghId, modalClass.item.kchId || modalClass?.course?.kchId)}>查看教师详情</Button>
                  )}
                  {snap.teacherDetail?._loading && <div className="text-muted-foreground mt-2">加载教师详情中...</div>}
                  {snap.teacherDetail && !snap.teacherDetail._loading && (
                    <Accordion>
                      <AccordionItem value="teacher-detail" defaultOpen>
                        <AccordionTrigger><span className="inline-flex items-center gap-1.5"><User className="size-4" />教师详情</span></AccordionTrigger>
                        <AccordionPanel>
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
                      ) : <div className="text-muted-foreground mt-1.5">暂无教师详情数据</div>}
                        </AccordionPanel>
                      </AccordionItem>
                    </Accordion>
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
                    <Button variant="link" size="sm" className="mt-2" onClick={() => app.timetable.loadCourseDetail(modalClass.course.kchId)}>查看课程详情</Button>
                  )}
                  {snap.courseDetail?._loading && <div className="text-muted-foreground mt-2">加载课程详情中...</div>}
                  {snap.courseDetail && !snap.courseDetail._loading && (
                    <Accordion>
                      <AccordionItem value="course-detail" defaultOpen>
                        <AccordionTrigger><span className="inline-flex items-center gap-1.5"><BookOpen className="size-4" />课程基本信息</span></AccordionTrigger>
                        <AccordionPanel>
                        {snap.courseDetail.name || snap.courseDetail.code ? (
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
                      ) : <div className="text-muted-foreground mt-1.5">暂无课程详情数据</div>}
                        </AccordionPanel>
                      </AccordionItem>
                    </Accordion>
                  )}
                </>
              )}
              {classDebugPayload && (
                <Accordion>
                  <AccordionItem value="grab-fields">
                    <AccordionTrigger><span className="inline-flex items-center gap-1.5"><KeyRound className="size-4" />抢课 / 选课关键字段</span></AccordionTrigger>
                    <AccordionPanel>
                    <div className="debug-grid">
                      <div>来源</div><div>{classDebugPayload.source}</div>
                      <div>categoryId</div><div>{classDebugPayload.categoryId ?? "-"}</div>
                      <div>course.kchId</div><div>{classDebugPayload.course?.kchId || classDebugPayload.entry?.kchId || "-"}</div>
                      <div>classNo</div><div>{classDebugPayload.classItem?.classNo || classDebugPayload.entry?.classNo || "-"}</div>
                      <div>容量</div><div>{classDebugPayload.classItem ? `${classDebugPayload.classItem.selectedCount}/${classDebugPayload.classItem.capacity}` : "-"}</div>
                    </div>
                    </AccordionPanel>
                  </AccordionItem>
                  <AccordionItem value="time-slots">
                    <AccordionTrigger><span className="inline-flex items-center gap-1.5"><Clock className="size-4" />时间 slots</span></AccordionTrigger>
                    <AccordionPanel>
                    <pre className="max-h-[260px] mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-foreground">{formatDebugJson(classDebugPayload.classItem?.slots || classDebugPayload.entry?.slots || [])}</pre>


                    </AccordionPanel>
                  </AccordionItem>
                  <AccordionItem value="raw-json">
                    <AccordionTrigger><span className="inline-flex items-center gap-1.5"><Braces className="size-4" />原始详情 JSON</span></AccordionTrigger>
                    <AccordionPanel>
                    <pre className="max-h-[260px] mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-foreground">{formatDebugJson(classDebugPayload)}</pre>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          </DialogPanel>
          <DialogFooter>
            {(modalClass?.entry || modalClass?.item) && (
              <Button variant="default" id="modal-action" onClick={() => app.timetable.executeModalAction().catch(app.showError)}>{modalActionLabel}</Button>
            )}
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <GrabModal />
      <GrabTaskModal />

      <Dialog open={!!snap.speedModalVisible} onOpenChange={(open) => { if (!open) app.auth.closeSpeedModal(); }}>
        <DialogPopup>
          <DialogHeader>
            <span className="text-muted-foreground">Connectivity</span>
            <DialogTitle>教务地址测速</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div id="speed-content" className="max-h-[min(60vh,520px)] overflow-y-auto">
              <Table className="speed-table w-full border-collapse text-xs">
                <TableHeader><TableRow><TableHead className="py-[7px] px-2 border-b border-border text-left align-top">地址</TableHead><TableHead className="py-[7px] px-2 border-b border-border text-left align-top">状态</TableHead><TableHead className="py-[7px] px-2 border-b border-border text-left align-top">耗时</TableHead><TableHead className="py-[7px] px-2 border-b border-border text-left align-top">说明</TableHead></TableRow></TableHeader>
                <TableBody>
                  {snap.speedRows.map((row) => (
                    <TableRow key={row.url} className={row.statusClass}>
                      <TableCell className="py-[7px] px-2 border-b border-border text-left align-top"><Button variant="link" size="sm" className="min-h-0 p-0 border-0 text-info bg-transparent text-left" onClick={() => { app.auth.setLoginBaseUrl(row.url); app.auth.closeSpeedModal(); }}>{row.url}</Button><div className="text-muted-foreground">{row.label}</div></TableCell>
                      <TableCell className="py-[7px] px-2 border-b border-border text-left align-top">{row.status}</TableCell>
                      <TableCell className="py-[7px] px-2 border-b border-border text-left align-top">{row.ms}</TableCell>
                      <TableCell className="py-[7px] px-2 border-b border-border text-left align-top">{row.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <Dialog open={!!snap.logDetailKey} onOpenChange={(open) => { if (!open) app.logs.closeLogDetail(); }}>
        <DialogPopup>
          <DialogHeader>
            <span className="text-muted-foreground">Request Detail</span>
            <DialogTitle>{logDetailTitle}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div id="log-detail-content" className="min-h-0 p-2.5 overflow-y-auto bg-background border border-border">
              {logDetailEntry && (
                logDetailEntry.type === "request" ? (
                  <>
                    <div className="class-meta"><div>时间</div><div>{logDetailEntry.timestamp}</div></div>
                    <div className="class-meta"><div>类型</div><div>{app.logs.logTypeText(logDetailEntry.type)} / {logDetailEntry.level || "info"}</div></div>
                    <div className="class-meta"><div>状态</div><div>{String(logDetailEntry.status ?? "ERROR")}</div></div>
                    <div className="class-meta"><div>耗时</div><div>{String(logDetailEntry.ms ?? 0)}ms</div></div>
                    <div className="class-meta"><div>URL</div><div>{logDetailEntry.detail?.url || ""}</div></div>
                    <div className="class-meta"><div>请求头</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.requestHeaders || {})}</pre></div></div>
                    <div className="class-meta"><div>请求体</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.requestBody || "")}</pre></div></div>
                    <div className="class-meta"><div>响应头</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.responseHeaders || {})}</pre></div></div>
                    <div className="class-meta"><div>响应体</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.detail?.responseBody || logDetailEntry.detail?.error || "")}</pre></div></div>
                  </>
                ) : (
                  <>
                    <div className="class-meta"><div>时间</div><div>{logDetailEntry.timestamp}</div></div>
                    <div className="class-meta"><div>类型</div><div>{app.logs.logTypeText(logDetailEntry.type)} / {logDetailEntry.level || "info"}</div></div>
                    <div className="class-meta"><div>消息</div><div><pre className="max-h-[220px] m-0 p-2 overflow-auto border border-border-subtle bg-background whitespace-pre-wrap break-all font-mono text-xs leading-[1.45] text-foreground">{app.logs.formatLogDetailBlock(logDetailEntry.message || "")}</pre></div></div>
                  </>
                )
              )}
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <Dialog open={!!snap.academicCourseDetail} onOpenChange={(open) => { if (!open) app.academic.closeAcademicCourseDetail(); }}>
        <DialogPopup>
          <DialogHeader>
            <span className="text-muted-foreground">Course Detail</span>
            <DialogTitle>{snap.academicCourseDetail?.name || "课程基本信息"}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            {snap.academicCourseDetail?._loading && <div className="text-muted-foreground mt-2">加载课程详情中...</div>}
            {snap.academicCourseDetail?._error && <div className="text-muted-foreground mt-2">加载课程详情失败</div>}
            {snap.academicCourseDetail && !snap.academicCourseDetail._loading && !snap.academicCourseDetail._error && snap.academicCourseDetail.name && (
              <Accordion>
                <AccordionItem value="academic-course-detail" defaultOpen>
                   <AccordionTrigger><span className="inline-flex items-center gap-1.5"><BookOpen className="size-4" />课程基本信息</span></AccordionTrigger>
                  <AccordionPanel>
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
                  </AccordionPanel>
                </AccordionItem>
                {snap.academicCourseDetail.hoursBreakdown?.length > 0 && (
                  <AccordionItem value="hours-breakdown" defaultOpen>
                    <AccordionTrigger>学时分配</AccordionTrigger>
                    <AccordionPanel>
                    <Table className="my-1 w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>分项</TableHead>
                          <TableHead>周数/周学时</TableHead>
                          <TableHead>总学时</TableHead>
                          <TableHead>标记</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {snap.academicCourseDetail.hoursBreakdown.map((row) => (
                          <TableRow key={`${row.item}-${row.weekly || "-"}-${row.total || "-"}-${row.mark || "-"}`}>
                            <TableCell>{row.item}</TableCell>
                            <TableCell>{row.weekly || "-"}</TableCell>
                            <TableCell>{row.total || "-"}</TableCell>
                            <TableCell>{row.mark || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </AccordionPanel>
                  </AccordionItem>
                )}
              </Accordion>
            )}
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <Dialog open={!!snap.rawModalVisible} onOpenChange={(open) => { if (!open) app.academic.closeAcademicRawModal(); }}>
        <DialogPopup className="grab-card">
          <DialogHeader>
            <span className="text-muted-foreground">Academic Raw Page</span>
            <DialogTitle>{snap.rawModalTitle}</DialogTitle>
          </DialogHeader>
          <Tabs value={snap.rawTab} onValueChange={(v) => app.academic.switchAcademicRawTab(v)}>
            <TabsList>
              {snap.rawPreviewVisible && (
                <TabsTab value="preview">渲染</TabsTab>
              )}
              <TabsTab value="source">原始内容</TabsTab>
            </TabsList>
          </Tabs>
          <DialogPanel>
            <div className="academic-raw-body">
              <iframe id="academic-raw-preview" className={cx("academic-raw-pane academic-raw-frame", { active: true, "!hidden": snap.rawTab !== "preview" })} title="教务原始网页渲染预览" srcDoc={snap.rawPreviewSrcdoc}></iframe>
              <div id="academic-raw-content" className={cx("academic-raw-pane academic-raw-editor", { "!hidden": snap.rawTab !== "source" })}></div>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
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
    </>
  );
}
