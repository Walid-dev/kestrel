// One small client for the computer's models, through the model queue (oMLX serves one request at a time and holds
// the rest). Two ways to ask, one request underneath: callModel wants an answer in a set shape (a zod shape,
// requested as JSON); chatModel wants plain Markdown for a conversation and hears the answer grow. Both stream, stop
// after a time limit that grows with the request, and never throw: every outcome is a value. Before any call they
// refuse a model my settings don't list and a request too long for the model. This module may not touch the database
// or the domain (scripts/boundaries.ts); the domain records calls itself.
import type { z } from "zod";

export type ModelSettings = { url: string; careful: string; fast: string; contextChars: number };
export type Outcome = "unlisted" | "too-long" | "down" | "timeout" | "refusal" | "shape";
export type ModelAnswer<T> =
  | { ok: true; value: T; ms: number; model: string; tokensIn: number | null; tokensOut: number | null }
  | { ok: false; why: Outcome; detail: string; ms: number; model: string };

export type Call = {
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  thinking?: boolean; // oMLX's enable_thinking: the fast model follows shapes poorly without it
  timeoutMs?: number; // tests set it; otherwise the limit grows with the request
  onText?: (soFar: string) => void; // hears the answer grow, for a screen that shows the work's progress
};

// a conversation: what the model is (with the page it helps on), then the turns so far, mine last
export type Turn = { role: "user" | "assistant"; content: string };
export type Chat = {
  model: string;
  system: string;
  messages: Turn[];
  maxTokens?: number;
  thinking?: boolean;
  timeoutMs?: number;
};

// reading grows with the prompt, writing with the answer; a local model costs time, never money
export const timeLimit = (chars: number, maxTokens: number) =>
  Math.min(600_000, 45_000 + Math.ceil(chars * 0.4) + maxTokens * 150);

// a thinking model's thoughts, when a door sends them inline, never reach the answer (an open one hides it all)
const visible = (text: string) => text.replace(/^\s*<think>[\s\S]*?(<\/think>\s*|$)/, "");

type Streamed =
  | { ok: true; text: string; finish: string; tokensIn: number | null; tokensOut: number | null }
  | { ok: false; why: Outcome; detail: string };

// the one request to the door: the checks first, then the answer's pieces as they come (onText hears the answer so
// far), then why it stopped — "length" means it ran out of room
async function stream(settings: ModelSettings, chat: Chat, onText?: (soFar: string) => void): Promise<Streamed> {
  const fail = (why: Outcome, detail: string): Streamed => ({ ok: false, why, detail });
  if (chat.model !== settings.careful && chat.model !== settings.fast)
    return fail("unlisted", `my settings list ${settings.careful} and ${settings.fast}`);
  const chars = chat.system.length + chat.messages.reduce((n, m) => n + m.content.length, 0);
  if (chars > settings.contextChars)
    return fail("too-long", `${chars} characters; the limit is ${settings.contextChars}`);
  const maxTokens = chat.maxTokens ?? 4000;
  const limit = chat.timeoutMs ?? timeLimit(chars, maxTokens);
  let res: Response;
  try {
    res = await fetch(`${settings.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(limit),
      body: JSON.stringify({
        model: chat.model,
        stream: true,
        max_tokens: maxTokens,
        // no response_format: the door's JSON grammar pushed these models into top-level arrays; the prompt asks for
        // one object, the client parses the whole text and falls back to the brace slice (the old setup's lesson too)
        ...(chat.thinking === undefined ? {} : { enable_thinking: chat.thinking }),
        messages: [{ role: "system", content: chat.system }, ...chat.messages],
      }),
    });
  } catch (e) {
    return fail((e as Error).name === "TimeoutError" ? "timeout" : "down", (e as Error).message);
  }
  if (!res.ok || !res.body) return fail("down", `the model door answered ${res.status}`);
  let text = "";
  let finish = "";
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let nl = buffer.indexOf("\n"); nl !== -1; nl = buffer.indexOf("\n")) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const piece = JSON.parse(data) as {
            choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const more = piece.choices?.[0]?.delta?.content ?? "";
          if (more) {
            text += more;
            onText?.(visible(text));
          }
          finish = piece.choices?.[0]?.finish_reason ?? finish;
          if (piece.usage) {
            tokensIn = piece.usage.prompt_tokens ?? tokensIn;
            tokensOut = piece.usage.completion_tokens ?? tokensOut;
          }
        } catch {
          // a keep-alive or partial line: the next loop gets the rest
        }
      }
    }
  } catch (e) {
    return fail((e as Error).name === "TimeoutError" ? "timeout" : "down", (e as Error).message);
  }
  return { ok: true, text, finish, tokensIn, tokensOut };
}

const outOfRoom = (finish: string) =>
  finish === "length"
    ? "the model spent its whole answer thinking: raise the call's max tokens"
    : "the model answered nothing";

export async function callModel<T>(settings: ModelSettings, call: Call, shape: z.ZodType<T>): Promise<ModelAnswer<T>> {
  const started = Date.now();
  const fail = (why: Outcome, detail: string): ModelAnswer<T> => ({
    ok: false,
    why,
    detail,
    ms: Date.now() - started,
    model: call.model,
  });
  const got = await stream(
    settings,
    {
      model: call.model,
      system: call.system,
      messages: [{ role: "user", content: call.prompt }],
      maxTokens: call.maxTokens,
      thinking: call.thinking,
      timeoutMs: call.timeoutMs,
    },
    call.onText,
  );
  if (!got.ok) return fail(got.why, got.detail);
  const { finish, tokensIn, tokensOut } = got;
  const text = visible(got.text);
  if (text.trim() === "") return fail("refusal", outOfRoom(finish));
  let raw: unknown;
  const object = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    raw = JSON.parse(text.trim());
  } catch {
    try {
      raw = JSON.parse(object);
    } catch {
      try {
        raw = JSON.parse(escapeRawBreaks(object));
      } catch {
        // the detail never carries the answer's words: a record of calls stays free of document content
        return fail(
          "shape",
          `not JSON: the answer starts with ${JSON.stringify(text.trim().slice(0, 1))} and has ${text.length} characters`,
        );
      }
    }
  }
  // some models wrap the one object in a one-element array: unwrap it, the shape still judges
  if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === "object" && raw[0] !== null) raw = raw[0];
  const read = shape.safeParse(raw);
  if (!read.success)
    return fail("shape", read.error.issues.map((i) => `${i.path.join(".") || "answer"}: ${i.message}`).join("; "));
  return { ok: true, value: read.data, ms: Date.now() - started, model: call.model, tokensIn, tokensOut };
}

// a conversation's answer: plain Markdown, heard as it grows (onText), whole at the end. One cut short by its room
// says so at its foot, so the next turn can ask it to go on.
export async function chatModel(
  settings: ModelSettings,
  chat: Chat,
  onText?: (soFar: string) => void,
): Promise<ModelAnswer<string>> {
  const started = Date.now();
  const got = await stream(settings, chat, onText);
  const ms = Date.now() - started;
  if (!got.ok) return { ok: false, why: got.why, detail: got.detail, ms, model: chat.model };
  const text = visible(got.text).trim();
  if (!text) return { ok: false, why: "refusal", detail: outOfRoom(got.finish), ms, model: chat.model };
  return {
    ok: true,
    value: got.finish === "length" ? `${text}\n\n*(cut short: ask me to go on)*` : text,
    ms,
    model: chat.model,
    tokensIn: got.tokensIn,
    tokensOut: got.tokensOut,
  };
}

// a long text in a JSON string often comes with its line breaks raw, which JSON forbids (the first live letter came
// back that way): inside strings only, they are escaped before the parse gives up. Outside strings nothing changes.
export function escapeRawBreaks(s: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
    } else if (escaped) {
      escaped = false;
      out += ch;
    } else if (ch === "\\") {
      escaped = true;
      out += ch;
    } else if (ch === '"') {
      inString = false;
      out += ch;
    } else out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : ch;
  }
  return out;
}
