import { negotiate } from "./lib/negotiate.mjs";

// Geeft Markdown terug als de client "Accept: text/markdown" stuurt, en HTML
// in alle andere gevallen. Gaat er iets mis, dan krijgt de bezoeker de gewone pagina.
export default async (request, context) => {
  const response = await context.next();
  try {
    return await negotiate(request, response);
  } catch {
    return response;
  }
};

export const config = {
  path: "/*",
  excludedPath: ["/assets/*", "/*.png", "/*.jpg", "/*.svg", "/*.mp4", "/*.css", "/*.js", "/*.webmanifest", "/*.xml", "/*.txt", "/*.ico"],
};
