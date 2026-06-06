import { apiGet, apiPost } from "../../api/client.js";

export function createAuthFeature({ state, getApp }) {
  function setLoginStatus(text) {
    state.auth.loginStatus = text;
  }

  function updateAuthStatus() {
    if (state.bootstrap?.baseUrl) state.auth.baseUrl = state.bootstrap.baseUrl;
  }

  function getLoginBaseUrl() {
    if (state.auth.baseUrl === "__custom__") return state.auth.customBaseUrl.trim();
    return state.auth.baseUrl;
  }

  function syncLoginFormFromDom() {
    const baseSelect = document.getElementById("base-url");
    const customBaseUrl = document.getElementById("custom-base-url");
    const studentNumber = document.getElementById("student-number");
    const password = document.getElementById("password");
    const saveCredentials = document.getElementById("save-creds");
    const disableSslVerify = document.getElementById("disable-ssl-verify");

    if (baseSelect) state.auth.baseUrl = baseSelect.value;
    if (customBaseUrl) state.auth.customBaseUrl = customBaseUrl.value;
    if (studentNumber) state.auth.studentNumber = studentNumber.value;
    if (password) state.auth.password = password.value;
    if (saveCredentials) state.auth.saveCredentials = saveCredentials.checked;
    if (disableSslVerify) state.auth.disableSslVerify = disableSslVerify.checked;
  }

  function syncCustomAddressInput() {
    return state.auth.baseUrl === "__custom__";
  }

  function updateAddressOptionLatency(url, ms) {
    const choice = state.bootstrap?.addressChoices?.find((item) => item.url === url);
    if (choice) choice.latencyMs = ms;
  }

  async function updateSslVerifySetting() {
    const disableSslVerify = state.auth.disableSslVerify;
    if (state.bootstrap) state.bootstrap.disableSslVerify = disableSslVerify;
    await apiPost("/api/settings", { disableSslVerify });
  }

  async function loadBootstrap() {
    const app = getApp();
    state.bootstrap = await apiGet("/api/bootstrap");
    state.auth.baseUrl = state.bootstrap.baseUrl || state.bootstrap.addressChoices?.[0]?.url || "";
    if (state.bootstrap.baseUrl && !state.bootstrap.addressChoices.some((item) => item.url === state.bootstrap.baseUrl)) {
      state.auth.baseUrl = "__custom__";
      state.auth.customBaseUrl = state.bootstrap.baseUrl;
    }
    state.auth.disableSslVerify = Boolean(state.bootstrap.disableSslVerify);
    state.auth.studentNumber = state.bootstrap.savedCredentials?.studentNumber || "";
    app.tree.syncSearchScopeOptions();
    app.tree.restoreSavedTabs();
    if (state.bootstrap.authenticated) {
      app.tree.applyTreeState(state.bootstrap.tree);
      state.timetable = state.bootstrap.timetable || state.timetable;
      state.auth.loginVisible = false;
      app.tree.syncSearchScopeOptions();
      app.tree.setFilterStatus();
      app.tree.renderTree();
      app.timetable.renderTimetable();
      app.timetable.renderTimetableDetailAll();
      return;
    }
    state.auth.loginVisible = true;
  }

  async function doLogin(useSavedOverride = false) {
    const app = getApp();
    setLoginStatus("登录中...");
    try {
      syncLoginFormFromDom();
      const baseUrl = getLoginBaseUrl();
      const payload = {
        baseUrl,
        useSaved: Boolean(useSavedOverride),
        studentNumber: state.auth.studentNumber.trim(),
        password: state.auth.password,
        saveCredentials: state.auth.saveCredentials,
        disableSslVerify: state.auth.disableSslVerify,
      };
      const result = await apiPost("/api/login", payload);
      if (!result.ok) throw new Error(result.message || "登录失败");
      app.tree.restoreSavedTabs();
      app.tree.applyTreeState(result.tree);
      state.timetable = result.timetable;
      state.bootstrap.baseUrl = baseUrl;
      state.bootstrap.savedCredentials.studentNumber = payload.studentNumber;
      state.bootstrap.savedCredentials.masked = payload.studentNumber;
      state.bootstrap.disableSslVerify = state.auth.disableSslVerify;
      state.auth.loginVisible = false;
      document.getElementById("login-overlay")?.classList.add("hidden");
      updateAuthStatus();
      app.tree.syncSearchScopeOptions();
      app.tree.setFilterStatus();
      app.tree.renderTree();
      app.timetable.renderTimetable();
      app.timetable.renderTimetableDetailAll();
      setLoginStatus("");
    } catch (error) {
      setLoginStatus(error.message);
    }
  }

  async function doLoginWithCookie() {
    const app = getApp();
    setLoginStatus("Cookie 登录中...");
    try {
      syncLoginFormFromDom();
      const baseUrl = getLoginBaseUrl();
      const cookies = state.auth.cookieInput.trim();
      if (!cookies) throw new Error("请粘贴 Cookie");
      const result = await apiPost("/api/login/cookie", {
        baseUrl,
        cookies,
        disableSslVerify: state.auth.disableSslVerify,
      });
      if (!result.ok) throw new Error(result.message || "Cookie 登录失败");
      app.tree.restoreSavedTabs();
      app.tree.applyTreeState(result.tree);
      state.timetable = result.timetable;
      state.bootstrap.baseUrl = baseUrl;
      state.bootstrap.disableSslVerify = state.auth.disableSslVerify;
      if (result.studentNumber) {
        state.bootstrap.savedCredentials.studentNumber = result.studentNumber;
        state.bootstrap.savedCredentials.masked = result.studentNumber;
      }
      state.auth.loginVisible = false;
      document.getElementById("login-overlay")?.classList.add("hidden");
      updateAuthStatus();
      app.tree.syncSearchScopeOptions();
      app.tree.setFilterStatus();
      app.tree.renderTree();
      app.timetable.renderTimetable();
      app.timetable.renderTimetableDetailAll();
      setLoginStatus("");
    } catch (error) {
      setLoginStatus(error.message);
    }
  }

  async function testLoginAddresses() {
    const addresses = state.bootstrap.addressChoices.map((item) => ({ label: item.description, url: item.url }));
    const customUrl = state.auth.customBaseUrl.trim();
    if (customUrl) addresses.push({ label: "自定义地址", url: customUrl });
    state.speedRows = addresses.map((item) => ({ ...item, statusClass: "is-pending", status: "等待中", ms: "-", message: "-" }));
    state.speedModalVisible = true;
    await Promise.all(addresses.map(async (address, index) => {
      state.speedRows[index] = { ...state.speedRows[index], status: "测试中" };
      try {
        const data = await apiPost("/api/addresses/test", {
          addresses: [address],
          disableSslVerify: state.auth.disableSslVerify,
        });
        const item = data.items?.[0];
        if (!item) throw new Error("无测速结果");
        state.speedRows[index] = {
          ...state.speedRows[index],
          statusClass: item.ok ? "is-ok" : "is-error",
          status: `${item.ok ? "可达" : "失败"}${item.status ? ` / ${item.status}` : ""}`,
          ms: `${item.ms}ms`,
          message: item.message || "",
        };
        if (item.ok) updateAddressOptionLatency(item.url, item.ms);
      } catch (error) {
        state.speedRows[index] = { ...state.speedRows[index], statusClass: "is-error", status: "失败", ms: "-", message: error.message || String(error) };
      }
    }));
  }

  function closeSpeedModal() {
    state.speedModalVisible = false;
  }

  function setLoginBaseUrl(url) {
    const matched = state.bootstrap?.addressChoices?.some((option) => option.url === url);
    if (matched) state.auth.baseUrl = url;
    else {
      state.auth.baseUrl = "__custom__";
      state.auth.customBaseUrl = url;
    }
  }

  return {
    setLoginStatus,
    updateAuthStatus,
    getLoginBaseUrl,
    syncCustomAddressInput,
    updateSslVerifySetting,
    loadBootstrap,
    doLogin,
    doLoginWithCookie,
    testLoginAddresses,
    closeSpeedModal,
    setLoginBaseUrl,
  };
}
