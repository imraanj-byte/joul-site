import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prefersMarkdown, negotiate, notFoundMarkdown } from "../netlify/edge-functions/lib/negotiate.mjs";
import { htmlToMarkdown } from "../netlify/edge-functions/lib/html-to-markdown.mjs";
import handler from "../netlify/edge-functions/markdown.js";

const read = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), "utf8");
const req = (path, accept, method = "GET") => new Request(`https://joulonlineservices.eu${path}`, { method, headers: accept ? { accept } : {} });
const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=UTF-8", vary: "Accept-Encoding", etag: '"x"' } });

test("prefersMarkdown: leest Accept volgens q-waarden", () => {
  assert.equal(prefersMarkdown("text/markdown"), true);
  assert.equal(prefersMarkdown("text/markdown, text/html;q=0.9"), true);
  assert.equal(prefersMarkdown("text/html, text/markdown;q=0.5"), false);
  assert.equal(prefersMarkdown("text/html,application/xhtml+xml,*/*;q=0.8"), false);
  assert.equal(prefersMarkdown("*/*"), false);
  assert.equal(prefersMarkdown("text/markdown;q=0"), false);
  assert.equal(prefersMarkdown(""), false);
  assert.equal(prefersMarkdown(null), false);
});

test("Markdown aangevraagd: Content-Type text/markdown, Vary: Accept, status blijft", async () => {
  const res = await negotiate(req("/", "text/markdown"), html("<html><head><title>T</title></head><body><main><h1>Kop</h1><p>Tekst <a href='/x.html'>link</a></p></main></body></html>"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/markdown/);
  assert.match(res.headers.get("vary"), /Accept-Encoding/);
  assert.match(res.headers.get("vary"), /(^|, )Accept($|,)/);
  const body = await res.text();
  assert.match(body, /^# Kop/);
  assert.match(body, /\[link\]\(https:\/\/joulonlineservices\.eu\/x\.html\)/);
  assert.equal(body.match(/^# /gm).length, 1);
});

test("HTML aangevraagd: HTML blijft HTML, met Vary: Accept", async () => {
  const res = await negotiate(req("/", "text/html"), html("<main><h1>Kop</h1></main>"));
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(res.headers.get("vary"), /(^|, )Accept($|,)/);
  assert.match(await res.text(), /<h1>/);
});

test("404 blijft 404 en geeft een Markdown-uitleg met verwijzing naar llms.txt en sitemap", async () => {
  const res = await negotiate(req("/__bestaat-niet", "text/markdown"), html("<main><h1>Deze pagina bestaat niet</h1></main>", 404));
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type"), /^text\/markdown/);
  assert.match(res.headers.get("vary"), /(^|, )Accept($|,)/);
  const body = await res.text();
  assert.ok(body.length > 20);
  assert.match(body, /bestaat niet/);
  assert.match(body, /\(https:\/\/joulonlineservices\.eu\/llms\.txt\)/);
  assert.match(body, /\(https:\/\/joulonlineservices\.eu\/sitemap\.xml\)/);
});

test("404 voor HTML blijft de gewone 404-pagina", async () => {
  const res = await negotiate(req("/__bestaat-niet", "text/html"), html("<main>weg</main>", 404));
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type"), /text\/html/);
});

test("pad in de 404-tekst kan geen Markdown injecteren", () => {
  const body = notFoundMarkdown("/a`)\n# hack");
  assert.ok(!/^# hack/m.test(body));
  assert.equal(body.match(/^# /gm).length, 1);
});

test("niet-HTML en andere methodes blijven ongemoeid", async () => {
  const png = new Response("x", { headers: { "content-type": "image/png" } });
  assert.equal(await negotiate(req("/a.png", "text/markdown"), png), png);
  const post = html("<main>x</main>");
  assert.equal(await negotiate(req("/", "text/markdown", "POST"), post), post);
});

test("HEAD geeft Markdown-headers zonder body", async () => {
  const res = await negotiate(req("/", "text/markdown", "HEAD"), html("<main><h1>Kop</h1></main>"));
  assert.match(res.headers.get("content-type"), /^text\/markdown/);
  assert.equal(await res.text(), "");
});

test("edge function: bij een fout krijgt de bezoeker de gewone pagina", async () => {
  const broken = { headers: null, status: 200, method: "GET" };
  const out = await handler(req("/", "text/markdown"), { next: async () => broken });
  assert.equal(out, broken);
});

test("converter: koppen, lijsten, tabellen, vet; sluit script, formulier en verborgen delen uit", () => {
  const md = htmlToMarkdown(`<main><h1>A</h1><p>Eén <b>vet</b> woord</p><ul><li>x</li><li>y</li></ul>
    <table><tr><th>K</th><th>V</th></tr><tr><td>1</td><td>2</td></tr></table>
    <script>alert(1)</script><form><input name=a><button>Verstuur</button></form><div aria-hidden="true">weg</div></main>`, "https://joulonlineservices.eu/");
  assert.match(md, /^# A\n\nEén \*\*vet\*\* woord\n\n- x\n- y\n\n\| K \| V \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
  assert.ok(!/alert|Verstuur|weg/.test(md));
});

test("converter: de echte startpagina geeft een bruikbaar Markdown-document", () => {
  const md = htmlToMarkdown(read("index.html"), "https://joulonlineservices.eu/");
  assert.match(md, /# Elke gemiste oproep krijgt antwoord/);
  assert.match(md, /vanaf €159 per maand/);
  assert.match(md, /\]\(https:\/\/joulonlineservices\.eu\/#contact\)/);
  assert.ok(!/<[a-z]+[ >]/.test(md), "geen HTML-resten");
});

test("startpagina: Organization-schema heeft contactPoint en address", () => {
  const ld = [...read("index.html").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1])["@graph"] ?? [JSON.parse(m[1])]);
  const org = ld.find((n) => [].concat(n["@type"]).some((t) => ["Organization", "LocalBusiness", "ProfessionalService"].includes(t)));
  assert.equal(org.contactPoint["@type"], "ContactPoint");
  assert.ok(org.contactPoint.contactType);
  assert.ok(org.contactPoint.email && org.contactPoint.telephone);
  assert.equal(org.address["@type"], "PostalAddress");
});

test("llms.txt: bevat een 'wanneer gebruiken'-sectie met use cases en hoe een agent Joul aanspreekt", () => {
  const t = read("llms.txt");
  assert.match(t, /^## Wanneer Joul gebruiken \(when to use this\)$/m);
  assert.match(t, /imraan@joul\.eu/);
  assert.match(t, /Accept: text\/markdown/);
  assert.match(t, /^# Joul Online Services$/m);
});

test("_redirects: bronbestanden worden niet geserveerd", () => {
  assert.match(read("_redirects"), /^\/netlify\/\*\s+\/404\.html\s+404!$/m);
  assert.match(read("_redirects"), /^\/test\/\*\s+\/404\.html\s+404!$/m);
});
