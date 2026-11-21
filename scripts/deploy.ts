// Deploy: committed code only, into a second checkout that launchd runs, so a crash can never restart half-written
// work on real data. It refuses a dirty tree, and takes main or the gate branch being judged (a gate's GO happens by
// looking at the deployed app). It reads my Tailscale login from Tailscale itself and writes it into the real
// settings, renders scripts/kestrel.plist, builds in the live checkout, restarts the service, publishes it on the
// tailnet and waits for health.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const live = resolve(repo, "..", "kestrel-live");
const TAILSCALE = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";

const sh = (cmd: string, args: string[], cwd = repo): string =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

function fail(why: string): never {
  console.error(`deploy refused: ${why}`);
  process.exit(1);
}

// committed, on a reviewable branch
if (sh("git", ["status", "--porcelain"]).trim()) fail("the working tree has uncommitted changes");
const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
if (branch !== "main" && !branch.startsWith("gate-"))
  fail(`the branch is ${branch}: deploy takes main, or a gate branch being judged`);
const sha = sh("git", ["rev-parse", "HEAD"]).trim();

// the live checkout, detached at exactly this commit
if (!existsSync(live)) sh("git", ["worktree", "add", "--detach", live, sha]);
else sh("git", ["-C", live, "checkout", "--detach", sha]);
console.log(`live checkout at ${sha.slice(0, 7)} (${branch})`);
sh("npm", ["ci", "--no-audit", "--no-fund"], live);
sh("node", ["--run", "build"], live);

// the real folders, and my login from Tailscale itself
const data = join(homedir(), "Library", "Application Support", "kestrel");
const logs = join(homedir(), "Library", "Logs", "kestrel");
mkdirSync(data, { recursive: true });
mkdirSync(logs, { recursive: true });
const settingsFile = join(data, "settings.json");
const settings: Record<string, unknown> = existsSync(settingsFile)
  ? JSON.parse(readFileSync(settingsFile, "utf8"))
  : {};
try {
  const status = JSON.parse(sh(TAILSCALE, ["status", "--json"])) as {
    Self?: { UserID?: number };
    User?: Record<string, { LoginName?: string }>;
  };
  const login = status.User?.[String(status.Self?.UserID ?? "")]?.LoginName;
  if (login) settings.tailscaleLogin = login;
} catch {
  // Tailscale didn't answer: the login already in the settings stays
}
if (!settings.tailscaleLogin) fail("no Tailscale login: is Tailscale running and signed in?");
writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);

// launchd runs the live checkout; the plist is rendered, never written by hand
const plist = readFileSync(join(repo, "scripts", "kestrel.plist"), "utf8")
  .replaceAll("__NODE__", process.execPath)
  .replaceAll("__DIR__", live)
  .replaceAll("__DATA__", data)
  .replaceAll("__LOGS__", logs);
const plistFile = join(homedir(), "Library", "LaunchAgents", "local.kestrel.plist");
writeFileSync(plistFile, plist);
const uid = sh("id", ["-u"]).trim();
try {
  execFileSync("launchctl", ["bootout", `gui/${uid}/local.kestrel`], { stdio: "ignore" });
} catch {
  // not loaded yet
}
sh("launchctl", ["bootstrap", `gui/${uid}`, plistFile]);

// on the tailnet, never public
try {
  sh(TAILSCALE, ["serve", "--bg", "--https=8790", "http://127.0.0.1:8790"]);
} catch {
  console.error("tailscale serve didn't answer: the app runs, but the phone can't reach it yet");
}

// alive, with my login
const login = String(settings.tailscaleLogin);
const until = Date.now() + 15_000;
let up = false;
while (Date.now() < until && !up) {
  try {
    const res = await fetch("http://127.0.0.1:8790/api/health", { headers: { "tailscale-user-login": login } });
    up = res.ok;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!up) fail(`the service didn't answer on 8790; its log: ${join(logs, "kestrel.log")}`);
console.log("deployed: kestrel answers on 8790, on the tailnet at https://<this computer>.ts.net:8790");
