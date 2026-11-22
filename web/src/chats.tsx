// Chat: the agent's chats app (dsh's phone page, dressed in kestrel's look) inside kestrel's own frame, so it opens
// like the rest of the app — no browser bar on top. On this computer it is dsh's local address; over the private
// network's https name, the phone's. dsh lets only pages on the same machine name show it in a frame. Its own window
// stays one tap away for anything the frame can't do.
import { useQuery } from "@tanstack/react-query";

type Link = { name: string; what: string; desktop: string; phone?: string };

export function Chats() {
  const links = useQuery({
    queryKey: ["links"],
    queryFn: async () => {
      const res = await fetch("/api/links");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { links: Link[] };
    },
  });
  const chat = links.data?.links[0];
  // a secure page can only frame a secure one: over the private network's https name, the phone address it is
  const src = chat ? (location.protocol === "https:" && chat.phone ? chat.phone : chat.desktop) : "";
  if (links.data && !chat)
    return (
      <main className="grid gap-3">
        <h2 className="font-cond m-0 text-[28px] font-bold">Chat</h2>
        <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
          No chat app is set yet (settings.json: links).
        </p>
      </main>
    );
  return (
    <main className="grid gap-2">
      <div className="flex items-center gap-3">
        <h2 className="font-cond m-0 text-[22px] font-bold">Chat</h2>
        <span className="truncate text-sm" style={{ color: "var(--muted)" }}>
          {chat?.what}
        </span>
        {src && (
          <a href={src} target="_blank" rel="noopener noreferrer" className="btn btn-quiet ml-auto shrink-0">
            Its own window ↗
          </a>
        )}
      </div>
      {src && (
        <iframe
          title="Chat"
          src={src}
          className="w-full rounded-2xl border"
          // the room between kestrel's header and, on a phone, its bottom bar
          style={{ height: "calc(100dvh - 190px)", borderColor: "var(--line)", background: "var(--surface)" }}
          allow="clipboard-read; clipboard-write; microphone"
        />
      )}
    </main>
  );
}
