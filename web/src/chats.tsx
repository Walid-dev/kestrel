// Chat: the agent's chats. On a computer they open in the DeepSeek Harness itself, at the address where this computer's
// browser is signed in (its own tab: Home and the dock go straight there). On a phone, dsh's chats page shows inside
// kestrel's own frame, in kestrel's look, so it opens like the rest of the app; its own window goes through dsh's door,
// which carries the sign-in: the chats page offers it, and kestrel does too when the page doesn't come up in the frame.
// dsh lets only pages on the same machine name show it in a frame.
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StopRunning } from "./stop.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { EmptyState } from "./ui/empty.tsx";
import { Page } from "./ui/page.tsx";

type Link = { name: string; what: string; desktop: string; phone?: string; phoneFrame?: string };

// a computer: a fine pointer that hovers (the Mac, its mouse); anything else is a phone or a tablet
export const onComputer = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function useChatLink(): { href: string; external: boolean; link: Link | undefined; loaded: boolean } {
  const links = useQuery({
    queryKey: ["links"],
    queryFn: async () => {
      const res = await fetch("/api/links");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { links: Link[] };
    },
    staleTime: 5 * 60_000,
  });
  const link = links.data?.links[0];
  if (link && onComputer()) return { href: link.desktop, external: true, link, loaded: true };
  return { href: "/chats", external: false, link, loaded: Boolean(links.data) };
}

export function Chats() {
  const { link, loaded } = useChatLink();
  if (loaded && !link)
    return (
      <Page app="Chat" eyebrow="Agents" title="Chat">
        <EmptyState
          title="No chat app is set yet."
          line="Once its address is in the settings, the chats open here."
          detail="settings.json: links"
        />
      </Page>
    );
  if (!link) return null;
  // a computer: dsh's own app, signed in at this address, said in the empty state's voice (plain words in the flow,
  // no box), its one way there the screen's filled button
  if (onComputer())
    return (
      <Page app="Chat" eyebrow="Agents" title="Chat" width="reading">
        <EmptyState
          title="Your chats open in the DeepSeek Harness."
          line="On this computer they open in its own tab, where this browser is signed in."
          action={
            <a href={link.desktop} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Open the DeepSeek Harness ↗
            </a>
          }
        />
        <StopRunning className="card" />
      </Page>
    );
  return <ChatFrame link={link} />;
}

// a phone: the chats fill the screen from edge to edge, from the top (under the phone's status bar) down to the bottom
// bar, like an app's own screen (my ask, 2026-11-23: no box around a box). No head of its own (my ask, 2026-11-24: no
// height wasted): the tab bar already says Chat, and the chats page has its own window in its ⋯ menu and at the foot
// of its list. When that page isn't up (dsh down, signed out, an older page), one line over the frame opens its own
// window instead. The page itself never scrolls, the list inside does
function ChatFrame({ link }: { link: Link }) {
  // ?chat=<id> (Live's "Open the chat") opens that chat in the frame
  const chat = new URLSearchParams(location.search).get("chat");
  const base = link.phoneFrame ?? link.phone ?? link.desktop;
  const frame = chat && /^session-[0-9a-f-]{36}$/.test(chat) ? `${base}#chat=${chat}` : base;
  const box = useRef<HTMLIFrameElement>(null);
  const above = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const reached = useReached(box, frame);
  useLayoutEffect(() => {
    const fit = () => {
      const top = box.current?.getBoundingClientRect().top ?? 0;
      const bar = document.querySelector<HTMLElement>('nav[aria-label="The main places"]')?.offsetHeight ?? 0;
      setHeight(Math.max(240, Math.floor(window.innerHeight - top - bar)));
    };
    fit();
    // the lines over the frame come and go: the frame takes the room back
    const watch = new ResizeObserver(fit);
    if (above.current) watch.observe(above.current);
    window.addEventListener("resize", fit);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);
  // the frame's height is measured on the page, so it reaches the class as a variable
  const fitted = height === undefined ? undefined : ({ "--frame-h": `${height}px` } as CSSProperties);
  return (
    // the frame takes the page's gutters, its top room and its room for the bottom bar, which it fills itself
    // (styles.css, .chat-page)
    <main className="chat-page">
      <h1 className="sr-only">Chat</h1>
      <div ref={above}>
        {reached !== "ready" && reached !== "waiting" && (
          <p className="chat-out">
            <span>{reached === "signed-out" ? "Not signed in here." : "The chats don't answer."}</span>
            <a href={link.phone ?? link.desktop} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              Open in its own window ↗
            </a>
          </p>
        )}
        <Running />
      </div>
      <iframe
        ref={box}
        title="Chat"
        src={frame}
        className={`block w-full border-0 bg-page ${fitted ? "h-(--frame-h)" : ""}`}
        style={fitted}
        allow="clipboard-read; clipboard-write; microphone"
      />
    </main>
  );
}

// whether the chats page came up in the frame: it says "ready" (or "signed-out") to kestrel once its list arrives. A
// frame that says nothing for 8 s (dsh down, an older page) counts as not up. Only messages from the frame's own
// window and address count
type Reached = "waiting" | "ready" | "signed-out" | "silent";
function useReached(box: { current: HTMLIFrameElement | null }, src: string): Reached {
  const [reached, setReached] = useState<Reached>("waiting");
  useEffect(() => {
    setReached("waiting");
    const origin = new URL(src, location.href).origin;
    const late = setTimeout(() => setReached((r) => (r === "waiting" ? "silent" : r)), 8000);
    const hear = (e: MessageEvent) => {
      if (e.source !== box.current?.contentWindow || e.origin !== origin) return;
      const what = (e.data as { dshChats?: unknown } | null)?.dshChats;
      if (what === "ready" || what === "signed-out") setReached(what);
    };
    window.addEventListener("message", hear);
    return () => {
      clearTimeout(late);
      window.removeEventListener("message", hear);
    };
  }, [box, src]);
  return reached;
}

// the chats at work or waiting on me, as one line over the frame, with Stop behind a tap (dsh's own Stop can miss a
// turn that waits on a tool; this one ends it from the server). Nothing at all while none runs
type Agent = { working: boolean; waiting: string };
function Running() {
  const [open, setOpen] = useState(false);
  const live = useQuery({
    queryKey: ["live"],
    queryFn: async () => {
      const res = await fetch("/api/live");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { chats?: Agent[] };
    },
    refetchInterval: 5000,
  });
  const chats = (live.data?.chats ?? []).filter((c) => c.working || c.waiting);
  // the box stays mounted while a Stop in it finishes, so its answer shows
  if (!chats.length && !open) return <div hidden />;
  const working = chats.filter((c) => c.working).length;
  const mine = chats.filter((c) => !c.working && c.waiting === "you").length;
  const other = chats.length - working - mine;
  return (
    <div className="chat-running">
      <p className="chat-running-line">
        {working > 0 && (
          <span>
            <span className="dot tone-green pulse" /> <b className="text-ink">{working}</b> working
          </span>
        )}
        {mine > 0 && (
          <span>
            <span className="dot tone-pink" /> <b className="text-pink">{mine}</b> {mine === 1 ? "needs" : "need"} me
          </span>
        )}
        {other > 0 && (
          <span>
            <span className="dot tone-yellow" /> <b className="text-ink">{other}</b> waiting
          </span>
        )}
      </p>
      <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => setOpen(true)}>
        Stop…
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Stop a chat">
        {chats.length ? <StopRunning /> : <p>Nothing runs now.</p>}
      </Dialog>
    </div>
  );
}
