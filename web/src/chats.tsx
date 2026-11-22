// Chat: the agent's chats. On a computer they open in the DeepSeek Harness itself, at the address where this computer's
// browser is signed in (its own tab: Home and the dock go straight there). On a phone, dsh's chats page shows inside
// kestrel's own frame, in kestrel's look, so it opens like the rest of the app; its own window goes through dsh's door,
// which carries the sign-in. dsh lets only pages on the same machine name show it in a frame.
import { useQuery } from "@tanstack/react-query";

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
  const frame = link.phoneFrame ?? link.phone ?? link.desktop;
  return (
    <main className="grid gap-2">
      <div className="flex items-center gap-3">
        <h2 className="font-cond m-0 text-[22px] font-bold">Chat</h2>
        <span className="truncate text-sm" style={{ color: "var(--muted)" }}>
          {link.what}
        </span>
        <a
          href={link.phone ?? frame}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-quiet ml-auto shrink-0"
        >
          Its own window ↗
        </a>
      </div>
      <iframe
        title="Chat"
        src={frame}
        className="w-full rounded-2xl border"
        // the room between kestrel's header and the phone's bottom bar
        style={{ height: "calc(100dvh - 190px)", borderColor: "var(--line)", background: "var(--surface)" }}
        allow="clipboard-read; clipboard-write; microphone"
      />
    </main>
  );
}
