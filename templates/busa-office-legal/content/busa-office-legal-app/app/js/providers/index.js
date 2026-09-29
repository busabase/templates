export async function getProvider() {
  return new URLSearchParams(location.search).get("demo") === "1"
    ? (await import("./demo-provider.js")).demoProvider
    : (await import("./busabase-provider.js")).busabaseProvider;
}
