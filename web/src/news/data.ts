// The news as Home's card, the page and the history read it: one query per day (today's shared by both), the days
// kept, the find, a day deleted, and the formats they share. Today's brief asks again every 2 seconds while one is
// written, else every 5 minutes (any day's, every 2 seconds while Ask answers on one of its stories); the live
// stream (the app's own ear, app.tsx) asks at once when a run starts or ends, on Home's card as on the page. Every query here starts with "news" or "news-days", the two the live stream and a
// deleted day read again.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NewsDays, NewsFind, NewsRun, NewsState, Section } from "../../../src/shared/news.ts";
import { useConfirm } from "../ui/confirm.tsx";
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
    // every 2 seconds too while Ask answers on one of its stories, so the closed button's "answering…" turns to its
    // count
    refetchInterval: (q) =>
      q.state.data?.answering?.some(Boolean) || (!day && q.state.data?.run?.state === "running")
        ? 2000
        : day
          ? false
          : 5 * 60_000,
    retry: (n, e) => !/no brief was written/.test(e.message) && n < 2,
  });
}

// the days kept, newest first: the rail's first few, with how many there are in all
export const useDays = (limit: number) =>
  useQuery({
    queryKey: ["news-days", limit],
    queryFn: () => getJson<NewsDays>(`/api/news/days?limit=${limit}`),
  });

// the history: a hundred days at a time (about three months, a few KB), Show older for the next hundred, each page
// starting before the last day of the one above
export const PAGE_DAYS = 100;
export const useAllDays = () =>
  useInfiniteQuery({
    queryKey: ["news-days", "all"],
    queryFn: ({ pageParam }) =>
      getJson<NewsDays>(`/api/news/days?limit=${PAGE_DAYS}${pageParam ? `&before=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last, pages) =>
      pages.reduce((n, p) => n + p.days.length, 0) < last.total ? last.days.at(-1)?.day : undefined,
  });

// a story found again in every brief kept, from two letters; the last matches stay while the next words are asked
export const useFind = (words: string) =>
  useQuery({
    queryKey: ["news-days", "find", words],
    queryFn: () => getJson<NewsFind>(`/api/news/find?q=${encodeURIComponent(words)}`),
    enabled: words.length >= 2,
    placeholderData: keepPreviousData,
  });

// a day deleted, after the shared Confirm: every run of it goes, and with it the questions asked on its stories.
// Then every news query reads again, the ones off screen too (Home's card, the history left behind), so the day is gone
// from each before it is seen again; gone runs after it (the day's own page leaves for the history)
export function useDeleteDay(gone?: () => void) {
  const queryClient = useQueryClient();
  const sure = useConfirm();
  const drop = useMutation({
    mutationFn: async (day: string) => {
      const res = await fetch(`/api/news/days/${day}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `the server answered ${res.status}`);
    },
    onSuccess: () => gone?.(),
    onSettled: () => {
      for (const key of ["news", "news-days"]) queryClient.invalidateQueries({ queryKey: [key], refetchType: "all" });
    },
  });
  const ask = async (day: string) => {
    const yes = await sure({
      title: `Delete ${dayName(day)}?`,
      body: "Its brief goes for good, with the questions asked about its stories.",
      yes: "Delete",
      danger: true,
    });
    if (yes) drop.mutate(day);
  };
  return { ask, drop };
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

// the run beside the brief shown, as both say it: one being written, or one that failed. A failure after today's own
// brief is a new brief that failed, and this morning's still stands; one before any brief of today is today's
export function runOf(d: NewsState) {
  const today = d.brief?.day === localDay() ? d.brief : null;
  const run = d.run;
  if (!run) return null;
  if (run.state === "running")
    return { state: "running" as const, run, title: today ? "Writing a new brief" : "Writing this morning's news" };
  if (run.state !== "failed") return null;
  const again = Boolean(today && run.started > today.started);
  return {
    state: "failed" as const,
    run,
    again,
    title: again
      ? "The new brief failed"
      : run.day === localDay()
        ? "Today's brief failed"
        : `The brief of ${dayName(run.day)} failed`,
  };
}
