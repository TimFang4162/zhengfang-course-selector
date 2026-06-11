import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "../app/app-context.jsx";
import { state } from "../app/state.js";
import { cx } from "../shared/utils.js";
import { Button } from "../components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../components/ui/menu";
import { apiPost } from "../api/client.js";
import { Plus, Trash2, ScrollText, Activity, Inbox, Ellipsis, Play, Square, Eye } from "lucide-react";

export function RightPane() {
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
      <div className="log-shell flex flex-1 min-h-0 flex-col overflow-hidden bg-background">
        <div className="flex items-center justify-between gap-2 min-h-[35px] px-[7px] py-[3px] pl-[10px] bg-[var(--vscode-panel-header-bg)] border-b border-[var(--vscode-border)]">
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] uppercase tracking-[0.08em] text-[var(--vscode-fg-muted)]"><ScrollText className="size-3.5" />日志</span>
          <div className="log-actions flex items-center gap-1">
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
              <span className="log-time text-muted-foreground/70 whitespace-nowrap">{app.logs.logTimestampText(item, index)}</span>
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
          <div className="log-actions flex items-center gap-1">
            <Menu>
              <MenuTrigger><Button variant="ghost" id="activity-add" onClick={(e) => e.stopPropagation()}><Plus /></Button></MenuTrigger>
              <MenuPopup>
                <MenuItem onClick={() => app.grab.openManualGrabModal()}>添加抢课任务</MenuItem>
              </MenuPopup>
            </Menu>
          </div>
        </div>
        <div className="activity-panel flex-1 min-h-0 overflow-auto">
          <Table className="activity-table">
            <TableHeader>
              <TableRow><TableHead className="sticky top-0 bg-card border-b border-border-subtle px-2 py-[5px] text-left align-top text-muted-foreground font-medium">任务</TableHead><TableHead className="sticky top-0 bg-card border-b border-border-subtle px-2 py-[5px] text-left align-top text-muted-foreground font-medium">状态</TableHead><TableHead className="sticky top-0 bg-card border-b border-border-subtle px-2 py-[5px] text-left align-top text-muted-foreground font-medium">进度</TableHead></TableRow>
            </TableHeader>
            <TableBody id="activity-list">
              {snap.activities.length ? snap.activities.map((item) => (
                <TableRow key={item.id} className={cx("activity-row", { "is-clickable": Boolean(state.grabTasks[item.id]) })} onClick={() => { const task = state.grabTasks[item.id]; if (task) app.grab.showGrabTaskDetail(task); }}>
                  <TableCell className="border-b border-border-subtle px-2 py-[5px] text-left align-top overflow-hidden text-ellipsis whitespace-nowrap">{item.name}</TableCell>
                  <TableCell className="border-b border-border-subtle px-2 py-[5px] text-left align-top overflow-hidden text-ellipsis whitespace-nowrap">{item.status}</TableCell>
                  <TableCell className="border-b border-border-subtle px-2 py-[5px] text-left align-top overflow-hidden text-ellipsis whitespace-nowrap">{item.progress} {snap.grabTasks[item.id] && (
              <Menu>
                <MenuTrigger><Button variant="ghost" size="icon-xs" className="activity-more float-right min-w-[22px] min-h-5 px-[5px] border-transparent bg-transparent" onClick={(e) => e.stopPropagation()}><Ellipsis /></Button></MenuTrigger>
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
