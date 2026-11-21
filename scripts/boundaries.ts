// The boundaries, enforced in the check: src/ai/ imports neither src/db/ nor src/domain/ (the model side stays
// self-contained), and web/ imports nothing of the server's but src/shared/. One pass over the sources; a violation
// names the file and the rule, and fails the check.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const files = (dir: string): string[] => {
  try {
    return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
      .map((e) => relative(root, join(e.parentPath, e.name)));
  } catch {
    return []; // the folder arrives in a later step
  }
};
const importsOf = (file: string): string[] =>
  [...readFileSync(join(root, file), "utf8").matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

const broken: string[] = [];
for (const file of files("src/ai"))
  for (const imp of importsOf(file))
    if (/(^|\/)(db|domain)\//.test(imp))
      broken.push(`${file}: imports ${imp} (src/ai/ stays apart from db and domain)`);
for (const file of files("web"))
  for (const imp of importsOf(file))
    if (/src\/(server|db|domain|ai|platform)\//.test(imp))
      broken.push(`${file}: imports ${imp} (web/ may import only src/shared/)`);
if (broken.length) {
  for (const b of broken) console.error(`boundary: ${b}`);
  process.exit(1);
}
