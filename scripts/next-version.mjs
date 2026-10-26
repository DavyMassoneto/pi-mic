// Próxima versão pelos commits convencionais desde a última tag v*.
// Imprime a versão ou nada (sem feat/fix/perf/breaking = sem release).
// Sem tag nenhuma, a primeira release usa a versão do package.json.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

let last;
try {
  last = git("describe", "--tags", "--abbrev=0", "--match", "v*");
} catch {
  last = undefined;
}
if (!last) {
  console.log(JSON.parse(readFileSync("package.json", "utf8")).version);
  process.exit(0);
}

const PATCH = 1;
const MINOR = 2;
const MAJOR = 3;
let bump = 0;
for (const msg of git("log", `${last}..HEAD`, "--format=%B%x00").split("\0")) {
  const m = /^(\w+)(\([^)]*\))?(!)?: /.exec(msg.trim());
  if (!m) continue;
  if (m[3] || /^BREAKING[ -]CHANGE: /m.test(msg)) bump = Math.max(bump, MAJOR);
  else if (m[1] === "feat") bump = Math.max(bump, MINOR);
  else if (m[1] === "fix" || m[1] === "perf") bump = Math.max(bump, PATCH);
}
if (bump === 0) process.exit(0);

let [major, minor, patch] = last.slice(1).split(".").map(Number);
// Antes da 1.0, quebra sobe só a minor (semver 0.x).
if (major === 0 && bump === MAJOR) bump = MINOR;
if (bump === MAJOR) [major, minor, patch] = [major + 1, 0, 0];
else if (bump === MINOR) [minor, patch] = [minor + 1, 0];
else [patch] = [patch + 1];
console.log(`${major}.${minor}.${patch}`);
