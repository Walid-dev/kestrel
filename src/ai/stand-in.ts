// A stand-in model for tests and the eval: a tiny local server that speaks the model door's streaming shape and
// answers whatever the test tells it to. No model runs; the checks stay fast and free.
import { createServer, type Server } from "node:http";

// finish: why the stream says it stopped ("length": out of room), as the door reports it
export type StandInPlan = { content?: string; delayMs?: number; status?: number; finish?: string };

export function startStandIn(plan: (body: { model: string; messages: { content: string }[] }) => StandInPlan): Promise<{
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
      const p = plan(JSON.parse(raw));
      setTimeout(() => {
        if (p.status) {
          res.writeHead(p.status).end();
          return;
        }
        res.writeHead(200, { "content-type": "text/event-stream" });
        const content = p.content ?? "";
        // two pieces, like a real stream, then the usage and the end
        const half = Math.ceil(content.length / 2);
        for (const piece of [content.slice(0, half), content.slice(half)])
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
        res.write(
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: p.finish ?? "stop" }],
            usage: { prompt_tokens: 7, completion_tokens: 9 },
          })}\n\n`,
        );
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
