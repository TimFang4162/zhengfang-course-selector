import { useSnapshot } from "valtio";
import { useAppContext } from "../app/app-context.jsx";
import { state } from "../app/state.js";
import { cx } from "../shared/utils.js";
import { Button } from "../components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem, SelectGroup, SelectGroupLabel, SelectSeparator } from "../components/ui/select";
import { Tabs, TabsList, TabsTab } from "../components/ui/tabs";
import { WorkspaceTabs } from "../features/tree/WorkspaceTabs.jsx";
import { RightPane } from "./RightPane.jsx";
import { FolderTree, CalendarDays, GraduationCap, Gauge, PanelRightClose, PanelRightOpen, Repeat } from "lucide-react";

export function AppShell() {
  const app = useAppContext();
  const snap = useSnapshot(state);

  function accountLabel() {
    const studentNumber = snap.auth.studentNumber || snap.bootstrap?.savedCredentials?.studentNumber || "";
    return studentNumber || "未登录账号";
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
    <div className="app-shell h-dvh overflow-hidden">
      <div className="main-layout h-dvh overflow-hidden">
        <main className="left-pane min-h-0 overflow-hidden flex flex-col h-full gap-0 p-0 bg-card border-r border-border">
          <Tabs className="flex-1 min-h-0" value={snap.activeTab} onValueChange={(v) => app.tree.switchTab(v)}>
            <div className="workspace-header grid grid-cols-[minmax(0,1fr)_auto] items-stretch min-h-[35px] bg-muted border-b border-border">
              <TabsList variant="underline" className="p-0">
                <TabsTab value="tree"><FolderTree className="size-4" />课程树</TabsTab>
                <TabsTab value="timetable"><CalendarDays className="size-4" />当前课表</TabsTab>
                <TabsTab value="academic"><GraduationCap className="size-4" />学业情况</TabsTab>
              </TabsList>
              <div className="workspace-controls flex items-center gap-1 py-[3px] px-1.5 max-lg:flex-wrap">
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
