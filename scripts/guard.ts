// The guard: nothing personal and no secret reaches a commit or a push. It runs from the git hooks (.githooks/) on
// every commit (the staged changes) and every push (the commits being pushed), and it needs nothing installed: Node
// runs this file directly, and gitleaks comes from the computer. It refuses: anything gitleaks finds (keys,
// passwords, tokens), a staged file .gitignore covers, a home path with a user name, an email address, a
// phone-number shape, and this computer's own user, host and account names, read here at run time so none of them is
// written in the repo. It never prints what it found: only the file and the kind, with how to fix it. Free-form
// personal details (an employer, a search's words) have no pattern: keeping those out is AGENTS.md's rule and the
// reviews.
import { execFileSync, spawnSync } from "node:child_process";
import { hostname, userInfo } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Finding = { file: string; kind: string };

// the computer's own names, lowercased: the user name, the short host name, macOS's computer and local host names,
// and the account's full-name words; never printed, only matched as whole words. Pieces shorter than four characters
// and the generic ones every machine shares (macbook, apple…) stay out, or "Pro" would match inside "project".
const GENERIC = new Set(["macbook", "imac", "mini", "studio", "apple", "book", "computer", "local", "home", "user"]);
export function ownNames(): string[] {
  const names = new Set<string>();
  const add = (v: string | undefined) => {
    for (const part of String(v ?? "").split(/[\s.]+/)) {
      const piece = part.toLowerCase();
      if (piece.length >= 4 && !GENERIC.has(piece)) names.add(piece);
    }
  };
  add(userInfo().username);
  add(hostname().split(".")[0]);
  for (const key of ["ComputerName", "LocalHostName"] as const) {
    try {
      add(execFileSync("scutil", ["--get", key], { encoding: "utf8" }).trim());
    } catch {
      // not a Mac, or the name is unset: the other names still guard
    }
  }
  try {
    add(execFileSync("id", ["-F"], { encoding: "utf8" }).trim());
  } catch {
    // no full name recorded
  }
  return [...names];
}

const HOME_PATH = /(?:\/Users|\/home)\/[A-Za-z][\w.-]+/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const PHONE = /(?:\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/;

// the added lines of a diff (git diff or git log -p, unified=0), each checked against the patterns and the names
export function scanDiff(diff: string, names: string[]): Finding[] {
  const findings: Finding[] = [];
  let file = "";
  const seen = new Set<string>();
  const note = (kind: string) => {
    const key = `${file}|${kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push({ file, kind });
    }
  };
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      file = line.slice(6);
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const text = line.slice(1);
    if (HOME_PATH.test(text)) note("a home path with a user name (write ~ instead)");
    if (EMAIL.test(text)) note("an email address");
    if (PHONE.test(text)) note("a phone-number shape");
    const lower = text.toLowerCase();
    for (const name of names)
      if (new RegExp(`(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(lower)) {
        note("this computer's user, host or account name");
        break;
      }
  }
  return findings;
}

function git(args: string[], input?: string): string {
  const r = spawnSync("git", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && r.stderr) throw new Error(`git ${args[0]} failed: ${r.stderr.trim().slice(0, 200)}`);
  return r.stdout ?? "";
}

// gitleaks over the staged changes, or over a pushed range; its own report stays unprinted (it can carry a secret)
function gitleaks(args: string[]): boolean {
  const r = spawnSync("gitleaks", args, { encoding: "utf8" });
  if (r.error) {
    console.error("The guard needs gitleaks (brew install gitleaks); nothing was committed.");
    process.exit(1);
  }
  return r.status === 0;
}

function refuse(findings: Finding[], where: string): never {
  console.error(`The guard refused this ${where}:`);
  for (const f of findings) console.error(`  - ${f.file || "(somewhere in the diff)"}: ${f.kind}`);
  console.error("Remove it, or build a made-up value at run time so no literal matches. Never use --no-verify.");
  process.exit(1);
}

function checkStaged() {
  const findings: Finding[] = [];
  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACM"]).trim();
  if (staged) {
    const ignored = git(["check-ignore", "--no-index", "--stdin"], `${staged}\n`).trim();
    for (const file of ignored.split("\n"))
      if (file) findings.push({ file, kind: "a file .gitignore covers (stage it never, or change .gitignore first)" });
  }
  if (!gitleaks(["git", "--staged", "--redact", "--no-banner", "--exit-code", "1"]))
    findings.push({
      file: "the staged changes",
      kind: "a key, password or token (gitleaks git --staged shows it privately)",
    });
  findings.push(...scanDiff(git(["diff", "--cached", "--unified=0"]), ownNames()));
  if (findings.length) refuse(findings, "commit");
}

function checkPush(input: string) {
  const names = ownNames();
  for (const line of input.split("\n")) {
    const [localRef, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localRef || !localSha || /^0+$/.test(localSha)) continue; // a deleted ref carries nothing
    if (/^refs\/heads\/old\//.test(localRef))
      refuse([{ file: localRef, kind: "an old/* branch, which never leaves this computer" }], "push");
    const range = /^0+$/.test(remoteSha ?? "")
      ? [localSha, "--not", "--remotes=origin"]
      : [`${remoteSha}..${localSha}`];
    if (!gitleaks(["git", "--redact", "--no-banner", "--exit-code", "1", `--log-opts=${range.join(" ")}`]))
      refuse(
        [{ file: localRef, kind: "a key, password or token in a pushed commit (gitleaks shows it privately)" }],
        "push",
      );
    const findings = scanDiff(git(["log", "-p", "--unified=0", ...range]), names);
    if (findings.length) refuse(findings, "push");
  }
}

// the command runs only when this file is the program; a test imports it without running anything
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  if (mode === "--staged") checkStaged();
  else if (mode === "--push") {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      input += c;
    });
    process.stdin.on("end", () => checkPush(input));
  } else {
    console.error("guard: --staged (pre-commit) or --push (pre-push, the ref lines on stdin)");
    process.exit(2);
  }
}
