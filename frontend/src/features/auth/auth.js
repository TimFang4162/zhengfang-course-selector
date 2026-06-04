import { apiGet, apiPost } from "../../api/client.js";
import { escapeHtml } from "../../shared/utils.js";

export function createAuthFeature({ state, getApp }) {
  function setLoginStatus(text) {
    document.getElementById("login-status").textContent = text;
  }

  function updateAuthStatus() {
    const baseSelect = document.getElementById("workspace-base-url");
    if (state.bootstrap?.baseUrl && baseSelect) baseSelect.value = state.bootstrap.baseUrl;
  }

  function getLoginBaseUrl() {
    const select = document.getElementById("base-url");
    if (select.value === "__custom__") return document.getElementById("custom-base-url").value.trim();
    return select.value;
  }

  function syncCustomAddressInput() {
    const isCustom = document.getElementById("base-url").value === "__custom__";
    document.getElementById("custom-base-url").classList.toggle("hidden", !isCustom);
  }

  function updateAddressOptionLatency(url, ms) {
    for (const select of [document.getElementById("base-url"), document.getElementById("workspace-base-url")]) {
      const option = [...select.options].find((item) => item.value === url);
      if (!option) continue;
      option.textContent = option.textContent.replace(/\s\(\d+ms\)$/, "") + ` (${ms}ms)`;
    }
  }

  async function updateSslVerifySetting() {
    const disableSslVerify = document.getElementById("disable-ssl-verify").checked;
    if (state.bootstrap) state.bootstrap.disableSslVerify = disableSslVerify;
    await apiPost("/api/settings", { disableSslVerify });
  }

  async function loadBootstrap() {
    const app = getApp();
    state.bootstrap = await apiGet("/api/bootstrap");
    const baseSelect = document.getElementById("base-url");
    const workspaceBaseSelect = document.getElementById("workspace-base-url");
    baseSelect.innerHTML = "";
    workspaceBaseSelect.innerHTML = "";
    for (const item of state.bootstrap.addressChoices) {
      for (const select of [baseSelect, workspaceBaseSelect]) {
        const option = document.createElement("option");
        option.value = item.url;
        option.textContent = `${item.url} (${item.description})`;
        if (item.url === state.bootstrap.baseUrl) option.selected = true;
        select.appendChild(option);
      }
    }
    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "自定义地址...";
    baseSelect.appendChild(customOption);
    if (state.bootstrap.baseUrl && !state.bootstrap.addressChoices.some((item) => item.url === state.bootstrap.baseUrl)) {
      baseSelect.value = "__custom__";
      document.getElementById("custom-base-url").value = state.bootstrap.baseUrl;
    }
    syncCustomAddressInput();
    document.getElementById("disable-ssl-verify").checked = Boolean(state.bootstrap.disableSslVerify);
    const savedHint = document.getElementById("saved-hint");
    savedHint.textContent = state.bootstrap.savedCredentials.available
      ? `已保存账号 ${state.bootstrap.savedCredentials.masked}`
      : "无已保存凭据";
    document.getElementById("saved-login-panel").classList.toggle("hidden", !state.bootstrap.savedCredentials.available);
    document.getElementById("saved-login-button").textContent = state.bootstrap.savedCredentials.available
      ? `以 ${state.bootstrap.savedCredentials.masked} 登录`
      : "以已保存凭据登录";
    document.getElementById("student-number").value = state.bootstrap.savedCredentials.studentNumber || "";
    app.tree.syncSearchScopeOptions();
    if (state.bootstrap.authenticated) {
      state.categories = state.bootstrap.categories?.items || [];
      state.timetable = state.bootstrap.timetable || state.timetable;
      document.getElementById("login-overlay").classList.add("hidden");
      app.tree.syncSearchScopeOptions();
      app.tree.setFilterStatus();
      await app.tree.syncTreeState();
      app.tree.renderTree();
      app.timetable.renderTimetable();
      app.timetable.renderTimetableDetailAll();
      return;
    }
    document.getElementById("login-overlay").classList.remove("hidden");
  }

  async function doLogin(useSavedOverride = false) {
    const app = getApp();
    setLoginStatus("登录中...");
    try {
      const payload = {
        baseUrl: getLoginBaseUrl(),
        useSaved: useSavedOverride || document.getElementById("use-saved").checked,
        studentNumber: document.getElementById("student-number").value.trim(),
        password: document.getElementById("password").value,
        saveCredentials: document.getElementById("save-creds").checked,
        disableSslVerify: document.getElementById("disable-ssl-verify").checked,
      };
      const result = await apiPost("/api/login", payload);
      if (!result.ok) throw new Error(result.message || "登录失败");
      state.categories = result.categories.items;
      state.timetable = result.timetable;
      state.bootstrap.baseUrl = getLoginBaseUrl();
      state.bootstrap.disableSslVerify = document.getElementById("disable-ssl-verify").checked;
      document.getElementById("login-overlay").classList.add("hidden");
      updateAuthStatus();
      app.tree.syncSearchScopeOptions();
      app.tree.setFilterStatus();
      await app.tree.syncTreeState();
      app.tree.renderTree();
      app.timetable.renderTimetable();
      app.timetable.renderTimetableDetailAll();
      setLoginStatus("");
    } catch (error) {
      setLoginStatus(error.message);
    }
  }

  async function testLoginAddresses() {
    const content = document.getElementById("speed-content");
    document.getElementById("speed-modal").classList.remove("hidden");
    const addresses = state.bootstrap.addressChoices.map((item) => ({ label: item.description, url: item.url }));
    const customUrl = document.getElementById("custom-base-url").value.trim();
    if (customUrl) addresses.push({ label: "自定义地址", url: customUrl });
    content.innerHTML = `
      <table class="speed-table">
        <thead><tr><th>地址</th><th>状态</th><th>耗时</th><th>说明</th></tr></thead>
        <tbody>
          ${addresses.map((item, index) => `
            <tr id="speed-row-${index}" class="is-pending">
              <td><button type="button" class="link-button" data-url="${escapeHtml(item.url)}">${escapeHtml(item.url)}</button><div class="dim">${escapeHtml(item.label)}</div></td>
              <td>等待中</td>
              <td>-</td>
              <td>-</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    content.querySelectorAll("[data-url]").forEach((button) => {
      button.addEventListener("click", () => {
        setLoginBaseUrl(button.dataset.url);
        document.getElementById("speed-modal").classList.add("hidden");
      });
    });
    await Promise.all(addresses.map(async (address, index) => {
      const row = document.getElementById(`speed-row-${index}`);
      if (!row) return;
      row.children[1].textContent = "测试中";
      try {
        const data = await apiPost("/api/addresses/test", {
          addresses: [address],
          disableSslVerify: document.getElementById("disable-ssl-verify").checked,
        });
        const item = data.items?.[0];
        if (!item) throw new Error("无测速结果");
        row.className = item.ok ? "is-ok" : "is-error";
        row.children[1].textContent = `${item.ok ? "可达" : "失败"}${item.status ? ` / ${item.status}` : ""}`;
        row.children[2].textContent = `${item.ms}ms`;
        row.children[3].textContent = item.message || "";
        if (item.ok) updateAddressOptionLatency(item.url, item.ms);
      } catch (error) {
        row.className = "is-error";
        row.children[1].textContent = "失败";
        row.children[2].textContent = "-";
        row.children[3].textContent = error.message || String(error);
      }
    }));
  }

  function setLoginBaseUrl(url) {
    const select = document.getElementById("base-url");
    const matched = [...select.options].some((option) => option.value === url);
    if (matched) select.value = url;
    else {
      select.value = "__custom__";
      document.getElementById("custom-base-url").value = url;
    }
    syncCustomAddressInput();
  }

  return {
    setLoginStatus,
    updateAuthStatus,
    getLoginBaseUrl,
    syncCustomAddressInput,
    updateSslVerifySetting,
    loadBootstrap,
    doLogin,
    testLoginAddresses,
    setLoginBaseUrl,
  };
}
