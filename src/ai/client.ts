// One small client for the computer's models, through the model queue (oMLX serves one request at a time and holds
// the rest). It asks for an answer in a set shape (a zod shape, requested as JSON), streams it, stops after a time
// limit that grows with the request, and never throws: every outcome is a value. It refuses, before any call, a
// model my settings don't list and a request too long for the model. This module may not touch the database or the
// domain (scripts/boundaries.ts); the domain records calls itself.
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
  timeoutMs?: number; // tests set it; otherwise the limit grows with the request
};

// reading grows with the prompt, writing with the answer; a local model costs time, never money
export const timeLimit = (chars: number, maxTokens: number) =>
  Math.min(600_000, 45_000 + Math.ceil(chars * 0.4) + maxTokens * 150);

export async function callModel<T>(settings: ModelSettings, call: Call, shape: z.ZodType<T>): Promise<ModelAnswer<T>> {
  const started = Date.now();
  const ms = () => Date.now() - started;
  const fail = (why: Outcome, detail: string): ModelAnswer<T> => ({
    ok: false,
    why,
    detail,
    ms: ms(),
    model: call.model,
  });
  if (call.model !== settings.careful && call.model !== settings.fast)
    return fail("unlisted", `my settings list ${settings.careful} and ${settings.fast}`);
  const chars = call.system.length + call.prompt.length;
  if (chars > settings.contextChars)
    return fail("too-long", `${chars} characters; the limit is ${settings.contextChars}`);
  const maxTokens = call.maxTokens ?? 4000;
  const limit = call.timeoutMs ?? timeLimit(chars, maxTokens);
  let res: Response;
  try {
    res = await fetch(`${settings.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(limit),
      body: JSON.stringify({
        model: call.model,
        stream: true,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
      }),
    });
  } catch (e) {
    return fail((e as Error).name === "TimeoutError" ? "timeout" : "down", (e as Error).message);
  }
  if (!res.ok || !res.body) return fail("down", `the model door answered ${res.status}`);
  let text = "";
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
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          text += piece.choices?.[0]?.delta?.content ?? "";
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
  if (text.trim() === "") return fail("refusal", "the model answered nothing");
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return fail("shape", `not JSON: ${text.slice(0, 120)}`);
  }
  const read = shape.safeParse(raw);
  if (!read.success)
    return fail("shape", read.error.issues.map((i) => `${i.path.join(".") || "answer"}: ${i.message}`).join("; "));
  return { ok: true, value: read.data, ms: ms(), model: call.model, tokensIn, tokensOut };
}
