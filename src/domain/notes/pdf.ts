// A PDF upload becomes its text: the computer's own PDF engine (Apple's PDFKit) reads it in a small program of its
// own process (scripts/pdf-text.swift, which deploy builds into dist/pdf-text), so kestrel never parses a PDF itself
// and nothing inside the PDF ever runs. Its words only: the layout and the pictures stay in the PDF, so what I change
// here goes back into the CV's own file by hand.
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Refused } from "./documents.ts";

const READER = fileURLToPath(new URL("../../../dist/pdf-text", import.meta.url));
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

export const isPdf = (name: string, bytes: Buffer): boolean =>
  extname(name).toLowerCase() === ".pdf" || bytes.subarray(0, 5).toString("latin1") === "%PDF-";

export async function readPdf(bytes: Buffer, reader = READER): Promise<string> {
  if (bytes.length > PDF_MAX_BYTES) throw new Refused(`a PDF bigger than ${PDF_MAX_BYTES / 1024 / 1024} MB`);
  if (!existsSync(reader))
    throw new Refused("reading a PDF needs kestrel's PDF reader, which deploy builds (scripts/pdf-text.swift)");
  const dir = mkdtempSync(join(tmpdir(), "kestrel-pdf-"));
  const file = join(dir, "upload.pdf");
  try {
    writeFileSync(file, bytes);
    const got = await new Promise<{ code: number; text: string }>((resolve) =>
      execFile(reader, [file], { timeout: 30_000, maxBuffer: 20_000_000, encoding: "utf8" }, (error, stdout) =>
        resolve({
          code: !error ? 0 : typeof (error as { code?: unknown }).code === "number" ? Number(error.code) : -1,
          text: stdout ?? "",
        }),
      ),
    );
    if (got.code === 2) throw new Refused("this file isn't a PDF the computer can read");
    if (got.code !== 0) throw new Refused("the PDF reader stopped before it finished: try again");
    const text = got.text
      .replaceAll("\r", "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) throw new Refused("this PDF has no text to read: a scan holds only pictures of its pages");
    return `${text}\n`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
