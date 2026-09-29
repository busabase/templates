import { demoProvider } from "./demo-provider.js";
import { busabaseProvider } from "./busabase-provider.js";
export const isDemo = () =>
  new URLSearchParams(window.location.search).get("demo") === "1";
export const getProvider = () => (isDemo() ? demoProvider : busabaseProvider);
