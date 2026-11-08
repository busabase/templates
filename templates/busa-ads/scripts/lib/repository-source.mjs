// Source maintenance needs the full template checkout, not only its Skill node.
import { existsSync } from "node:fs";
import path from "node:path";

export function requireRepositorySource(root) {
  if (!existsSync(path.join(root, "content/busa-ads-app/package.json"))) {
    console.error(
      "This command requires the full busabase/templates checkout (templates/busa-ads). " +
      "The installed Skill contains runtime scripts only; open its installed AirApp for the board.",
    );
    process.exit(1);
  }
}
