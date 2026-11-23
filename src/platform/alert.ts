// A ping to my phone through ntfy, the channel the old setup uses (my yes, 2026-11-23). Each channel's topic is read
// from its file at send time and goes only into the request: anyone who knows a topic can read its pings, so it is
// never printed, logged or kept. Without the alerts setting, or without a channel's file, that channel stays quiet.
// Never throws: a failed ping must not stop a run.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { Settings } from "./config.ts";

export type Alert = {
  channel: "deals" | "jobs";
  title: string;
  message: string;
  click?: string; // opened when the ping is tapped
  tags?: string[]; // ntfy's emoji names, shown before the title
};

// ntfy shows a message over 4,096 bytes as a file to download: a ping stays under that, its last lines going first
const MESSAGE_BYTES = 3900;
function fit(message: string): string {
  const lines = message.split("\n");
  while (lines.length > 1 && Buffer.byteLength(lines.join("\n")) > MESSAGE_BYTES) lines.length -= 1;
  return lines.join("\n");
}

export async function sendAlert(settings: Settings, a: Alert): Promise<{ sent: boolean; why: string }> {
  const file = settings.alerts?.topics[a.channel];
  if (!settings.alerts || !file) return { sent: false, why: "no alert channel set" };
  let topic = "";
  try {
    topic = readFileSync(file.replace(/^~(?=\/)/, homedir()), "utf8").trim();
  } catch {
    return { sent: false, why: "the channel's file can't be read" };
  }
  if (!topic) return { sent: false, why: "the channel's file is empty" };
  try {
    const res = await fetch(settings.alerts.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic,
        title: a.title,
        message: fit(a.message),
        ...(a.tags?.length ? { tags: a.tags } : {}),
        ...(a.click ? { click: a.click } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { sent: true, why: "" } : { sent: false, why: `ntfy answered ${res.status}` };
  } catch {
    return { sent: false, why: "ntfy isn't answering" };
  }
}
