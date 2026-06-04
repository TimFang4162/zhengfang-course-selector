import { For, Show } from "solid-js";
import { useAppContext } from "../../app/app-context.jsx";
import { state } from "../../app/state.js";
import { maxJieci, maxWeek, weekdayNames } from "../../shared/constants.js";
import { formatWeekRanges } from "../../shared/utils.js";

const days = [1, 2, 3, 4, 5, 6, 7];
const jieciRows = Array.from({ length: maxJieci }, (_, index) => index + 1);

function cellData(app, day, jieci) {
  state.timetableVersion;
  const currentWeekNames = new Set();
  const otherWeekNames = new Set();
  for (const { week, entry } of app.timetable.entriesForCell(day, jieci)) {
    if (week === state.displayWeek) currentWeekNames.add(entry.name);
    else otherWeekNames.add(entry.name);
  }
  return { currentWeekNames: [...currentWeekNames], otherWeekNames: [...otherWeekNames] };
}

function currentWeekCount(app) {
  state.timetableVersion;
  let count = 0;
  for (let jieci = 1; jieci <= maxJieci; jieci += 1) {
    for (let day = 1; day <= 7; day += 1) {
      count += cellData(app, day, jieci).currentWeekNames.length;
    }
  }
  return count;
}

function selectedCourseCount() {
  return state.timetable.selectedCourseIds?.length || state.timetable.entries?.length || 0;
}

function DetailCourseName(props) {
  return (
    <>
      {props.entry.name}<br />
      <span class="dim">{[props.entry.kchId, props.entry.classNo].filter(Boolean).join("/")}</span>
    </>
  );
}

function allDetailRows() {
  state.timetableVersion;
  return state.timetable.entries;
}

function selectedCellDetailRows(app) {
  state.timetableVersion;
  if (!state.selectedCell) return [];
  const grouped = new Map();
  const items = app.timetable.entriesForCell(state.selectedCell.day, state.selectedCell.jieci).sort((a, b) => a.week - b.week);
  for (const { week, entry } of items) {
    const key = JSON.stringify([entry.name, entry.creditText, entry.teacherName, entry.teacherTitle, entry.sksj, entry.location, entry.kchId, entry.classNo]);
    const current = grouped.get(key) || { weeks: [], entry };
    current.weeks.push(week);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function TimetableDetail() {
  const app = useAppContext();

  return (
    <div id="timetable-detail" class="detail-panel">
      <Show
        when={state.selectedCell}
        fallback={(
          <Show when={allDetailRows().length} fallback={<div class="dim">暂无已选课程</div>}>
            <table class="detail-table">
              <thead><tr><th>名称</th><th>学分</th><th>教师</th><th>时间</th><th>地点</th><th></th></tr></thead>
              <tbody>
                <For each={allDetailRows()}>
                  {(entry, index) => (
                    <tr>
                      <td><DetailCourseName entry={entry} /></td>
                      <td>{entry.creditText || ""}</td>
                      <td>{entry.teacherName || ""}<br /><span class="dim">{entry.teacherTitle || ""}</span></td>
                      <td>{entry.sksj || ""}</td>
                      <td>{entry.location || ""}</td>
                      <td><button type="button" class="detail-more" onClick={(event) => { event.stopPropagation(); app.timetable.openSelectedCourseMenu(index(), event.currentTarget); }}>⋯</button></td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        )}
      >
        <table class="detail-table">
          <thead><tr><th>名称</th><th>学分</th><th>教师</th><th>周次</th><th>时间</th><th>地点</th></tr></thead>
          <tbody>
            <For each={selectedCellDetailRows(app)}>
              {({ weeks, entry }) => (
                <tr>
                  <td><DetailCourseName entry={entry} /></td>
                  <td>{entry.creditText || ""}</td>
                  <td>{entry.teacherName || ""}<br /><span class="dim">{entry.teacherTitle || ""}</span></td>
                  <td>{formatWeekRanges(weeks)}</td>
                  <td>{entry.sksj || ""}</td>
                  <td>{entry.location || ""}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );
}

function TimetableCell(props) {
  const app = useAppContext();
  const data = () => cellData(app, props.day, props.jieci);
  const active = () => state.selectedCell && state.selectedCell.day === props.day && state.selectedCell.jieci === props.jieci;

  function selectCell() {
    if (active()) app.timetable.renderTimetableDetailAll();
    else app.timetable.renderTimetableCellDetail(props.day, props.jieci);
  }

  return (
    <td classList={{ "active-cell": Boolean(active()) }}>
      <button type="button" class="timetable-cell-button" onClick={selectCell}>
        <Show when={data().currentWeekNames.length} fallback={<Show when={data().otherWeekNames.length}><div class="cell-dim">{data().otherWeekNames.slice(0, 2).join("、")}</div></Show>}>
          {data().currentWeekNames.join("\n")}
        </Show>
      </button>
    </td>
  );
}

export function TimetableView() {
  const app = useAppContext();

  function toggleMenu(event) {
    event.stopPropagation();
    state.openMenu = state.openMenu === "timetable-feature-menu" ? null : "timetable-feature-menu";
  }

  return (
    <>
      <div class="week-toolbar toolbar-tight">
        <button type="button" id="week-prev" onClick={() => { state.displayWeek = Math.max(1, state.displayWeek - 1); app.timetable.renderTimetable(); }}>上一周</button>
        <span id="week-label">第 {state.displayWeek}/{maxWeek} 周</span>
        <button type="button" id="week-next" onClick={() => { state.displayWeek = Math.min(maxWeek, state.displayWeek + 1); app.timetable.renderTimetable(); }}>下一周</button>
        <span id="week-selected">已选{selectedCourseCount()}门课程</span>
        <span id="week-credit">学分{(state.timetable.currentCredit || 0).toFixed(1)}/{state.timetable.maxCredit || 32}</span>
        <div class="menu-root">
          <button type="button" class="menu-button" id="week-feature-button" onClick={toggleMenu}>功能</button>
          <div classList={{ "menu-popover": true, hidden: state.openMenu !== "timetable-feature-menu" }} id="timetable-feature-menu">
            <button type="button" id="week-refresh" onClick={() => { state.openMenu = null; app.tree.refreshTimetable().catch(app.showError); }}>刷新已选课程</button>
          </div>
        </div>
      </div>
      <div class="timetable-wrap">
        <table id="timetable-table">
          <thead>
            <tr>
              <th>节次</th>
              <For each={weekdayNames}>{(name) => <th>{name}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={jieciRows}>
              {(jieci) => (
                <tr>
                  <th>{jieci}</th>
                  <For each={days}>{(day) => <TimetableCell day={day} jieci={jieci} />}</For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div id="detail-splitter" class="splitter splitter-horizontal" aria-hidden="true"></div>
      <TimetableDetail />
    </>
  );
}
