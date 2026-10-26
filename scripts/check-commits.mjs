// Falha se algum commit do intervalo (fora merges) não seguir Conventional Commits.
// Uso: node scripts/check-commits.mjs <base> <head>
import { execSync } from "node:child_process";

const [base, head = "HEAD"] = process.argv.slice(2);
const TYPES = "feat|fix|perf|refactor|docs|test|build|ci|chore|style|revert";
const RE = new RegExp(`^(${TYPES})(\\([\\w./-]+\\))?!?: \\S`);

const valid = (ref) => {
  try {
    execSync(`git cat-file -e ${ref}^{commit}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const range = base && !/^0+$/.test(base) && valid(base) ? `${base}..${head}` : `-1 ${head}`;
const subjects = execSync(`git log --no-merges --format=%s ${range}`, { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const bad = subjects.filter((s) => !RE.test(s));
for (const s of bad) console.error(`not a conventional commit: ${s}`);
console.log(`${subjects.length - bad.length}/${subjects.length} commits ok`);
process.exit(bad.length ? 1 : 0);
