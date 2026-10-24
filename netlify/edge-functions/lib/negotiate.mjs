import { htmlToMarkdown, pageTitle } from "./html-to-markdown.mjs";

const SITE = "https://joulonlineservices.eu";

// Leest de Accept-header. Geeft true als de client Markdown minstens even graag
// wil als HTML (acceptmarkdown.com): text/markdown moet expliciet genoemd zijn.
export function prefersMarkdown(accept) {
  if (!accept) return false;
  const q = { md: -1, html: -1, textAny: -1, any: -1 };
  for (const part of accept.split(",")) {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    let weight = 1;
    for (const p of params) {
      const [k, v] = p.trim().split("=");
      if (k === "q") weight = Number.isFinite(parseFloat(v)) ? parseFloat(v) : 1;
    }
    const t = type.trim();
    if (t === "text/markdown") q.md = Math.max(q.md, weight);
    else if (t === "text/html") q.html = Math.max(q.html, weight);
    else if (t === "text/*") q.textAny = Math.max(q.textAny, weight);
    else if (t === "*/*") q.any = Math.max(q.any, weight);
  }
  if (q.md <= 0) return false;
  const html = q.html >= 0 ? q.html : q.textAny >= 0 ? q.textAny : q.any >= 0 ? q.any : 0;
  return q.md >= html;
}

export function notFoundMarkdown(pathname) {
  const shown = decodeSafe(pathname).replace(/[`\r\n]/g, "").slice(0, 120);
  return [
    "# 404: pagina niet gevonden",
    "",
    `De pagina \`${shown}\` bestaat niet op joulonlineservices.eu. Controleer het adres of kies een bestaande pagina hieronder.`,
    "",
    `- [Startpagina](${SITE}/)`,
    `- [llms.txt](${SITE}/llms.txt): overzicht van de site voor AI-agents, met wanneer Joul past`,
    `- [Sitemap](${SITE}/sitemap.xml): alle pagina's`,
    `- [Contact](mailto:imraan@joul.eu): imraan@joul.eu of 0468 31 46 51`,
    "",
  ].join("\n");
}

function decodeSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function withVary(headers) {
  const h = new Headers(headers);
  const vary = (h.get("vary") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!vary.some((v) => v.toLowerCase() === "accept" || v === "*")) vary.push("Accept");
  h.set("vary", vary.join(", "));
  return h;
}

// Neemt het antwoord van de gewone site en maakt er, als de client dat vraagt,
// een Markdown-antwoord van. HTML blijft HTML; overige bestanden blijven ongemoeid.
export async function negotiate(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (!type.includes("text/html")) return response;

  const wantsMarkdown = prefersMarkdown(request.headers.get("accept"));
  if (!wantsMarkdown) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: withVary(response.headers) });
  }

  const url = new URL(request.url);
  let body;
  if (response.status === 404) {
    body = notFoundMarkdown(url.pathname);
  } else {
    const html = await response.text();
    body = htmlToMarkdown(html, url.href);
    if (!/^# /m.test(body)) body = `# ${pageTitle(html) || "Joul Online Services"}\n\n${body}`;
    body += `\n---\n\nBron: ${url.origin}${url.pathname}. Contact: imraan@joul.eu, 0468 31 46 51. Overzicht voor agents: ${SITE}/llms.txt\n`;
  }

  const headers = withVary(response.headers);
  for (const h of ["content-length", "content-encoding", "etag", "content-type", "last-modified"]) headers.delete(h);
  headers.set("content-type", "text/markdown; charset=utf-8");
  return new Response(request.method === "HEAD" ? null : body, { status: response.status, headers });
}
