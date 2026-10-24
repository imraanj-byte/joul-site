// Zet een pagina van deze site om naar Markdown. Bewust klein en zonder
// afhankelijkheden: de pagina's gebruiken maar een handvol eenvoudige elementen.

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "path", "circle"]);
const SKIP = new Set(["script", "style", "svg", "form", "button", "select", "textarea", "nav", "header", "footer", "noscript", "template"]);
const BLOCK = new Set(["p", "div", "section", "article", "aside", "main", "details", "summary", "ul", "ol", "blockquote", "figure", "figcaption", "dl", "dt", "dd", "address", "table", "thead", "tbody"]);
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", middot: "·", rarr: "→", larr: "←", hellip: "…", ndash: "–", mdash: "—", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", eacute: "é", egrave: "è", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü", agrave: "à", ccedil: "ç" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function attr(attrs, name) {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "") : null;
}

const hasFlag = (attrs, name) => new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`, "i").test(attrs);

function extractRegion(html) {
  const lower = html.toLowerCase();
  const start = lower.indexOf("<main");
  const end = lower.lastIndexOf("</main>");
  if (start !== -1 && end > start) return html.slice(start, end);
  const b = lower.indexOf("<body");
  return b !== -1 ? html.slice(b) : html;
}

export function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

export function htmlToMarkdown(html, baseUrl) {
  const blocks = []; // { text, tight }
  let cur = "";
  let prefix = "";
  let tightNext = false;
  const lists = []; // { ordered, n }
  let row = null; // { cells, header }
  let firstRow = true;
  const links = []; // { href, at }
  let skipTag = null;
  let skipDepth = 0;

  const resolve = (href) => {
    try { return new URL(href, baseUrl).href; } catch { return href; }
  };

  function flush() {
    const text = cur.replace(/\u0000/g, "\n").replace(/[ \t\r\n\f]+/g, " ").replace(/ ?\u0001 ?/g, "  \n").trim();
    cur = "";
    if (text) {
      blocks.push({ text: prefix + text, tight: tightNext });
      prefix = "";
      tightNext = false;
    }
  }

  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|[^<]+|</g;
  const region = extractRegion(html);
  let m;
  while ((m = re.exec(region))) {
    const tok = m[0];
    if (tok.startsWith("<!--")) continue;
    if (!m[2]) {
      if (skipTag === null) cur += decodeEntities(tok);
      continue;
    }
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const attrs = m[3] || "";

    if (skipTag !== null) {
      if (name === skipTag && !VOID.has(name)) skipDepth += closing ? -1 : 1;
      if (skipDepth === 0) skipTag = null;
      continue;
    }
    if (!closing && !VOID.has(name) && (SKIP.has(name) || hasFlag(attrs, "hidden") || attr(attrs, "aria-hidden") === "true")) {
      skipTag = name;
      skipDepth = 1;
      continue;
    }

    if (name === "br") { cur += "\u0001"; continue; }
    if (name === "hr") { flush(); blocks.push({ text: "---", tight: false }); continue; }
    if (VOID.has(name)) continue;

    if (/^h[1-6]$/.test(name)) {
      flush();
      if (!closing) prefix = "#".repeat(Number(name[1])) + " ";
      else { flush(); }
    } else if (name === "ul" || name === "ol") {
      flush();
      if (closing) lists.pop(); else lists.push({ ordered: name === "ol", n: 0 });
    } else if (name === "li") {
      flush();
      if (!closing) {
        const l = lists[lists.length - 1] || { ordered: false, n: 0 };
        l.n += 1;
        prefix = "  ".repeat(Math.max(0, lists.length - 1)) + (l.ordered ? `${l.n}. ` : "- ");
        tightNext = true;
      }
    } else if (name === "tr") {
      flush();
      if (!closing) { row = { cells: [], header: false }; }
      else if (row) {
        const line = "| " + row.cells.join(" | ") + " |";
        blocks.push({ text: line, row: true });
        if (firstRow) blocks.push({ text: "| " + row.cells.map(() => "---").join(" | ") + " |", row: true });
        firstRow = false;
        row = null;
      }
    } else if ((name === "td" || name === "th") && row) {
      if (!closing) { cur = ""; }
      else {
        row.cells.push(cur.replace(/[ \t\r\n\f]+/g, " ").trim().replace(/\|/g, "\\|"));
        cur = "";
      }
    } else if (name === "table") {
      flush();
      firstRow = true;
    } else if (BLOCK.has(name)) {
      flush();
    } else if (name === "span" || name === "small" || name === "output" || name === "label") {
      cur += " ";
    } else if (name === "b" || name === "strong") {
      if (!closing && /[\p{L}\p{N}€]$/u.test(cur)) cur += " ";
      cur += "**";
    } else if (name === "i" || name === "em") {
      cur += "*";
    } else if (name === "code") {
      cur += "`";
    } else if (name === "summary") {
      flush();
    } else if (name === "a") {
      if (!closing) {
        const href = attr(attrs, "href");
        links.push({ href, at: cur.length });
      } else {
        const l = links.pop();
        if (l && l.href) {
          const text = cur.slice(l.at);
          if (text.replace(/[\s*`\u0001]/g, "")) {
            cur = cur.slice(0, l.at) + `[${text.trim()}](${resolve(l.href)})`;
          }
        }
      }
    }
  }
  flush();

  let out = "";
  blocks.forEach((b, i) => {
    out += i === 0 ? b.text : ((b.tight && blocks[i - 1].tight) || (b.row && blocks[i - 1].row) ? "\n" : "\n\n") + b.text;
  });
  return out.replace(/\*\*\s*\*\*/g, "").trim() + "\n";
}
