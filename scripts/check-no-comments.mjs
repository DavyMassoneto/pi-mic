import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import ts from "typescript";

const ROOT_JSON = [
  "biome.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "tsconfig.browser.json",
];
const YAML_COMMENT = /^\s*#|\s#(\s|$)/;

function listFiles(dir, extensions) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && extensions.includes(extname(entry.name)))
    .map((entry) => join(entry.parentPath, entry.name));
}

function lineOf(text, position) {
  return text.slice(0, position).split("\n").length;
}

function commentsIn(sourceFile) {
  const text = sourceFile.text;
  const found = [];
  const visit = (node) => {
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      const leading = ts.getLeadingCommentRanges(text, node.pos) ?? [];
      const trailing = ts.getTrailingCommentRanges(text, node.end) ?? [];
      for (const range of [...leading, ...trailing]) found.push(range.pos);
      return;
    }
    for (const child of children) visit(child);
  };
  visit(sourceFile);
  return [...new Set(found)].map((position) => lineOf(text, position));
}

function scriptComments(file, kind) {
  const text = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  return commentsIn(sourceFile);
}

function jsonComments(file) {
  const text = readFileSync(file, "utf8");
  return commentsIn(ts.parseJsonText(file, text));
}

function yamlComments(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => (YAML_COMMENT.test(line) ? [index + 1] : []));
}

const checks = [
  ...listFiles("src", [".ts"]).map((file) => [file, scriptComments(file, ts.ScriptKind.TS)]),
  ...listFiles("scripts", [".mjs"]).map((file) => [file, scriptComments(file, ts.ScriptKind.JS)]),
  ...listFiles(join(".github", "workflows"), [".yml", ".yaml"]).map((file) => [
    file,
    yamlComments(file),
  ]),
  ...ROOT_JSON.map((file) => [file, jsonComments(file)]),
];

let total = 0;
for (const [file, lines] of checks) {
  for (const line of lines) console.error(`comment in ${file}:${line}`);
  total += lines.length;
}
console.log(total ? `${total} comment(s) found` : `no comments in ${checks.length} files`);
process.exit(total ? 1 : 0);
