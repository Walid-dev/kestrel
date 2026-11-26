// Shopping's routes (v1.2): the wants with the figures and the watched products; a new want (started, or queued
// behind the one that runs); a want's view; my marks on it (a budget changes the ranking at once); my answer to one of
// its questions (re-ranked at once); Run again; Delete and Restore; a product's marks, Find offers, its watch, Delete
// and Restore; a product's price readings for the chart. Every body goes through zod; a request that doesn't read
// answers 400 with its first reason in plain words.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { Refused } from "../domain/notes/documents.ts";
import { loadRegion, placeOf } from "../domain/shopping/region.ts";
import {
  addWant,
  deletedProduct,
  deletedWant,
  deleteProduct,
  deleteWant,
  getProduct,
  getWant,
  queueJob,
  readingsOf,
  restoreProduct,
  restoreWant,
  setAnswer,
  setProductMarks,
  setWantMarks,
  setWatch,
  sweepWants,
} from "../domain/shopping/store.ts";
import {
  deletedProductView,
  judgeOf,
  productViewOf,
  rerank,
  shoppingHome,
  type ViewOpts,
  wantView,
} from "../domain/shopping/view.ts";
import { type Settings, shoppingOf } from "../platform/config.ts";

const ID = z.object({ id: z.string().regex(/^[\w-]{1,64}$/, "an id") });
const MARK = z.enum(["open", "bought", "passed"]);
const WATCH_DAYS = [7, 14, 30, 90] as const;

// the validator's refusal, as the page shows it: its first reason, not the whole report
const plainly = (r: { success: boolean; error?: { issues: { message: string }[] } }, c: Context) =>
  r.success
    ? undefined
    : c.json({ error: r.error?.issues[0]?.message ?? "that request isn't one kestrel understands" }, 400);

// a refusal in words answers 400; anything else is the computer's fault (errors.ts)
const refusing = <T>(c: Context, fn: () => T) => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  }
};

export type ShoppingHooks = {
  // the run (run.ts): told a want was queued, it starts it when the model is free
  started?: () => void;
  // what the views need: the region's currency and store names, the deal judge
  view?: () => ViewOpts;
};

export function mountShopping(app: Hono, db: DatabaseSync, settings: Settings, hooks: ShoppingHooks = {}) {
  // a run a restart cut short says so; a queued want keeps its job and starts when the model is free
  sweepWants(db);
  // the region's currency and store names, read once: a region file that doesn't read stops kestrel with its reason
  const region = loadRegion(settings);
  const place = placeOf(region);
  const opts = (): ViewOpts => ({
    read: shoppingOf(settings).read,
    place,
    judge: judgeOf(db, region),
    ...hooks.view?.(),
  });
  const kick = () => hooks.started?.();
  kick();

  app.get("/api/shopping", (c) => c.json(shoppingHome(db, opts())));

  app.post(
    "/api/shopping/wants",
    zValidator(
      "json",
      z.object({
        words: z
          .string()
          .trim()
          .min(3, "say what you need, in a few words")
          .max(300, "a want of 300 characters at most"),
        budget: z.number().int("a budget is a whole amount").min(1, "a budget is a whole amount, from 1").nullish(),
        note: z.string().max(500, "a note of 500 characters at most").optional(),
      }),
      plainly,
    ),
    (c) =>
      refusing(c, () => {
        const id = addWant(db, c.req.valid("json"));
        kick();
        return c.json({ id }, 202);
      }),
  );

  app.get("/api/shopping/wants/:id", zValidator("param", ID, plainly), (c) => {
    const { id } = c.req.valid("param");
    const view = wantView(db, id, opts());
    if (view) return c.json(view);
    const gone = deletedWant(db, id);
    return c.json({ error: gone ? "that want was deleted" : "no such want", ...(gone ? { deleted: gone } : {}) }, 404);
  });

  // my marks on a want; a new budget re-ranks at once (a product over it goes to also considered)
  app.patch(
    "/api/shopping/wants/:id",
    zValidator("param", ID, plainly),
    zValidator(
      "json",
      z.object({
        budget: z.number().int("a budget is a whole amount").min(1, "a budget is a whole amount, from 1").nullish(),
        note: z.string().max(500, "a note of 500 characters at most").optional(),
        status: MARK.optional(),
        starred: z.boolean().optional(),
      }),
      plainly,
    ),
    (c) =>
      refusing(c, () => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const before = getWant(db, id);
        setWantMarks(db, id, body);
        if (body.budget !== undefined && before?.budget !== body.budget) rerank(db, id, opts().place);
        return c.json(wantView(db, id, opts()));
      }),
  );

  // my answer to one of its questions: kept, and the list re-ranked at once (never a new run)
  app.post(
    "/api/shopping/wants/:id/answers",
    zValidator("param", ID, plainly),
    zValidator(
      "json",
      z.object({ key: z.string().min(1).max(60), option: z.number().int("an option's number").min(0) }),
      plainly,
    ),
    (c) =>
      refusing(c, () => {
        const { id } = c.req.valid("param");
        const { key, option } = c.req.valid("json");
        setAnswer(db, id, key, option);
        rerank(db, id, opts().place);
        return c.json(wantView(db, id, opts()));
      }),
  );

  app.post("/api/shopping/wants/:id/run", zValidator("param", ID, plainly), (c) =>
    refusing(c, () => {
      queueJob(db, c.req.valid("param").id, { do: "full" });
      kick();
      return c.json({ ok: true }, 202);
    }),
  );

  app.delete("/api/shopping/wants/:id", zValidator("param", ID, plainly), (c) =>
    refusing(c, () => {
      deleteWant(db, c.req.valid("param").id);
      return c.json({ ok: true });
    }),
  );

  app.post("/api/shopping/wants/:id/restore", zValidator("param", ID, plainly), (c) => {
    const { id } = c.req.valid("param");
    if (!deletedWant(db, id)) return c.json({ error: "that want isn't deleted" }, 409);
    return refusing(c, () => {
      restoreWant(db, id);
      return c.json(wantView(db, id, opts()));
    });
  });

  // a product: my marks (star, Bought or Passed, a target in cents; null clears it)
  app.patch(
    "/api/shopping/products/:id",
    zValidator("param", ID, plainly),
    zValidator(
      "json",
      z.object({
        starred: z.boolean().optional(),
        status: MARK.optional(),
        target: z.number().int("a target is a price in cents").min(1, "a target is a price, from one cent").nullish(),
      }),
      plainly,
    ),
    (c) =>
      refusing(c, () => {
        const { id } = c.req.valid("param");
        setProductMarks(db, id, c.req.valid("json"));
        return c.json(productViewOf(db, id, opts()));
      }),
  );

  // Find offers for a product I picked: an offers job on its want, joined to a queued one
  app.post("/api/shopping/products/:id/offers", zValidator("param", ID, plainly), (c) =>
    refusing(c, () => {
      const p = getProduct(db, c.req.valid("param").id);
      if (!p) throw new Refused("no such product");
      queueJob(db, p.want, { do: "offers", products: [p.id] });
      kick();
      return c.json({ ok: true }, 202);
    }),
  );

  // a watch: how long (days), how often (hours), and whether a return to stock pings
  app.put(
    "/api/shopping/products/:id/watch",
    zValidator("param", ID, plainly),
    zValidator(
      "json",
      z.object({
        days: z
          .number()
          .refine((d) => (WATCH_DAYS as readonly number[]).includes(d), "a watch lasts 7, 14, 30 or 90 days"),
        everyHours: z.union([z.literal(4), z.literal(12), z.literal(24)], "every 4, 12 or 24 hours"),
        stock: z.boolean().default(true),
      }),
      plainly,
    ),
    (c) =>
      refusing(c, () => {
        const { id } = c.req.valid("param");
        const { days, everyHours, stock } = c.req.valid("json");
        const now = new Date();
        const had = getProduct(db, id)?.watch;
        setWatch(
          db,
          id,
          {
            until: new Date(now.getTime() + days * 86_400_000).toISOString(),
            everyHours,
            stock,
            began: had?.began ?? now.toISOString(),
            last: had?.last ?? null,
            low: had?.low ?? null,
            pinged: had?.pinged ?? null,
            wasOut: had?.wasOut ?? false,
          },
          now,
        );
        return c.json(productViewOf(db, id, opts()));
      }),
  );

  app.delete("/api/shopping/products/:id/watch", zValidator("param", ID, plainly), (c) =>
    refusing(c, () => {
      const { id } = c.req.valid("param");
      setWatch(db, id, null);
      return c.json(productViewOf(db, id, opts()));
    }),
  );

  app.delete("/api/shopping/products/:id", zValidator("param", ID, plainly), (c) =>
    refusing(c, () => {
      const want = deleteProduct(db, c.req.valid("param").id);
      rerank(db, want, opts().place);
      return c.json({ ok: true });
    }),
  );

  app.post("/api/shopping/products/:id/restore", zValidator("param", ID, plainly), (c) => {
    const { id } = c.req.valid("param");
    if (!deletedProduct(db, id)) return c.json({ error: "that product isn't deleted" }, 409);
    return refusing(c, () => {
      const want = restoreProduct(db, id);
      rerank(db, want, opts().place);
      return c.json(productViewOf(db, id, opts()));
    });
  });

  // a product's readings, oldest first, for its price line; a deleted product's sheet opens it as it was
  app.get("/api/shopping/products/:id/history", zValidator("param", ID, plainly), (c) => {
    const { id } = c.req.valid("param");
    const p = getProduct(db, id);
    if (!p) return c.json({ error: deletedProduct(db, id) ? "that product was deleted" : "no such product" }, 404);
    return c.json({ readings: readingsOf(db, id), target: p.target });
  });

  // one product; a deleted one as it was, so its sheet says so first and offers Restore
  app.get("/api/shopping/products/:id", zValidator("param", ID, plainly), (c) => {
    const { id } = c.req.valid("param");
    const view = productViewOf(db, id, opts()) ?? deletedProductView(db, id, opts());
    return view ? c.json(view) : c.json({ error: "no such product" }, 404);
  });
}
