import { useCallback } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "../../app/app-context.jsx";
import { state } from "../../app/state.js";
import { useComposingInput } from "../../hooks/use-composing-input.js";
import { cx } from "../../shared/utils.js";
import { Button } from "../../components/ui/button";
import { Card, CardPanel } from "../../components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem, SelectGroup, SelectGroupLabel, SelectSeparator } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
import { Tabs, TabsList, TabsTab } from "../../components/ui/tabs";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Gauge, XIcon } from "lucide-react";

export function LoginOverlay() {
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
    <div id="login-overlay" className={cx("overlay", { "!hidden": !snap.auth.loginVisible })}>
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
        <div className="grid gap-1.5 mb-3 address-row">
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
                <span className="text-muted-foreground">已保存账号</span>
                <Button variant="default" id="saved-login-button" onClick={() => app.auth.doLogin(true).catch(app.showError)}>以 {snap.bootstrap.savedCredentials.studentNumber} 登录</Button>
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
