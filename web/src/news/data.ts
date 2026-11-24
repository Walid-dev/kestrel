// The news as Home's card and the page read it: one query per day (today's shared by both), and the formats they
// share. Today's brief asks again every 2 seconds while one is written, else every 5 minutes; the live stream (the
// page's useEvents) asks at once when a run starts or ends.
import { useQuery } from "@tanstack/react-query";
import type { NewsRun, NewsState, Section } from "../../../src/shared/news.ts";
import type { Tone } from "../ui/pills.tsx";

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `the server answered ${res.status}`);
  return j;
}

// today's brief (no day) or a day's
export function useNews(day?: string) {
  return useQuery({
    queryKey: ["news", day ?? "today"],
    queryFn: () => getJson<NewsState>(`/api/news${day ? `?day=${day}` : ""}`),
    refetchInterval: (q) => (day ? false : q.state.data?.run?.state === "running" ? 2000 : 5 * 60_000),
    retry: (n, e) => !/no brief was written/.test(e.message) && n < 2,
  });
}

// each section's colour, the same on its heading's dot and its stories' chips: money as the moon's yellow, research
// purple as all deep work is, the builders cyan, the wider day in the accent, a view quiet
export const SECTION_TONE: Record<Section, Tone> = {
  money: "yellow",
  models: "purple",
  building: "cyan",
  tech: "accent",
  views: "muted",
};

const pad = (n: number) => String(n).padStart(2, "0");
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// "6:34 AM", as Live and Research say a time
export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
// "Tue, Nov 24", in the order the browser says dates, as every date in the app
export const dayName = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
// when a brief was written, as its card says it: the time today, else its day
export const writtenAt = (run: NewsRun) =>
  run.day === localDay() ? clock(run.finished ?? run.started) : dayName(run.day);
// how long ago something happened: 5 h, 2 d
export const ago = (iso: string) => {
  const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3_600_000));
  return h < 1 ? "now" : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
};
// 1886 as 1.9k, the way a points count reads at a glance
export const points = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));
// a model by its family and size ("Qwen3.8-27B-oQ4e-mtp": Qwen 27B), as the Models page names it
export const shortModel = (m: string) => {
  const family = m.match(/^[A-Za-z]+/)?.[0];
  const size = m.match(/(?:^|[-_ ])(\d+(?:\.\d+)?B)(?=$|[-_ ])/i)?.[1];
  return family && size ? `${family} ${size.toUpperCase()}` : m;
};
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
// the server's reasons start in lower case, as they read in its log; on the page they start a sentence
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
