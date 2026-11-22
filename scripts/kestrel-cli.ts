// The kestrel command, for the agent's hands: queue, claim, report, retry, list. It speaks to the loopback door with
// the computer's own login (read from the data folder's settings), plain JSON out, exit 1 on a refusal with the
// reason on stderr. KESTREL_URL picks the door (default the deployed one).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../src/platform/paths.ts";

const URL_BASE = process.env.KESTREL_URL ?? "http://127.0.0.1:8790";

async function call(path: string, body?: unknown): Promise<unknown> {
  const login = (JSON.parse(readFileSync(join(dataDir(), "settings.json"), "utf8")) as { tailscaleLogin: string })
    .tailscaleLogin;
  let res: Response;
  try {
    res = await fetch(`${URL_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "tailscale-user-login": login },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    console.error(`kestrel isn't answering at ${URL_BASE}`);
    process.exit(1);
  }
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    console.error(data.error ?? `the door answered ${res.status}`);
    process.exit(1);
  }
  return data;
}

const [, , command, ...rest] = process.argv;
const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));
switch (command) {
  case "apply-queue": {
    if (!rest[0]) usage();
    out(await call("/api/apply/queue", rest[0].startsWith("http") ? { link: rest[0] } : { listing: rest[0] }));
    break;
  }
  case "apply-claim":
    out(await call("/api/apply/claim", { agent: rest[0] ?? "agent" }));
    break;
  case "apply-report": {
    const id = rest[0];
    if (!id) usage();
    if (rest.includes("--sent")) out(await call("/api/apply/report", { id, state: "sent" }));
    else if (rest.includes("--not-sent"))
      out(
        await call("/api/apply/report", { id, state: "not-sent", reason: rest[rest.indexOf("--not-sent") + 1] ?? "" }),
      );
    else if (rest.includes("--needs-me"))
      out(
        await call("/api/apply/report", { id, state: "needs-me", reason: rest[rest.indexOf("--needs-me") + 1] ?? "" }),
      );
    else if (rest.includes("--applying")) out(await call("/api/apply/report", { id, state: "applying" }));
    else usage();
    break;
  }
  case "apply-retry":
    if (!rest[0]) usage();
    out(await call("/api/apply/retry", { id: rest[0] }));
    break;
  case "apply-list":
    out(await call("/api/apply"));
    break;
  case "task-list":
    out(await call(`/api/tasks?which=${rest[0] === "done" ? "done" : rest[0] === "all" ? "all" : "open"}`));
    break;
  case "task-add": {
    if (!rest[0]) usage();
    const forAt = rest.indexOf("--for");
    out(await call("/api/tasks", { text: rest[0], who: forAt >= 0 ? (rest[forAt + 1] ?? "") : "" }));
    break;
  }
  case "task-close": {
    const noteAt = rest.indexOf("--note");
    if (!rest[0] || noteAt < 0) usage();
    out(await call(`/api/tasks/${rest[0]}/close`, { note: rest[noteAt + 1] ?? "" }));
    break;
  }
  case "task-reopen":
    if (!rest[0]) usage();
    out(await call(`/api/tasks/${rest[0]}/reopen`, {}));
    break;
  default:
    usage();
}

function usage(): never {
  console.error(
    "kestrel: apply-queue <link|listing-id> | apply-claim [agent] | apply-report <id> --sent | --not-sent <why> | --needs-me <what> | --applying | apply-retry <id> | apply-list\n" +
      "        task-list [open|done|all] | task-add <text> [--for <who>] | task-close <id> --note <what was done> | task-reopen <id>",
  );
  process.exit(2);
}
