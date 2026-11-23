export const WORLD_LABEL_FONT = '/fonts/LiberationSans-Regular.ttf';
export const WORLD_LABEL_PRELOAD = 'ARMED ·';

// Exact cmap of the bundled font. Keep unknown future display names identifiable
// without invoking Troika's remote fallback (it retries its CDN even if a
// custom unicodeFontsURL fails). The CPU label test compares this to the TTF.
const coverage = `
20-7e a0-17f 192 1fa-1ff 218-21b 2c6-2c7 2c9 2d8-2dd 37e 384-38a 38c 38e-3a1 3a3-3ce 400-45f 472-473
490-491 1e80-1e85 1ef2-1ef3 2010-2011 2013-2015 2017-201e 2020-2022 2026 2030 2032-2033 2039-203a 203c 203e
2044 207f 20a3-20a4 20a7 20ac 2105 2113 2116 2122 2126 212e 215b-215e 2190-2195 21a8 2202 2206 220f
2211-2212 2215 2219-221a 221e-221f 2229 222b 2248 2260-2261 2264-2265 2302 2310 2320-2321 2500 2502 250c 2510
2514 2518 251c 2524 252c 2534 253c 2550-256c 2580 2584 2588 258c 2590-2593 25a0-25a1 25aa-25ac 25b2 25ba
25bc 25c4 25ca-25cb 25cf 25d8-25d9 25e6 263a-263c 2640 2642 2660 2663 2665-2666 266a-266c f001-f002 f005 fb01-fb02
`;
const fontChars = new Set<number>();
for (const range of coverage.trim().split(/\s+/)) {
  const [lo, hi = lo] = range.split('-').map(hex => parseInt(hex, 16));
  for (let code = lo; code <= hi; code++) fontChars.add(code);
}

export function offlineWorldLabel(text: string): string {
  // An empty label, or one starting with a line break, still needs a first
  // local glyph for Troika to establish its font run.
  if (!text || text.startsWith('\n')) text = ' ' + text;
  return text.replace(/[^\x20-\x7e\n]/gu, char => {
    const code = char.codePointAt(0)!;
    return fontChars.has(code) ? char : `[U+${code.toString(16).toUpperCase()}]`;
  });
}
