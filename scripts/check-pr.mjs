// Valida uma PR pelo git-flow e pelo Conventional Commits.
// Uso: node scripts/check-pr.mjs <título> <branch de origem> <branch de destino>
import { CONVENTIONAL } from "./conventional.mjs";

const [title = "", head = "", base = ""] = process.argv.slice(2);
const FLOW = [
  [/^(feature|bugfix)\/[a-z0-9][a-z0-9._-]*$/, ["dev"]],
  [/^release\/\d+\.\d+\.\d+$/, ["main"]],
  [/^hotfix\/[a-z0-9][a-z0-9._-]*$/, ["main", "dev"]],
  [/^main$/, ["dev"]],
];

const errors = [];
if (!CONVENTIONAL.test(title)) errors.push(`title is not a conventional commit: "${title}"`);
const rule = FLOW.find(([re]) => re.test(head));
if (!rule)
  errors.push(`branch "${head}" is not git-flow (feature/, bugfix/, release/x.y.z, hotfix/)`);
else if (!rule[1].includes(base))
  errors.push(`"${head}" must target ${rule[1].join(" or ")}, not "${base}"`);
for (const e of errors) console.error(e);
console.log(errors.length ? "PR inválida" : `PR ok: ${head} → ${base} "${title}"`);
process.exit(errors.length ? 1 : 0);
