import { useCallback, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "../../app/app-context.jsx";
import { state } from "../../app/state.js";
import { useComposingInput } from "../../hooks/use-composing-input.js";
import { cx, filterValue, filterLabel } from "../../shared/utils.js";
import { Button } from "../../components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogHeader, DialogTitle, DialogPanel, DialogFooter } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../components/ui/input-group";
import { Checkbox } from "../../components/ui/checkbox";
import { Textarea } from "../../components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem, SelectGroup, SelectGroupLabel, SelectSeparator } from "../../components/ui/select";
import { Card, CardPanel } from "../../components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionPanel } from "../../components/ui/accordion";
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxPopup, ComboboxStatus, ComboboxValue } from "../../components/ui/combobox";
import { Spinner } from "../../components/ui/spinner";
import { Field, FieldDescription, FieldLabel } from "../../components/ui/field";
import { Search, ChevronRightIcon, Trash2, XIcon } from "lucide-react";

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

function StaticFilterCombobox({ fieldId, label, description, items, value, onChange, placeholder, loading, loadOptions }) {
  const loadedRef = useRef(false);
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
      }} onOpenChange={(open) => {
        if (open && !loadedRef.current) {
          loadedRef.current = true;
          loadOptions?.();
        }
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

export function QueryFilterDialog({ activeSearchTab, app, dropdownTypeMap, emptySearchFilters, defaultFiltersForTab, openFilterPicker, queryConditionCount, hasPendingQueryChanges }) {
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
      <DialogPopup className="course-filter-dialog">
        <DialogHeader>
          <DialogTitle>课程查询</DialogTitle>
          <DialogDescription>关键词和筛选条件统一放在这里；学院、专业、开课学院继续使用独立对话框选择。</DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={(e) => { e.preventDefault(); commitDraft(); runQuery(); }}>
          <DialogPanel className="course-filter-panel" scrollFade={false}>
            <div className="course-filter-grid">
              <Field className="course-filter-keyword">
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
              <StaticFilterCombobox fieldId="query-filter-course-category" label="课程类别" items={optionItems("courseCategoryIds")} value={draft.courseCategoryIds} onChange={(items) => setItems("courseCategoryIds", items)} placeholder="搜索课程类别" loading={isOptionLoading("courseCategoryIds")} loadOptions={() => app.tree.loadFilterOptions("courseCategory", {}, 1, "")} />
              <StaticFilterCombobox fieldId="query-filter-course-nature" label="课程性质" items={optionItems("courseNatureIds")} value={draft.courseNatureIds} onChange={(items) => setItems("courseNatureIds", items)} placeholder="搜索课程性质" loading={isOptionLoading("courseNatureIds")} loadOptions={() => app.tree.loadFilterOptions("courseNature", {}, 1, "")} />
              <StaticFilterCombobox fieldId="query-filter-course-ownership" label="课程归属" items={optionItems("courseOwnershipIds")} value={draft.courseOwnershipIds} onChange={(items) => setItems("courseOwnershipIds", items)} placeholder="搜索课程归属" loading={isOptionLoading("courseOwnershipIds")} loadOptions={() => app.tree.loadFilterOptions("courseOwnership", {}, 1, "")} />
              <StaticFilterCombobox fieldId="query-filter-teaching-mode" label="教学模式" items={optionItems("teachingModeIds")} value={draft.teachingModeIds} onChange={(items) => setItems("teachingModeIds", items)} placeholder="搜索教学模式" loading={isOptionLoading("teachingModeIds")} loadOptions={() => app.tree.loadFilterOptions("teachingMode", {}, 1, "")} />
              <StaticFilterCombobox fieldId="query-filter-weekday" label="上课星期" items={optionItems("weekdayIds")} value={draft.weekdayIds} onChange={(items) => setItems("weekdayIds", items)} placeholder="搜索上课星期" loading={isOptionLoading("weekdayIds")} loadOptions={() => app.tree.loadFilterOptions("weekday", {}, 1, "")} />
              <StaticFilterCombobox fieldId="query-filter-period" label="上课节次" items={optionItems("periodIds")} value={draft.periodIds} onChange={(items) => setItems("periodIds", items)} placeholder="搜索上课节次" loading={isOptionLoading("periodIds")} loadOptions={() => app.tree.loadFilterOptions("period", {}, 1, "")} />
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
              <Button type="submit" className={cx("query-dialog-submit", { "is-dirty": hasPendingQueryChanges() })}><Search aria-hidden="true" />查询</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
