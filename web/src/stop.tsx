// Stop and Pause for the agent's chats, on Live's cards and on the Chat page: Stop on an application asks which one I
// mean (only this one, so the next queued application starts; or this one and the queue, so nothing new starts until
// Play); Pause and Play hold the queue. Both go through kestrel to the old setup's server, which runs the applications.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "./ui/card.tsx";

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `${res.status}`);
}

function useLivePost(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => post(path, body),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["live"] });
      queryClient.invalidateQueries({ queryKey: ["apply"] });
    },
  });
}

export function StopChat({ chat, applying }: { chat: string; applying: boolean }) {
  const stop = useLivePost("/api/live/stop");
  const [asking, setAsking] = useState(false);
  if (stop.isSuccess) return <span className="text-small font-medium text-muted">Stopped</span>;
  const error = stop.isError && <span className="text-small text-red">{(stop.error as Error).message}</span>;
  // a chat that isn't an application has no queue behind it: Stop is just Stop
  if (!applying || !asking)
    return (
      <>
        {error}
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={stop.isPending}
          onClick={() => (applying ? setAsking(true) : stop.mutate({ chat }))}
        >
          {stop.isPending ? "Stopping…" : "Stop"}
        </button>
      </>
    );
  return (
    <fieldset className="stop-ask" aria-label="Stop which?">
      <button type="button" className="stop-choice" disabled={stop.isPending} onClick={() => stop.mutate({ chat })}>
        <b>Only this one</b>
        <span>The next queued application starts after it.</span>
      </button>
      <button
        type="button"
        className="stop-choice"
        disabled={stop.isPending}
        onClick={() => stop.mutate({ chat, all: true })}
      >
        <b>This one and the queue</b>
        <span>Nothing new starts until you press Play.</span>
      </button>
      <button
        type="button"
        className="btn btn-sm btn-quiet col-span-full justify-self-start"
        onClick={() => setAsking(false)}
      >
        Keep it running
      </button>
      {error}
    </fieldset>
  );
}

// the queue in a line: how many wait, and Pause or Play (shown while some wait, or while it's paused)
export function QueueLine({ queued, paused }: { queued: number; paused: boolean | null | undefined }) {
  const pause = useLivePost("/api/live/pause");
  if (paused === null || paused === undefined || (!paused && queued === 0)) return null;
  const words = queued === 0 ? "The queue is empty" : `${queued} application${queued === 1 ? "" : "s"} queued`;
  return (
    <Card>
      {/* the dot stays beside the words when they wrap, and the button drops under them on a phone */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 flex min-w-0 flex-1 basis-56 items-baseline gap-2.5 text-detail text-strong">
          <span className={`dot ${paused ? "tone-yellow" : "tone-green"}`} />
          <span>
            {words}
            {paused ? " · paused: nothing new starts" : " · each starts once nothing else works"}
          </span>
        </p>
        {pause.isError && <span className="text-small text-red">{(pause.error as Error).message}</span>}
        <button
          type="button"
          className={`btn ml-auto ${paused ? "btn-primary" : ""}`}
          disabled={pause.isPending}
          onClick={() => pause.mutate({ paused: !paused })}
        >
          {paused ? "Play" : "Pause the queue"}
        </button>
      </div>
    </Card>
  );
}

// the Chat page's line over the chats: each chat at work or waiting, with its Stop (dsh's own Stop can miss a turn
// that waits on a tool; this one ends it from the server)
type Running = {
  id: string;
  title: string;
  applying: boolean;
  working: boolean;
  waiting: string;
  job: { title?: string; company?: string } | null;
};
export function StopRunning({ className = "" }: { className?: string }) {
  const live = useQuery({
    queryKey: ["live"],
    queryFn: async () => {
      const res = await fetch("/api/live");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { chats?: Running[] };
    },
    refetchInterval: 5000,
  });
  const running = (live.data?.chats ?? []).filter((c) => c.working || c.waiting);
  if (!running.length) return null;
  return (
    <div className={`grid gap-2 ${className}`}>
      {running.map((c) => {
        // a chat waiting on me needs me: pink, as on Live; a wait on something else stays yellow
        const tone = c.working ? "green" : c.waiting === "you" ? "pink" : "yellow";
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-2 text-detail">
            <span className={`dot tone-${tone} ${c.working ? "pulse" : ""}`} />
            <b className={tone === "green" ? "text-green" : tone === "pink" ? "text-pink" : "text-yellow"}>
              {c.working ? "Working" : "Waiting"}
            </b>
            <span className="min-w-0 flex-1 truncate text-ink">
              {c.job?.title ? `${c.job.title}${c.job.company ? ` · ${c.job.company}` : ""}` : c.title || "A chat"}
            </span>
            <StopChat chat={c.id} applying={c.applying} />
          </div>
        );
      })}
    </div>
  );
}
