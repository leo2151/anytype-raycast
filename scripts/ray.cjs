// Raycast 2 requires Node >=22.22.2. Prefer the current Node, falling back
// to Raycast's bundled runtime without changing the system Node installation.
const { spawnSync } = require("node:child_process");
const { readdirSync } = require("node:fs");
const { homedir } = require("node:os");
const path = require("node:path");

function supported(version) {
  const parts = version.trim().replace(/^v/, "").split(".").map(Number);
  return parts[0] > 22 || (parts[0] === 22 && (parts[1] > 22 || (parts[1] === 22 && parts[2] >= 2)));
}

let runtime = supported(process.version) ? process.execPath : undefined;
if (!runtime && process.platform === "darwin") {
  const base = path.join(homedir(), "Library/Application Support/com.raycast.macos");
  for (const directory of ["node/runtime", "NodeJS/runtime"]) {
    const root = path.join(base, directory);
    let entries = [];
    try {
      entries = readdirSync(root);
    } catch {
      /* Try the other runtime location. */
    }
    for (const entry of entries) {
      const candidate = path.join(root, entry, "bin/node");
      const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
      if (result.status === 0 && supported(result.stdout)) {
        runtime = candidate;
        break;
      }
    }
    if (runtime) break;
  }
}

if (!runtime) {
  console.error(
    "Raycast 2 development requires Node.js >=22.22.2. Update Node.js or launch Raycast 2 to install its bundled runtime.",
  );
  process.exit(1);
}

const cli = path.join(path.dirname(require.resolve("@raycast/api/package.json")), "bin/run.js");
const result = spawnSync(runtime, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, PATH: path.dirname(runtime) + path.delimiter + process.env.PATH },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
