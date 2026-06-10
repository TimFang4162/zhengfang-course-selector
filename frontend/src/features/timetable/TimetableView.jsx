import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "../../app/app-context.jsx";
import { state } from "../../app/state.js";
import { maxJieci, maxWeek, weekdayNames, DETAIL_HEIGHT_KEY } from "../../shared/constants.js";
import { formatWeekRanges, clamp } from "../../shared/utils.js";
import { cx } from "../../shared/utils.js";
import { Button } from "../../components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuCheckboxItem } from "../../components/ui/menu";

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

function DetailCourseName({ entry }) {
  return (
    <>
      {entry.name}<br />
      <span className="text-muted-foreground">{[entry.kchId, entry.classNo].filter(Boolean).join("/")}</span>
    </>
  );
}

function TimetableDetail() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.timetableVersion;

  const display = snap.timetableDisplay;
  const entries = snap.timetable.entries;
  const selectedCell = snap.selectedCell;

  if (selectedCell) {
    const grouped = new Map();
    const items = app.timetable.entriesForCell(selectedCell.day, selectedCell.jieci).sort((a, b) => a.week - b.week);
    for (const { week, entry } of items) {
      const key = JSON.stringify([entry.name, entry.creditText, entry.teacherName, entry.teacherTitle, entry.sksj, entry.location, entry.kchId, entry.classNo]);
      const current = grouped.get(key) || { weeks: [], entry };
      current.weeks.push(week);
      grouped.set(key, current);
    }
    const rows = [...grouped.values()];
    return (
      <div id="timetable-detail" className="detail-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%]">名称</TableHead>
              <TableHead className="w-[50px]">学分</TableHead>
              <TableHead className="w-[15%]">教师</TableHead>
              <TableHead className="w-[12%]">周次</TableHead>
              <TableHead>时间</TableHead>
              <TableHead>地点</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ weeks, entry }) => (
              <TableRow key={[entry.kchId, entry.classNo].join("/")}>
                <TableCell><DetailCourseName entry={entry} /></TableCell>
                <TableCell>{entry.creditText || ""}</TableCell>
                <TableCell>{entry.teacherName || ""}<br /><span className="text-muted-foreground text-xs">{entry.teacherTitle || ""}</span></TableCell>
                <TableCell>{formatWeekRanges(weeks)}</TableCell>
                <TableCell className="whitespace-normal">{entry.sksj || ""}</TableCell>
                <TableCell className="whitespace-normal">{entry.location || ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!entries.length) {
    return <div id="timetable-detail" className="detail-panel flex items-center justify-center text-muted-foreground text-sm">暂无已选课程</div>;
  }

  return (
    <div id="timetable-detail" className="detail-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30%]">名称</TableHead>
            <TableHead className="w-[50px]">学分</TableHead>
            <TableHead className="w-[15%]">教师</TableHead>
            <TableHead>时间</TableHead>
            <TableHead>地点</TableHead>
            <TableHead className="w-[34px] p-0 text-center" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry, index) => (
            <TableRow key={entry.doJxbId || index}>
              <TableCell><DetailCourseName entry={entry} /></TableCell>
              <TableCell>{entry.creditText || ""}</TableCell>
              <TableCell>{entry.teacherName || ""}<br /><span className="text-muted-foreground text-xs">{entry.teacherTitle || ""}</span></TableCell>
              <TableCell className="whitespace-normal">{entry.sksj || ""}</TableCell>
              <TableCell className="whitespace-normal">{entry.location || ""}</TableCell>
              <TableCell className="w-[34px] p-0 text-center">
                <Menu>
                  <MenuTrigger><Button variant="ghost" size="icon-xs" onClick={(e) => e.stopPropagation()}>⋯</Button></MenuTrigger>
                  <MenuPopup>
                    <MenuItem onClick={() => { state.modalClass = { entry }; }}>详细信息</MenuItem>
                    <MenuItem onClick={() => app.timetable.withdrawSelectedEntry(entry).catch(app.showError)}>退课</MenuItem>
                  </MenuPopup>
                </Menu>
              </TableCell>
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
      <div className="flex items-center gap-1 toolbar-tight min-h-[34px] flex-wrap py-[3px] px-1.5 bg-card border-b border-border">
        <Button variant="outline" size="sm" id="week-prev" onClick={() => { state.displayWeek = Math.max(1, state.displayWeek - 1); app.timetable.renderTimetable(); }}>上一周</Button>
        <span id="week-label">第 {snap.displayWeek}/{maxWeek} 周</span>
        <Button variant="outline" size="sm" id="week-next" onClick={() => { state.displayWeek = Math.min(maxWeek, state.displayWeek + 1); app.timetable.renderTimetable(); }}>下一周</Button>
        <span id="week-selected">已选{selectedCourseCount(snap)}门课程</span>
        <span id="week-credit">学分{(snap.timetable.currentCredit || 0).toFixed(1)}/{snap.timetable.maxCredit || 32}</span>
        <Menu open={snap.openMenu === "timetable-display-menu"} onOpenChange={(open) => { state.openMenu = open ? "timetable-display-menu" : null; }}>
          <MenuTrigger><Button variant="ghost" size="sm">显示</Button></MenuTrigger>
          <MenuPopup>
            {displayFields.map(([field, label]) => (
              <MenuCheckboxItem key={field} checked={snap.timetableDisplay[field]} onCheckedChange={() => toggleDisplayField(field)}>
                {label}
              </MenuCheckboxItem>
            ))}
          </MenuPopup>
        </Menu>
        <Menu open={snap.openMenu === "timetable-feature-menu"} onOpenChange={(open) => { state.openMenu = open ? "timetable-feature-menu" : null; }}>
          <MenuTrigger><Button variant="ghost" size="sm">功能</Button></MenuTrigger>
          <MenuPopup>
            <MenuItem onClick={() => { app.tree.refreshTimetable().catch(app.showError); }}>刷新已选课程</MenuItem>
          </MenuPopup>
        </Menu>
      </div>
      <div className="timetable-wrap">
        <table id="timetable-table">
          <thead>
            <tr>
              <th>节次</th>
              {weekdayNames.map((name) => <th key={name}>{name}</th>)}
            </tr>
          </thead>
          <tbody>
            {jieciRows.map((jieci) => (
              <tr key={jieci}>
                <th>{jieci}</th>
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
