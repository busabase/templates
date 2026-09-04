import { toast } from "./api.js";
import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";
import {
  connectionStatusText,
  localizedOnboardingMessage,
  providerModeLabel,
  providerStatus,
  setupNeeded,
  setupState,
} from "./provider.js";
import { $, store } from "./store.js";

const hooks = { refresh: async () => {} };

export function registerSetupHooks(overrides) {
  Object.assign(hooks, overrides);
}

// The local gate applies when Busabase is NOT hosting this process — a fact the
// host states through BUSABASE_AIRAPP_RUNTIME, not one the URL can reveal.
import { shouldUseLocalGateway as isStandaloneLocalPreview } from "./runtime.js";

const APP_NAME = "Busa CMS";

const showLocalGate = (html) => {
  const gate = $("providerGate");
  gate.classList.remove("is-hidden");
  gate.setAttribute("aria-hidden", "false");
  gate.innerHTML = html;
};

const localGateShell = (title, body, footer = "") => `
  <section class="provider-gate-panel local-connect-panel" aria-labelledby="localSetupTitle">
    <div class="provider-gate-head"><div class="provider-gate-kicker">${APP_NAME}</div></div>
    <div class="provider-gate-body"><div class="setup-step">
      <h1 id="localSetupTitle">${escapeHtml(title)}</h1>${body}
    </div></div>
    <div class="setup-actions">${footer}</div>
  </section>`;

const renderLocalConnection = (status) => {
  const oauthError = new URLSearchParams(window.location.search).get("oauth_error");
  showLocalGate(
    localGateShell(
      t("local.connect.title"),
      `<form class="busabase-config-form" method="post" action="auth/start">
      ${oauthError ? `<div class="local-setup-error" role="alert">${escapeHtml(oauthError)}</div>` : ""}
      ${status.expired ? `<div class="local-setup-error">${escapeHtml(t("local.connect.expired"))}</div>` : ""}
      <p>${escapeHtml(t("local.connect.body"))}</p>
      <fieldset class="provider-choice-grid local-server-options">
        <label class="provider-choice-card active"><input type="radio" name="server_mode" value="cloud" checked><span><strong>Busabase Cloud</strong><small>busabase.com</small></span></label>
        <label class="provider-choice-card"><input type="radio" name="server_mode" value="custom"><span><strong>${escapeHtml(t("local.connect.custom"))}</strong><small>${escapeHtml(t("local.connect.custom_hint"))}</small></span></label>
      </fieldset>
      <label class="field-row local-custom-url is-hidden"><span>Busabase URL</span><input class="field-input" type="url" name="custom_base_url" placeholder="https://busabase.example.com" autocomplete="url"></label>
      <input type="hidden" name="base_url" value="${escapeHtml(status.cloudBaseUrl || "https://busabase.com")}">
      <button type="submit" class="primary">${escapeHtml(t("local.connect.action"))}</button>
    </form>`,
      `<span>${escapeHtml(t("local.connect.security"))}</span><a href="?demo=1">${escapeHtml(t("local.demo"))}</a>`,
    ),
  );
  const form = document.querySelector(".busabase-config-form");
  const baseUrl = form.querySelector('input[name="base_url"]');
  const customRow = form.querySelector(".local-custom-url");
  const customInput = form.querySelector('input[name="custom_base_url"]');
  form.querySelectorAll('input[name="server_mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const custom = radio.checked && radio.value === "custom";
      form
        .querySelectorAll(".provider-choice-card")
        .forEach((card) => card.classList.toggle("active", card.querySelector("input")?.checked));
      customRow.classList.toggle("is-hidden", !custom);
      customInput.required = custom;
      baseUrl.value = custom ? customInput.value : status.cloudBaseUrl || "https://busabase.com";
      if (custom) customInput.focus();
    });
  });
  customInput.addEventListener("input", () => {
    baseUrl.value = customInput.value;
  });
};

const renderLocalSpaceSelector = (status) => {
  const options = status.spaces
    .map(
      (space) =>
        `<option value="${escapeHtml(space.id)}">${escapeHtml(space.name)} · ${escapeHtml(space.id)}</option>`,
    )
    .join("");
  showLocalGate(
    localGateShell(
      t("local.space.title"),
      `<form class="busabase-config-form" data-space-form>
      <p>${escapeHtml(t("local.space.body", { server: status.baseUrl }))}</p>
      <label class="field-row"><span>Space</span><select class="field-input" name="space_id" required>${options}</select></label>
      <div class="local-setup-error is-hidden" data-space-error></div>
      <button type="submit" class="primary">${escapeHtml(t("local.space.action"))}</button>
    </form>`,
      `<span>${escapeHtml(t("local.space.security"))}</span><a href="?demo=1">${escapeHtml(t("local.demo"))}</a>`,
    ),
  );
  document.querySelector("[data-space-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const error = form.querySelector("[data-space-error]");
    button.disabled = true;
    error.classList.add("is-hidden");
    const response = await fetch("auth/space", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(new FormData(form)),
    });
    const result = await response.json();
    if (!response.ok) {
      error.textContent = result.error || t("local.space.error");
      error.classList.remove("is-hidden");
      button.disabled = false;
      return;
    }
    window.location.reload();
  });
};

export async function ensureLocalBusabaseConnection() {
  if (store.params.has("demo") || !isStandaloneLocalPreview()) return true;
  const status = await fetch("auth/status", { headers: { accept: "application/json" } }).then(
    (response) => response.json(),
  );
  if (!status.connected) {
    renderLocalConnection(status);
    return false;
  }
  if (status.requiresSpace) {
    renderLocalSpaceSelector(status);
    return false;
  }
  store.localAuth = status;
  return true;
}

/**
 * The next thing to do, phrased as something the operator can hand to an agent.
 *
 * Missing Bases outrank missing content: suggesting "write a post" to a workspace
 * with no Posts Base is the kind of advice that makes a tool feel like it is not
 * looking.
 */
export function setupPrompt() {
  const status = providerStatus();
  const onboarding = setupState().onboarding || {};
  if (status.ok === false || onboarding.state === "needs_resources") {
    return "Install the busa-cms template into this Space so the Posts, Pages, Categories, and Tags Bases exist.";
  }
  return "Write the first post for this site, then wire my Next.js app to this Folder with busabase-cms-sdk.";
}

export function setupChecklistHtml() {
  const status = providerStatus();
  const setup = setupState();
  const connection = setup.connection || {};
  const onboarding = setup.onboarding || {};
  const rows = [
    [t("setup.check.connection"), status.ok !== false, connectionStatusText(status)],
    [t("setup.check.folder"), Boolean(connection.folderId), connection.folderId || "busa-cms"],
    [
      t("setup.check.bases"),
      connection.basesFound === connection.basesExpected,
      `${connection.basesFound ?? 0} / ${connection.basesExpected ?? 4}`,
    ],
    [
      t("setup.check.schema"),
      Boolean(connection.schemaOk),
      connection.schemaOk ? t("setup.schema_matches") : t("setup.schema_drift"),
    ],
    [
      t("setup.check.published"),
      (onboarding.publishedCount ?? 0) > 0,
      String(onboarding.publishedCount ?? 0),
    ],
  ];
  return rows
    .map(
      ([label, ok, detail]) => `
      <div class="setup-check">
        <span class="env-pill ${ok ? "ok" : "warn"}">${escapeHtml(ok ? t("setup.ready") : t("setup.todo"))}</span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(detail || "")}</small>
      </div>
    `,
    )
    .join("");
}

export async function copySetupPrompt() {
  await navigator.clipboard.writeText(setupPrompt());
  toast(t("setup.prompt_copied"));
}

export function applyProviderGate() {
  const unavailable = setupNeeded();
  const gate = $("providerGate");
  if (!gate) return;
  const status = providerStatus();
  const connection = setupState().connection || {};
  gate.classList.toggle("is-hidden", !unavailable);
  gate.setAttribute("aria-hidden", String(!unavailable));
  $("setupActionsReady")?.classList.toggle("is-hidden", !unavailable);

  const message = $("providerGateMessageReady");
  if (message) message.textContent = localizedOnboardingMessage(status);
  const mode = $("providerGateMode");
  if (mode) mode.textContent = providerModeLabel(status);
  const baseUrl = $("providerGateBaseUrl");
  if (baseUrl) baseUrl.textContent = connection.baseUrl || window.location.origin;
  const folderId = $("providerGateFolderId");
  if (folderId) folderId.textContent = connection.folderId || t("settings.not_configured");
  const action = $("providerGateAction");
  if (action) action.textContent = status.action || t("setup.next_action");
  const checklist = $("setupChecklist");
  if (checklist) checklist.innerHTML = setupChecklistHtml();
  const prompt = $("setupPromptText");
  if (prompt) prompt.textContent = setupPrompt();
  const promptTitle = $("setupPromptTitle");
  if (promptTitle) promptTitle.textContent = t("setup.prompt_title");
}
