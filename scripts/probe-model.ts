// A by-hand probe of the real model door, with made-up text: both listed models answer a tiny JSON ask through the
// queue. Run: node scripts/probe-model.ts
import { z } from "zod";
import { callModel } from "../src/ai/client.ts";
import { liveModels } from "../src/platform/config.ts";

// the real door on purpose (KESTREL_MODEL_URL for another), never the made-up data folder's dead one
const settings = liveModels();
const Shape = z.object({ ok: z.boolean() });
for (const model of [settings.careful, settings.fast]) {
  const got = await callModel(
    settings,
    {
      model,
      system: 'Answer JSON only: {"ok": true}',
      prompt: "A made-up probe: answer ok true.",
      maxTokens: 600,
      thinking: true,
    },
    Shape,
  );
  if (got.ok)
    console.log(
      `${model}: ok in ${(got.ms / 1000).toFixed(1)}s (tokens in ${got.tokensIn ?? "?"}, out ${got.tokensOut ?? "?"})`,
    );
  else console.log(`${model}: ${got.why} after ${(got.ms / 1000).toFixed(1)}s — ${got.detail}`);
}
