import { useEffect, useMemo } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "../../app/app-context.jsx";
import { state } from "../../app/state.js";
import { maxJieci, maxWeek, weekdayNames, DETAIL_HEIGHT_KEY } from "../../shared/constants.js";
import { formatWeekRanges, clamp } from "../../shared/utils.js";
import { cx } from "../../shared/utils.js";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuCheckboxItem } from "../../components/ui/menu";
import { Popover, PopoverTrigger, PopoverPopup, PopoverTitle } from "../../components/ui/popover";
import { CalendarX, ChevronLeft, ChevronRight, CircleMinus, Ellipsis, Eye, RefreshCw, SlidersHorizontal, Wrench } from "lucide-react";

const days = [1, 2, 3, 4, 5, 6, 7];
const jieciRows = Array.from({ length: maxJieci }, (_, i) => i + 1);

function _cellItemKey(entry, display) {
  const parts = [entry.name];
  if (display.location) parts.push(entry.location || "");
  if (display.teacher) parts.push(entry.teacherName || "");
  if (display.credit) parts.push(entry.creditText || "");
  return parts.join("|");
}

function _collectWeeks(entry, day, jieci) {
  const weeks = [];
  for (const [week, slotDay, slotJieci] of entry.slots || []) {
    if (slotDay === day && slotJieci === jieci) weeks.push(week);
  }
  return weeks.sort((a, b) => a - b);
}

function cellData(app, day, jieci, display) {
  const currentWeek = new Map();
  const otherWeek = new Map();
  for (const { week, entry } of app.timetable.entriesForCell(day, jieci)) {
    const weeks = _collectWeeks(entry, day, jieci);
    const key = _cellItemKey(entry, display);
    const item = { name: entry.name, location: entry.location || "", credit: entry.creditText || "", teacher: entry.teacherName || "", weeks, time: entry.sksj || "" };
    const map = week === state.displayWeek ? currentWeek : otherWeek;
    if (!map.has(key)) map.set(key, item);
  }
  return { currentWeek: [...currentWeek.values()], otherWeek: [...otherWeek.values()] };
}

function selectedCourseCount(snap) {
  return snap.timetable.selectedCourseIds?.length || snap.timetable.entries?.length || 0;
}

function DetailCourseName({ entry, app }) {
  return (
    <button type="button" className="text-left cursor-pointer hover:underline" onClick={() => { state.modalClass = { entry }; }}>
      <span className="font-medium">
        {entry.name}
        {entry.cxbj === "1" && <Badge variant="destructive" size="sm" className="ml-1 align-middle">重修</Badge>}
      </span><br />
      <span className="text-muted-foreground">{[entry.kchId, entry.classNo].filter(Boolean).join("/")}</span>
    </button>
  );
}

function DetailActionMenu({ entry, app }) {
  return (
    <Menu>
      <MenuTrigger><Button variant="ghost" size="icon-xs" onClick={(e) => e.stopPropagation()}><Ellipsis /></Button></MenuTrigger>
      <MenuPopup>
        <MenuItem onClick={() => { state.modalClass = { entry }; }}><Eye aria-hidden="true" />详细信息</MenuItem>
        <MenuItem disabled={entry.sfktk !== "1"} onClick={() => app.timetable.withdrawSelectedEntry(entry).catch(app.showError)}><CircleMinus aria-hidden="true" />退课</MenuItem>
      </MenuPopup>
    </Menu>
  );
}

function TimetableDetail() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.timetableVersion;

  const entries = snap.timetable.entries;
  const selectedCell = snap.selectedCell;

  if (!entries.length) {
    return <div id="timetable-detail" className="detail-panel flex items-center justify-center text-muted-foreground text-sm"><CalendarX className="inline size-4 mr-1 align-[-2px]" />暂无已选课程</div>;
  }

  let rows;
  if (selectedCell) {
    const grouped = new Map();
    const items = app.timetable.entriesForCell(selectedCell.day, selectedCell.jieci).sort((a, b) => a.week - b.week);
    for (const { week, entry } of items) {
      const key = JSON.stringify([entry.name, entry.creditText, entry.teacherName, entry.teacherTitle, entry.sksj, entry.location, entry.kchId, entry.classNo]);
      const current = grouped.get(key) || { weeks: [], entry };
      current.weeks.push(week);
      grouped.set(key, current);
    }
    rows = [...grouped.values()];
  }

  return (
    <div id="timetable-detail" className="detail-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[22%]">名称</TableHead>
            <TableHead className="w-[72px]">课程类型</TableHead>
            <TableHead className="w-[44px]">学分</TableHead>
            <TableHead className="w-[12%]">教师</TableHead>
            {selectedCell && <TableHead className="w-[8%]">周次</TableHead>}
            <TableHead>时间</TableHead>
            <TableHead>地点</TableHead>
            <TableHead className="w-[72px]">状态</TableHead>
            <TableHead className="w-[34px] p-0 text-center" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(selectedCell ? rows.map((r) => ({ ...r })) : entries.map((entry) => ({ entry }))).map(({ entry, weeks }) => (
            <TableRow key={entry.doJxbId || [entry.kchId, entry.classNo].join("/")}>
              <TableCell><DetailCourseName entry={entry} app={app} /></TableCell>
              <TableCell>{entry.kklxmc || ""}</TableCell>
              <TableCell>{entry.creditText ? <Badge variant="outline">{entry.creditText}</Badge> : ""}</TableCell>
              <TableCell>{entry.teacherName || ""}<br /><span className="text-muted-foreground text-xs">{entry.teacherTitle || ""}</span></TableCell>
              {selectedCell && <TableCell>{formatWeekRanges(weeks)}</TableCell>}
              <TableCell className="whitespace-normal">{entry.sksj || ""}</TableCell>
              <TableCell className="whitespace-normal">{entry.location || ""}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  {entry.zixf === "1"
                    ? <Badge variant="success" size="sm">自选上</Badge>
                    : <Badge variant="warning" size="sm">系统调整</Badge>}
                  {entry.sxbj === "1"
                    ? <Badge variant="default" size="sm">已选上</Badge>
                    : <Badge variant="error" size="sm">待筛选</Badge>}
                </div>
              </TableCell>
              <TableCell className="w-[34px] p-0 text-center"><DetailActionMenu entry={entry} app={app} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TimetableCell({ day, jieci }) {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.timetableVersion;
  const display = snap.timetableDisplay;
  const data = cellData(app, day, jieci, display);
  const active = snap.selectedCell && snap.selectedCell.day === day && snap.selectedCell.jieci === jieci;

  function selectCell() {
    if (active) app.timetable.renderTimetableDetailAll();
    else app.timetable.renderTimetableCellDetail(day, jieci);
  }

  function renderItem(item, index) {
    return (
      <div key={item.jxbId || index}>
        {display.courseName && <div>{item.name}</div>}
        {display.location && item.location && <div className="timetable-cell-location text-xs text-muted-foreground">{item.location}</div>}
        {display.credit && item.credit && <div className="timetable-cell-location text-xs text-muted-foreground">{item.credit}</div>}
        {display.teacher && item.teacher && <div className="timetable-cell-location text-xs text-muted-foreground">{item.teacher}</div>}
        {display.weeks && item.weeks.length ? <div className="timetable-cell-location text-xs text-muted-foreground">{formatWeekRanges(item.weeks)}</div> : null}
        {display.time && item.time && <div className="timetable-cell-location text-xs text-muted-foreground">{item.time}</div>}
      </div>
    );
  }

  const hasContent = !!(data.currentWeek.length || data.otherWeek.length);
  const showItems = data.currentWeek.length ? data.currentWeek : data.otherWeek.slice(0, 2);

  return (
    <td className={cx({ "active-cell": Boolean(active) })}>
      <button type="button" className="timetable-cell-button" onClick={selectCell}>
        {hasContent && (
          <div className={cx({ "timetable-cell-dim opacity-45": !data.currentWeek.length })}>
            {showItems.map(renderItem)}
          </div>
        )}
      </button>
    </td>
  );
}

export function TimetableView() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.timetableVersion;

  function toggleDisplayField(field) {
    state.timetableDisplay[field] = !state.timetableDisplay[field];
    state.openMenu = null;
    app.timetable.renderTimetable();
  }

  useEffect(() => {
    const splitter = document.getElementById("detail-splitter");
    const panel = document.getElementById("tab-timetable");
    if (!splitter || !panel) return;
    let active = false;
    function onPointerDown(e) {
      e.preventDefault();
      active = true;
      splitter.classList.add("is-dragging");
    }
    function onPointerMove(e) {
      if (!active) return;
      const rect = panel.getBoundingClientRect();
      const next = clamp(rect.bottom - e.clientY, 110, Math.max(110, Math.min(window.innerHeight * 0.5, panel.clientHeight - 120)));
      document.documentElement.style.setProperty("--detail-height", `${next}px`);
      window.localStorage.setItem(DETAIL_HEIGHT_KEY, String(next));
    }
    function onPointerUp() {
      if (!active) return;
      active = false;
      splitter.classList.remove("is-dragging");
    }
    splitter.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      splitter.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      splitter.classList.remove("is-dragging");
    };
  }, []);

  function computeWeekCounts() {
    const weekSet = {};
    for (const entry of snap.timetable.entries) {
      for (const [week] of entry.slots || []) {
        if (!weekSet[week]) weekSet[week] = new Set();
        weekSet[week].add(entry.doJxbId || entry.kchId);
      }
    }
    const result = [];
    for (let w = 1; w <= maxWeek; w++) {
      result.push({ week: w, count: weekSet[w]?.size || 0 });
    }
    return result;
  }

  function computeCreditStats() {
    const creditMap = {};
    let localTotal = 0;
    for (const entry of snap.timetable.entries) {
      const credit = parseFloat(entry.creditText);
      if (isNaN(credit)) continue;
      const key = credit.toFixed(1);
      creditMap[key] = (creditMap[key] || 0) + 1;
      localTotal += credit;
    }
    return Object.entries(creditMap)
      .map(([credit, count]) => ({ credit: parseFloat(credit), count }))
      .sort((a, b) => b.credit - a.credit);
  }

  const weekCounts = useMemo(computeWeekCounts, [snap.timetable.entries]);
  const creditBreakdown = useMemo(computeCreditStats, [snap.timetable.entries]);
  const localTotalCredit = useMemo(() => creditBreakdown.reduce((sum, c) => sum + c.credit * c.count, 0), [creditBreakdown]);

  const displayFields = [
    ["courseName", "课程名"],
    ["location", "地点"],
    ["credit", "学分"],
    ["teacher", "教师"],
    ["weeks", "周次"],
    ["time", "时间"],
  ];

  return (
    <div id="tab-timetable" className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 min-h-[34px] py-[3px] px-1.5 bg-card border-b border-border">
        <div className="flex items-center gap-1">
          <Menu open={snap.openMenu === "timetable-display-menu"} onOpenChange={(open) => { state.openMenu = open ? "timetable-display-menu" : null; }}>
            <MenuTrigger><Button variant="ghost" size="sm"><SlidersHorizontal aria-hidden="true" />显示</Button></MenuTrigger>
            <MenuPopup>
              {displayFields.map(([field, label]) => (
                <MenuCheckboxItem key={field} variant="switch" checked={snap.timetableDisplay[field]} onCheckedChange={() => toggleDisplayField(field)}>
                  {label}
                </MenuCheckboxItem>
              ))}
            </MenuPopup>
          </Menu>
          <Menu open={snap.openMenu === "timetable-feature-menu"} onOpenChange={(open) => { state.openMenu = open ? "timetable-feature-menu" : null; }}>
            <MenuTrigger><Button variant="ghost" size="sm"><Wrench aria-hidden="true" />功能</Button></MenuTrigger>
            <MenuPopup>
              <MenuItem onClick={() => { app.tree.refreshTimetable().catch(app.showError); }}><RefreshCw aria-hidden="true" />刷新已选课程</MenuItem>
            </MenuPopup>
          </Menu>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" id="week-prev" onClick={() => { state.displayWeek = Math.max(1, state.displayWeek - 1); app.timetable.renderTimetable(); }}><ChevronLeft aria-hidden="true" />上一周</Button>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>第 {snap.displayWeek}/{maxWeek} 周</PopoverTrigger>
            <PopoverPopup align="start">
              <PopoverTitle>每周课程数</PopoverTitle>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left pr-4 pb-1 font-medium">周次</th>
                    <th className="text-right pb-1 font-medium">课程数</th>
                  </tr>
                </thead>
                <tbody>
                  {weekCounts.map(({ week, count }) => (
                    <tr key={week} className={week === snap.displayWeek ? "font-semibold text-foreground" : "text-muted-foreground"}>
                      <td className="pr-4 py-0.5">{week === snap.displayWeek ? <span className="inline-flex items-center gap-1"><Badge>{week}</Badge><span className="sr-only">当前周</span></span> : week}</td>
                      <td className="text-right py-0.5">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PopoverPopup>
          </Popover>
          <Button variant="outline" size="sm" id="week-next" onClick={() => { state.displayWeek = Math.min(maxWeek, state.displayWeek + 1); app.timetable.renderTimetable(); }}>下一周<ChevronRight aria-hidden="true" /></Button>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>已选{selectedCourseCount(snap)}门课程</PopoverTrigger>
            <PopoverPopup align="start">
            </PopoverPopup>
          </Popover>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>学分{localTotalCredit.toFixed(1)}/{snap.timetable.maxCredit || 32}</PopoverTrigger>
            <PopoverPopup align="start">
              <PopoverTitle>学分分布</PopoverTitle>
              <div className="text-xs text-muted-foreground mt-1 mb-2">本地计算总学分：{localTotalCredit.toFixed(1)}</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left pr-4 pb-1 font-medium">学分</th>
                    <th className="text-right pb-1 font-medium">课程数</th>
                  </tr>
                </thead>
                <tbody>
                  {creditBreakdown.map(({ credit, count }) => (
                    <tr key={credit} className="text-muted-foreground">
                      <td className="pr-4 py-0.5">{credit.toFixed(1)}</td>
                      <td className="text-right py-0.5">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PopoverPopup>
          </Popover>
        </div>
      </div>
      <div className="timetable-wrap">
        <table id="timetable-table">
          <thead>
            <tr>
              <th className="w-[36px] min-w-[32px] max-w-[40px]">节次</th>
              {weekdayNames.map((name) => <th key={name}>{name}</th>)}
            </tr>
          </thead>
          <tbody>
            {jieciRows.map((jieci) => (
              <tr key={jieci}>
                <th className="w-[36px] min-w-[32px] max-w-[40px] text-center">{jieci}</th>
                {days.map((day) => <TimetableCell key={day} day={day} jieci={jieci} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div id="detail-splitter" className="splitter splitter-horizontal relative z-[2] select-none touch-none bg-background flex-none h-1.5 self-stretch cursor-row-resize" aria-hidden="true"></div>
      <TimetableDetail />
    </div>
  );
}
