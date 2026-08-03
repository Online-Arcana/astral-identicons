interface ParsedSvg {
  viewBox: string;
  body: string;
}

function attribute(source: string, name: string): string | undefined {
  const expression = new RegExp(`\\b${name}=["']([^"']+)["']`, "i");
  return expression.exec(source)?.[1];
}

export function parseSvg(source: string): ParsedSvg {
  const root = /<svg\b([^>]*)>([\s\S]*?)<\/svg>\s*$/i.exec(source.trim());
  if (!root) throw new Error("Asset is not a valid SVG");

  const attributes = root[1]!;
  const viewBox = attribute(attributes, "viewBox");
  if (!viewBox) throw new Error("Asset SVG is missing a viewBox");

  const body = root[2]!
    .replace(/<title\b[\s\S]*?<\/title>/gi, "")
    .replace(/<desc\b[\s\S]*?<\/desc>/gi, "");

  return { viewBox, body };
}

export function scopeIds(source: string, prefix: string): string {
  const ids = new Map<string, string>();

  for (const match of source.matchAll(/\bid=["']([^"']+)["']/gi)) {
    ids.set(match[1]!, `${prefix}-${match[1]!}`);
  }

  return source
    .replace(/\bid=(["'])([^"']+)\1/gi, (_match, quote: string, id: string) => {
      return `id=${quote}${ids.get(id) ?? id}${quote}`;
    })
    .replace(/url\(#([^)]+)\)/g, (_match, id: string) => {
      return `url(#${ids.get(id) ?? id})`;
    })
    .replace(/(["'])#([^"']+)\1/g, (_match, quote: string, id: string) => {
      const scoped = ids.get(id);
      return scoped ? `${quote}#${scoped}${quote}` : `${quote}#${id}${quote}`;
    });
}

function paint(source: string, name: string, value: string): string {
  const expression = new RegExp(`\\b${name}=(["'])(?!none\\1)(?!transparent\\1)(?!url\\()[^"']+\\1`, "gi");
  return source.replace(expression, `${name}="${value}"`);
}

export function monochrome(source: string, value: string): string {
  let result = source;
  result = paint(result, "fill", value);
  result = paint(result, "stroke", value);
  result = paint(result, "stop-color", value);
  result = result.replace(/\bcolor=(["'])[^"']+\1/gi, `color="${value}"`);
  return result;
}

export function outlined(source: string, fill: string, stroke: string): string {
  let result = monochrome(source, fill);
  result = result.replace(/<path\b([^>]*)>/gi, (_match, raw: string) => {
    const selfClosing = /\/\s*$/.test(raw);
    let attributes = raw
      .replace(/\/\s*$/, "")
      .replace(/\sstroke=(["'])[^"']*\1/gi, "")
      .replace(/\sstroke-width=(["'])[^"']*\1/gi, "")
      .replace(/\spaint-order=(["'])[^"']*\1/gi, "")
      .replace(/\svector-effect=(["'])[^"']*\1/gi, "");

    attributes += ` stroke="${stroke}" stroke-width="4" paint-order="stroke fill" vector-effect="non-scaling-stroke"`;
    return `<path${attributes}${selfClosing ? "/>" : ">"}`;
  });

  return result;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
