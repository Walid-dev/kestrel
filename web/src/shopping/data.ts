// Shopping's data as its pages read it: the wants with the figures (Shopping's page), a want's view, a product's sheet
// and its price readings; every change I make (a new want, an answer, a mark, a watch, Run again, Find offers, Delete
// and Restore); and what the pages share: the times, the money, the one price map, the state chips. Every query starts
// with "shopping", the key each change reads again, so every open view agrees after it. While a want waits or works,
// its page and Shopping's ask every 2 seconds, so its steps show as they happen.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatMoney } from "../../../src/shared/kinds.ts";
import type {
  Mark,
  ProductView,
  ShoppingHome,
  VerdictWord,
  WantState,
  WantView,
  Watch,
} from "../../../src/shared/shopping.ts";
import type { Tone } from "../ui/pills.tsx";

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `the server answered ${res.status}`);
  return j;
}

// a change sent: its answer, or its refusal in the server's own plain words
export async function send<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `the server answered ${res.status}`);
  return j;
}

export const working = (s: WantState) => s === "queued" || s === "running";

export const useShopping = () =>
  useQuery({
    queryKey: ["shopping", "home"],
    queryFn: () => getJson<ShoppingHome>("/api/shopping"),
    refetchInterval: (q) => (q.state.data?.wants.some((w) => working(w.state)) ? 2000 : 60_000),
  });

// a deleted want answers 404 with when it went: its page says so and offers Restore. Any other 404 is a want that
// isn't there (its message the status alone, never asked again); any other failure is asked again, three times
export type GoneWant = { gone: { at: string; words: string } };
export const useWant = (id: string) =>
  useQuery({
    queryKey: ["shopping", "want", id],
    queryFn: async (): Promise<WantView | GoneWant> => {
      const res = await fetch(`/api/shopping/wants/${encodeURIComponent(id)}`);
      const j = (await res.json().catch(() => ({}))) as WantView & { deleted?: { at: string; words: string } };
      if (res.status === 404 && j.deleted) return { gone: j.deleted };
      if (!res.ok) throw new Error(String(res.status));
      return j;
    },
    retry: (n, e) => e.message !== "404" && n < 3,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && !("gone" in d) && working(d.state) ? 2000 : false;
    },
  });

// a product's sheet: as it is, or as it was when deleted (deleted: when), so the sheet says so and offers Restore
export type Sheet = ProductView & { deleted?: { at: string } };
export const useProduct = (id: string | null) =>
  useQuery({
    queryKey: ["shopping", "product", id],
    queryFn: async () => {
      const res = await fetch(`/api/shopping/products/${encodeURIComponent(id ?? "")}`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Sheet;
    },
    enabled: Boolean(id),
    retry: (n, e) => e.message !== "404" && n < 3,
  });

// a product's price readings, oldest first, for its price line
export type Reading = {
  offer: string;
  store: string;
  condition: string;
  at: string;
  price: number;
  regular: number | null;
  stock: string;
  method: string;
};
export const useHistory = (id: string | null, enabled = true) =>
  useQuery({
    queryKey: ["shopping", "history", id],
    queryFn: () =>
      getJson<{ readings: Reading[]; target: number | null }>(
        `/api/shopping/products/${encodeURIComponent(id ?? "")}/history`,
      ),
    enabled: Boolean(id) && enabled,
    retry: (n, e) => !/deleted|no such/.test(e.message) && n < 3,
  });

// one change, then every Shopping view asks again; the button that sent it stays busy until they have
export function useChange<V, R = unknown>(fn: (v: V) => Promise<R>, done?: (r: R, v: V) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: done,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["shopping"] }),
  });
}

const want = (id: string) => `/api/shopping/wants/${encodeURIComponent(id)}`;
const product = (id: string) => `/api/shopping/products/${encodeURIComponent(id)}`;
// every door a page uses, by what it does
export const doors = {
  add: (v: { words: string; budget?: number | null; note?: string }) =>
    send<{ id: string }>("/api/shopping/wants", "POST", v),
  markWant: (v: { id: string; budget?: number | null; note?: string; status?: Mark; starred?: boolean }) => {
    const { id, ...body } = v;
    return send<WantView>(want(id), "PATCH", body);
  },
  answer: (v: { id: string; key: string; option: number }) =>
    send<WantView>(`${want(v.id)}/answers`, "POST", { key: v.key, option: v.option }),
  run: (id: string) => send(`${want(id)}/run`, "POST"),
  removeWant: (id: string) => send(want(id), "DELETE"),
  restoreWant: (id: string) => send<WantView>(`${want(id)}/restore`, "POST"),
  markProduct: (v: { id: string; starred?: boolean; status?: Mark; target?: number | null }) => {
    const { id, ...body } = v;
    return send<ProductView>(product(id), "PATCH", body);
  },
  findOffers: (id: string) => send(`${product(id)}/offers`, "POST"),
  watch: (v: { id: string; days: number; everyHours: Watch["everyHours"]; stock: boolean }) => {
    const { id, ...body } = v;
    return send<ProductView>(`${product(id)}/watch`, "PUT", body);
  },
  unwatch: (id: string) => send<ProductView>(`${product(id)}/watch`, "DELETE"),
  removeProduct: (id: string) => send(product(id), "DELETE"),
  restoreProduct: (id: string) => send<ProductView>(`${product(id)}/restore`, "POST"),
};

// ── What the pages share ───────────────────────────────────────────────────────────────────────────────────────────

// the price, one map: a verdict's chip and every price pill take their tone from it, on the money scale (a new low
// great, a good price good, typical fair, high and inflated poor), so a price never shows two tones. Not enough history
// yet is grey: no judgement
export const priceTone = (word: VerdictWord | null | undefined): Tone | undefined =>
  word === "new-low"
    ? "great"
    : word === "good"
      ? "good"
      : word === "typical"
        ? "fair"
        : word === "high" || word === "inflated"
          ? "poor"
          : word === "history"
            ? "muted"
            : undefined;
// a price pill's classes: the money pill in the verdict's tone (none when there is no verdict)
export const moneyClass = (word: VerdictWord | null | undefined) => {
  const tone = priceTone(word);
  return tone ? `money tone-${tone}` : "money";
};

// a want's state as its chip says it: at work green (its dot pulsing), failed red, waiting and done grey
export const STATE: Record<WantState, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "muted" },
  running: { label: "At work", tone: "green" },
  done: { label: "Done", tone: "muted" },
  failed: { label: "Failed", tone: "red" },
};
// my mark on a want or a product, when it isn't open: bought green (done), passed grey
export const MARK: Record<Exclude<Mark, "open">, { label: string; tone: Tone }> = {
  bought: { label: "Bought", tone: "green" },
  passed: { label: "Passed", tone: "muted" },
};

// the labels kestrel gives: all in Shopping's own colour, one meaning (a role kestrel gave), the words telling them
// apart; best overall the filled one
export const LABEL_TONE: Tone = "violet";

export const money = (cents: number | null | undefined, currency = "CAD") =>
  cents === null || cents === undefined ? "—" : formatMoney(cents, currency);

// how long ago, as a card's end says it: now, 5 min, 2 h, 3 d
export function ago(iso: string | null | undefined): string {
  const t = Date.parse(iso ?? "");
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}
// how long ago, in words: "just now", "5 min ago", "2 h ago"
export const agoWords = (iso: string | null | undefined) => {
  const a = ago(iso);
  return a === "now" ? "just now" : a ? `${a} ago` : "";
};
// "Nov 25", in the order the browser says dates
export const day = (iso: string | null | undefined) => {
  const t = Date.parse(iso ?? "");
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
// a time in full, for a title: Wed, Nov 25, 9:12 PM
export const when = (iso: string | null | undefined) => {
  const t = Date.parse(iso ?? "");
  return Number.isNaN(t)
    ? ""
    : new Date(t).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
// the server's reasons start in lower case, as its log says them; on the page they start a sentence and end with one
export const sentence = (s: string) => {
  const t = s.trim();
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}` : "";
};
