// A stand-in model for tests and the eval: a tiny local server that speaks the model door's streaming shape and
// answers whatever the test tells it to. No model runs; the checks stay fast and free. It also stands in for the
// door's web search and page reader (/web/search, /web/fetch): a plan with json answers that request as JSON, as oMLX
// does (HTTP 200 with {"ok": …}, its failures inside).
import { createServer, type Server } from "node:http";

// finish: why the stream says it stopped ("length": out of room), as the door reports it; error: the door's error
// inside the stream, after the words so far (oMLX's way once it has answered 200); json: an answer as JSON instead of
// a stream (the web's endpoints)
export type StandInPlan = {
  content?: string;
  delayMs?: number;
  status?: number;
  finish?: string;
  error?: string;
  json?: unknown;
};
// what a request carried: a chat's model and messages, or the web's words (query) and address (url)
export type StandInBody = {
  model: string;
  messages: { role: string; content: string }[];
  query?: string;
  url?: string;
};

export function startStandIn(plan: (body: StandInBody, path: string) => StandInPlan): Promise<{
  url: string;
  calls: () => number;
  close: () => Promise<void>;
}> {
  let calls = 0;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      calls++;
      const p = plan(JSON.parse(raw), req.url ?? "");
      setTimeout(() => {
        if (p.json !== undefined) {
          res.writeHead(p.status ?? 200, { "content-type": "application/json" }).end(JSON.stringify(p.json));
          return;
        }
        if (p.status) {
          res.writeHead(p.status).end();
          return;
        }
        res.writeHead(200, { "content-type": "text/event-stream" });
        const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
        const content = p.content ?? "";
        // two pieces, like a real stream, then the usage and the end (or the door's error in their place)
        const half = Math.ceil(content.length / 2);
        for (const piece of [content.slice(0, half), content.slice(half)])
          send({ choices: [{ delta: { content: piece } }] });
        if (p.error) send({ error: { message: p.error, type: "server_error" } });
        else
          send({
            choices: [{ delta: {}, finish_reason: p.finish ?? "stop" }],
            usage: { prompt_tokens: 7, completion_tokens: 9 },
          });
        res.write("data: [DONE]\n\n");
        res.end();
      }, p.delayMs ?? 0);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${address.port}/v1`,
        calls: () => calls,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
