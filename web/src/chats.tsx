// Chat: the agent's chats. On a computer they open in the DeepSeek Harness itself, at the address where this computer's
// browser is signed in (its own tab: Home and the dock go straight there). On a phone, dsh's chats page shows inside
// kestrel's own frame, in kestrel's look, so it opens like the rest of the app; its own window goes through dsh's door,
// which carries the sign-in. dsh lets only pages on the same machine name show it in a frame.
import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";

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
      <main className="grid gap-3">
        <h2 className="font-cond m-0 text-[28px] font-bold">Chat</h2>
        <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
          No chat app is set yet (settings.json: links).
        </p>
      </main>
    );
  if (!link) return null;
  // a computer: dsh's own app, signed in at this address
  if (onComputer())
    return (
      <main className="grid max-w-2xl gap-4">
        <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight">Chat</h2>
        <section className="card grid gap-3">
          <p className="m-0 text-[15px]" style={{ color: "var(--text)" }}>
            On this computer, your chats open in the DeepSeek Harness itself, where this browser is signed in.
          </p>
          <a
            href={link.desktop}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary justify-self-start"
          >
            Open the DeepSeek Harness ↗
          </a>
        </section>
      </main>
    );
  return <ChatFrame link={link} />;
}

// a phone: the chats fill the screen from edge to edge, from under the title down to the bottom bar, like an app's own
// screen (my ask, 2026-11-23: no box around a box); the page itself never scrolls, the list inside does
function ChatFrame({ link }: { link: Link }) {
  // ?chat=<id> (Live's "Open the chat") opens that chat in the frame
  const chat = new URLSearchParams(location.search).get("chat");
  const base = link.phoneFrame ?? link.phone ?? link.desktop;
  const frame = chat && /^session-[0-9a-f-]{36}$/.test(chat) ? `${base}#chat=${chat}` : base;
  const box = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const fit = () => {
      const top = box.current?.getBoundingClientRect().top ?? 0;
      const bar = document.querySelector<HTMLElement>('nav[aria-label="The main places"]')?.offsetHeight ?? 0;
      setHeight(Math.max(240, Math.floor(window.innerHeight - top - bar)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    // the frame takes the page's side gutters and its room for the bottom bar, which it fills itself
    <main className="-mx-4 -mb-28 grid md:-mx-6 md:-mb-16">
      <div className="flex items-center gap-3 px-4 pb-2 md:px-6">
        <h2 className="font-cond m-0 text-[20px] font-bold leading-none">Chat</h2>
        <a
          href={link.phone ?? frame}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto shrink-0 text-[13px] font-medium"
          style={{ color: "var(--accent)" }}
        >
          Its own window ↗
        </a>
      </div>
      <iframe
        ref={box}
        title="Chat"
        src={frame}
        className="block w-full border-0"
        style={{ height, background: "var(--bg)" }}
        allow="clipboard-read; clipboard-write; microphone"
      />
    </main>
  );
}
