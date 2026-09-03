import { t } from "./i18n.js";
import { store } from "./store.js";

/**
 * Two questions the shell keeps asking, kept apart on purpose.
 *
 * *Runtime readiness* is whether this app can reach its four Bases at all.
 * *Product onboarding* is whether a website has been pointed at them yet. A
 * workspace can be perfectly connected and still have nothing published, and
 * telling someone to "check the connection" in that state sends them to fix
 * something that is not broken.
 */

export function providerStatus() {
  const status = store.state.provider_status || {};
  return { ...status, provider: status.provider || "busabase", mode: status.mode || "busabase" };
}

export function providerReady() {
  return providerStatus().ok !== false;
}

export function setupState() {
  return store.state.setup || {};
}

/** The website side: a Folder nobody reads is installed, not in service. */
export function onboardingReady() {
  return setupState().onboarding?.configured !== false;
}

export function setupNeeded() {
  return !providerReady() || !onboardingReady();
}

export function providerModeLabel(status = providerStatus()) {
  const provider = status.provider || "busabase";
  const mode = status.mode || provider;
  return provider === mode ? provider : `${provider} / ${mode}`;
}

export function providerStatusText(status = providerStatus()) {
  if (status.ok === false) return status.message || t("provider.not_ready_message");
  return status.message || t("provider.ready_message");
}

const ONBOARDING_STATE_KEYS = {
  needs_resources: "setup.state.needs_resources",
  needs_content: "setup.state.needs_content",
  ready: "setup.state.ready",
};

/**
 * Prefer a translated string for the enumerable states; a connection failure can
 * carry a live, non-enumerable detail, so those keep the raw backend message.
 */
export function localizedOnboardingMessage(status = providerStatus()) {
  if (status.ok === false) return providerStatusText(status);
  const key = ONBOARDING_STATE_KEYS[setupState().onboarding?.state];
  return key ? t(key) : setupState().onboarding?.message || providerStatusText(status);
}

export function connectionStatusText(status = providerStatus()) {
  if (status.ok === false) return status.message || t("provider.not_ready_message");
  return t("setup.busabase.connected");
}
