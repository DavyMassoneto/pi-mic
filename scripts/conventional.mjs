// Formato Conventional Commits aceito em commits e títulos de PR.
const TYPES = "feat|fix|perf|refactor|docs|test|build|ci|chore|style|revert";
export const CONVENTIONAL = new RegExp(`^(${TYPES})(\\([\\w./-]+\\))?!?: \\S`);
