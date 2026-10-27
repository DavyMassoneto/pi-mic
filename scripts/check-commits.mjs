import { execFileSync } from "node:child_process";
import { CONVENTIONAL as RE } from "./conventional.mjs";

const [base, head = "HEAD"] = process.argv.slice(2);

const valid = (ref) => {
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const range = base && !/^0+$/.test(base) && valid(base) ? [`${base}..${head}`] : ["-1", head];
const subjects = execFileSync("git", ["log", "--no-merges", "--format=%s", ...range], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
const bad = subjects.filter((s) => !RE.test(s));
for (const s of bad) console.error(`not a conventional commit: ${s}`);
console.log(`${subjects.length - bad.length}/${subjects.length} commits ok`);
process.exit(bad.length ? 1 : 0);
