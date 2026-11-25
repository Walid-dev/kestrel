// The contrast probe: a function for a page in a browser, which measures every visible text against the ground it
// sits on and lists the ones under the bar (4.5:1 for small words, 3:1 for large words and a single glyph, a mark).
// Translucent grounds are laid over the opaque one beneath, as the screen draws them. Run it on each page in both
// themes, against the dev server and made-up data:
//   playwright-cli -s=<session> set-color-scheme light
//   playwright-cli -s=<session> eval "$(cat scripts/contrast-probe.js)"
// It prints "all pass" or one line per failing text: ratio, size, colour or grey, class, the first words.
// biome-ignore format: playwright-cli eval takes one expression, so the function ends without a semicolon
() => {
  const parse = (s) => {
    const n = (s.match(/[\d.]+/g) || []).map(Number);
    return /^color\(srgb/.test(s) ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1] : n;
  };
  const lum = (c) => {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  // the grounds from the text up to the first opaque one, then laid back down in order
  const ground = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c.length >= 3 && (c[3] ?? 1) > 0) {
        stack.push(c);
        if ((c[3] ?? 1) >= 1) break;
      }
    }
    let g = parse(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3);
    for (const c of stack.reverse()) {
      const a = c[3] ?? 1;
      g = g.map((v, i) => c[i] * a + v * (1 - a));
    }
    return g;
  };
  const coloured = (c) => {
    const hi = Math.max(c[0], c[1], c[2]);
    return hi > 0 && (hi - Math.min(c[0], c[1], c[2])) / hi > 0.25;
  };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    const el = n.parentElement;
    if (!t || !el) continue;
    const cs = getComputedStyle(el);
    if ((!el.offsetParent && cs.position !== "fixed") || cs.visibility === "hidden" || Number(cs.opacity) === 0) {
      continue;
    }
    const size = Number.parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number.parseInt(cs.fontWeight, 10) >= 600);
    const mark = t.length <= 1;
    const fg = parse(cs.color);
    const a = lum(fg);
    const b = lum(ground(el));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio >= (mark || large ? 3 : 4.5)) continue;
    const key = `${el.className}|${cs.color}|${t.slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = coloured(fg) ? "colour" : "grey";
    out.push(
      `${ratio.toFixed(2)}${mark ? " (mark)" : ""} ${size}px ${kind} ${String(el.className).slice(0, 40)} '${t.slice(0, 24)}'`,
    );
  }
  return out.slice(0, 40).join("\n") || "all pass";
}
