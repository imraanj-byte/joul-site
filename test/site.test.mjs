// Site-controle (15 nov 2026): draait ook als klaar-controle (.claude/klaar-test).
// Kijkt elke pagina na op dode interne links, jargon, oude prijzen, titel en beschrijving.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pages = readdirSync(ROOT, { recursive: true })
  .filter((f) => f.endsWith(".html") && !/^(netlify|test|node_modules)\//.test(f));
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const visible = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, " ");
const redirects = read("_redirects").split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((p) => p?.startsWith("/"));

// Juridische pagina's moeten verwerkers bij naam noemen (n8n), daar geldt de jargonregel niet.
const LEGAL = new Set(["privacy.html", "verwerkersovereenkomst.html", "voorwaarden.html", "cookies.html"]);
const JARGON = [/\bAI\b/, /\bn8n\b/i, /\bworkflows?\b/i, /\bAPI\b/, /automatisering/i];

test("er zijn pagina's gevonden", () => assert.ok(pages.length > 10, `maar ${pages.length} pagina's`));

test("geen dode interne links", () => {
  const dead = [];
  for (const f of pages) {
    for (const [, href] of read(f).matchAll(/href="([^"#?]+)/g)) {
      if (/^(https?:|mailto:|tel:|sms:|data:|\/\/)/.test(href)) continue;
      const rel = href.startsWith("/") ? href.slice(1) : join(f, "..", href);
      const ok = rel === "" || existsSync(join(ROOT, rel)) || existsSync(join(ROOT, rel + ".html")) ||
        existsSync(join(ROOT, rel, "index.html")) || redirects.includes("/" + rel);
      if (!ok) dead.push(`${f} -> ${href}`);
    }
  }
  assert.deepEqual(dead, []);
});

test("geen jargon voor klanten (behalve juridische pagina's)", () => {
  const hits = [];
  for (const f of pages.filter((p) => !LEGAL.has(p))) {
    const t = visible(read(f));
    for (const w of JARGON) if (w.test(t)) hits.push(`${f}: ${w}`);
  }
  assert.deepEqual(hits, []);
});

test("geen vervallen prijzen (€295, €750)", () => {
  const hits = pages.filter((f) => /€\s?(295|750)\b/.test(visible(read(f))));
  assert.deepEqual(hits, []);
});

test("elke pagina heeft een titel en een beschrijving", () => {
  const missing = pages.filter((f) => {
    const s = read(f);
    return !/<title>[^<]+<\/title>/.test(s) || !/<meta name="description" content="[^"]+"/.test(s);
  });
  assert.deepEqual(missing, []);
});
