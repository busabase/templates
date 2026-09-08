export async function getProvider() {
  if (new URLSearchParams(window.location.search).get("demo") === "1") {
    return (await import("./demo-provider.js")).demoProvider;
  }
  return (await import("./busabase-provider.js")).busabaseProvider;
}
