// Documents: open a text file from the folders my settings list, or keep an uploaded text. A path is checked at its
// real place (symbolic links resolved first), the format must be UTF-8 text, and how the bytes looked (BOM, line
// endings, final newline, their hash) is remembered so a later save changes nothing else. The text is kept with LF
// endings and no final newline; save puts both back.
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Settings } from "../../platform/config.ts";
import type { DocumentFull, DocumentMeta } from "../../shared/notes.ts";

export const MAX_BYTES = 200 * 1024;
const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".text"]);

// a refusal whose message is meant for the screen, with what to do
export class Refused extends Error {}

const expand = (p: string) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

// the folders Notes may open, at their real places; a listed folder that doesn't exist is skipped
export function folders(settings: Settings): string[] {
  const out: string[] = [];
  for (const f of settings.notes.folders) {
    try {
      out.push(realpathSync(expand(f)));
    } catch {
      // not there: the list in the settings may be ahead of the disk
    }
  }
  return out;
}

// the text files those folders hold, for the open list (four levels deep, dot-files skipped, 500 at most)
export function listFiles(settings: Settings): { path: string; name: string }[] {
  const out: { path: string; name: string }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || out.length >= 500) return;
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names.sort()) {
      if (n.startsWith(".")) continue;
      const p = join(dir, n);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (TEXT_EXT.has(extname(n).toLowerCase()) && st.size <= MAX_BYTES) out.push({ path: p, name: n });
    }
  };
  for (const d of folders(settings)) walk(d, 1);
  return out;
}

function decode(bytes: Buffer): { text: string; bom: boolean; eol: "lf" | "crlf"; finalNewline: boolean } {
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bom ? bytes.subarray(3) : bytes);
  } catch {
    throw new Refused("not UTF-8 text: Notes takes UTF-8, with or without its byte-order mark");
  }
  const eol = text.includes("\r\n") ? "crlf" : "lf";
  const lf = text.replaceAll("\r\n", "\n");
  const finalNewline = lf.endsWith("\n");
  return { text: finalNewline ? lf.slice(0, -1) : lf, bom, eol, finalNewline };
}

const meta = (r: Record<string, unknown>): DocumentMeta => ({
  id: String(r.id),
  source: r.source as "file" | "upload",
  name: String(r.name),
  path: (r.path as string) ?? null,
  chars: String(r.text).length,
  addedAt: String(r.added_at),
});

// open a file from the folders: refused outside them (a symbolic link counts where it points), refused when not a
// text format, too big, or not UTF-8; opening again refreshes the same document
export function openFile(db: DatabaseSync, settings: Settings, path: string): DocumentMeta {
  const dirs = folders(settings);
  let real: string;
  try {
    real = realpathSync(expand(path));
  } catch {
    throw new Refused("no such file");
  }
  if (!dirs.some((d) => real === d || real.startsWith(d + sep)))
    throw new Refused("outside the folders Notes may open: list its folder in settings.json under notes.folders");
  const ext = extname(real).toLowerCase();
  if (!TEXT_EXT.has(ext))
    throw new Refused(
      `${ext || "a file without an ending"} is not a text format Notes opens (${[...TEXT_EXT].join(", ")})`,
    );
  if (statSync(real).size > MAX_BYTES) throw new Refused(`bigger than ${MAX_BYTES / 1024} KB`);
  const bytes = readFileSync(real);
  const d = decode(bytes);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const have = db.prepare("SELECT id FROM documents WHERE path = ?").get(real) as { id: string } | undefined;
  const id = have?.id ?? randomUUID();
  db.prepare(
    `INSERT INTO documents (id, source, name, path, text, bom, eol, final_newline, sha256, added_at)
     VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET text = excluded.text, bom = excluded.bom, eol = excluded.eol,
       final_newline = excluded.final_newline, sha256 = excluded.sha256`,
  ).run(id, basename(real), real, d.text, d.bom ? 1 : 0, d.eol, d.finalNewline ? 1 : 0, sha, new Date().toISOString());
  return meta(db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as Record<string, unknown>);
}

// keep an uploaded text: the database holds the original
export function addUpload(db: DatabaseSync, name: string, text: string): DocumentMeta {
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Refused(`bigger than ${MAX_BYTES / 1024} KB`);
  const d = decode(Buffer.from(text, "utf8"));
  const id = randomUUID();
  const clean = basename(name).trim() || "untitled.md";
  db.prepare(
    `INSERT INTO documents (id, source, name, path, text, bom, eol, final_newline, sha256, added_at)
     VALUES (?, 'upload', ?, NULL, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    clean,
    d.text,
    d.bom ? 1 : 0,
    d.eol,
    d.finalNewline ? 1 : 0,
    createHash("sha256").update(text, "utf8").digest("hex"),
    new Date().toISOString(),
  );
  return meta(db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as Record<string, unknown>);
}

export function listDocuments(db: DatabaseSync): DocumentMeta[] {
  const rows = db.prepare("SELECT * FROM documents ORDER BY added_at DESC").all() as Record<string, unknown>[];
  return rows.map(meta);
}

export function getDocument(db: DatabaseSync, id: string): DocumentFull | null {
  const r = db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? { ...meta(r), text: String(r.text) } : null;
}
