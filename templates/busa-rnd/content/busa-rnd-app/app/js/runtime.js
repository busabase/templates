/**
 * What the app says about where it is running. The answer itself comes from the
 * SDK's `detectAirAppRuntime()` (it asks this app's own server at
 * `__airapp/runtime`, never the URL); this file only turns that answer into
 * words for the settings panel and the failed-load hint.
 */

/** Human-readable runtime label for the settings panel. */
export const runtimeLabel = (runtime) =>
  runtime.hosted ? `${runtime.runtime} (Busabase-hosted)` : runtime.runtime;

/**
 * Which explanation fits a failed data load. The message keys live in
 * `messages.js`; this only picks one, so it stays free of copy and locale.
 *
 * Splitting this out is the actual fix for the misleading-copy problem: a
 * fixed "authenticated" string, or one chosen from the environment alone, will
 * eventually be shown in a state where it is false. The pair
 * (where am I, do I have credentials) is what determines the sentence.
 */
export function connectionHintKey(runtime) {
  if (!runtime.determined) return "hintUnknown";
  if (runtime.hosted) return "hintHosted";
  return runtime.devProxy ? "hintDevProxy" : "hintStandalone";
}
