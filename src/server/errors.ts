// What a failed request answers. A bad request (a body that isn't JSON, any refusal Hono or a validator throws as an
// HTTPException) answers its own status, 400 most often, in plain words; anything else is the computer's fault and
// answers 500. Either way the log gets one plain line, never a stack: the service log must stay free of paths and
// content, so the words go through plainWords, and a 500 never shows its words at all.
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { plainWords } from "../platform/plain.ts";

export const answerFailure: ErrorHandler = (e, c) => {
  if (e instanceof HTTPException && e.status < 500) {
    // Hono says "Malformed JSON in request body"; the phone shows the error as it is, so it says so plainly
    const words = /malformed json/i.test(e.message)
      ? "the request's body isn't JSON"
      : plainWords(e.message) || "that request isn't one kestrel understands";
    console.error(`a request was refused: ${e.status}: ${words}`);
    return c.json({ error: words }, e.status);
  }
  console.error(`a request failed: ${e.name}: ${plainWords(e.message)}`);
  return c.json({ error: "something went wrong on the computer's side" }, 500);
};
