import { fileAssets } from "./assets.ts";
import { buildIdenticon } from "./build.ts";
import { input } from "./input.ts";
import { page } from "./page.ts";
import { sign } from "./sign.ts";
import type { RawIdenticonInput } from "./types.ts";

const root = `${import.meta.dir}/..`;
const assetsRoot = `${root}/assets`;
const assets = fileAssets(assetsRoot);
const sourceIndex = await Bun.file(`${root}/public/index.html`).text();
const index = page(sourceIndex, {
  script: "/app.js",
  stylesheet: "/responsive.css"
});
const responsiveStyle = Bun.file(`${root}/public/responsive.css`);
const build = await Bun.build({
  entrypoints: [`${root}/src/web.ts`],
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "none"
});

if (!build.success || !build.outputs[0]) {
  throw new Error(`Could not build browser application: ${build.logs.map((log) => log.message).join("\n")}`);
}

const app = await build.outputs[0].text();

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  return json({ error: message }, 400);
}

async function asset(pathname: string): Promise<Response> {
  if (pathname === "/assets/decor/star.svg") {
    const source = await assets.star();

    return new Response(source, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=3600"
      }
    });
  }

  const match = /^\/assets\/(constellations|sigils)\/([a-z-]+)\.svg$/.exec(pathname);
  if (!match) return new Response("Not found", { status: 404 });

  const kind = match[1]!;
  const value = sign(match[2], "asset sign");
  const source = kind === "constellations"
    ? await assets.constellation(value)
    : await assets.sigil(value);

  return new Response(source, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}

const port = Number(Bun.env.PORT ?? "4769");
const hostname = Bun.env.HOST ?? "0.0.0.0";

const server = Bun.serve({
  port,
  hostname,
  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(index, {
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }

      if (request.method === "GET" && url.pathname === "/app.js") {
        return new Response(app, {
          headers: { "content-type": "text/javascript; charset=utf-8" }
        });
      }

      if (request.method === "GET" && url.pathname === "/responsive.css") {
        return new Response(responsiveStyle, {
          headers: {
            "content-type": "text/css; charset=utf-8",
            "cache-control": "no-cache"
          }
        });
      }

      if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
        return asset(url.pathname);
      }

      if (request.method === "POST" && url.pathname === "/api/svg") {
        const body = (await request.json()) as RawIdenticonInput;
        const value = input(body);
        const svg = await buildIdenticon(value, assets);
        return new Response(svg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "content-disposition": `attachment; filename="astrological-identicon-${value.solar}.svg"`
          }
        });
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      return errorResponse(error);
    }
  }
});

console.log(`Astrological identicon builder: ${server.url}`);
