import { renderGuidePage, guides } from "./courtGuidePages.mjs";

/** @returns {import("vite").Plugin} */
export function courtGuidePlugin() {
  let production = false;
  return {
    name: "qiuka-court-guides",
    configResolved() {
      production = process.env.VERCEL_ENV === "production";
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const client = Object.values(bundle).find(
          (asset) => asset.type === "chunk" && asset.facadeModuleId?.endsWith("/src/guides/guideClient.ts")
        );
        if (!client) throw new Error("Guide client entry not built");
        const styles = [...(client.viteMetadata?.importedCss || [])].map((file) => `/${file}`);
        for (const slug of [null, ...guides.map((g) => g.slug)])
          this.emitFile({
            type: "asset",
            fileName: slug ? `courts/${slug}/index.html` : "courts/index.html",
            source: renderGuidePage(slug, { script: slug ? `/${client.fileName}` : "", styles, production }),
          });
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${production ? ["/", "/courts/", ...guides.map((g) => `/courts/${g.slug}/`)].map((path) => `<url><loc>https://qiuka.tw${path}</loc></url>`).join("") : ""}</urlset>`,
        });
        this.emitFile({
          type: "asset",
          fileName: "robots.txt",
          source: production
            ? "User-agent: *\nAllow: /\nSitemap: https://qiuka.tw/sitemap.xml\n"
            : "User-agent: *\nDisallow: /\n",
        });
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url || "/", "http://localhost").pathname;
        if (path !== "/courts" && !path.startsWith("/courts/")) return next();
        const match = /^\/courts\/(?:([a-z0-9-]+)\/)?$/.exec(path);
        if (!path.endsWith("/")) {
          res.statusCode = 308;
          res.setHeader("Location", `${path}/`);
          return res.end();
        }
        const html = match
          ? renderGuidePage(match[1] || null, {
              script: match[1] ? "/src/guides/guideClient.ts" : "",
              styles: ["/src/guides/guide.css"],
              production: false,
            })
          : null;
        res.statusCode = html ? 200 : 404;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html || '<h1>找不到這篇指南</h1><a href="/courts/">球場指南</a>');
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url || "/", "http://localhost").pathname;
        if (!path.startsWith("/courts/")) return next();
        const match = /^\/courts\/(?:([a-z0-9-]+)\/(?:index.html)?)?$/.exec(path);
        if (match && (!match[1] || guides.some((g) => g.slug === match[1]))) return next();
        if (guides.some((g) => path === `/courts/${g.slug}`)) {
          res.statusCode = 308;
          res.setHeader("Location", `${path}/`);
          return res.end();
        }
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end('<h1>找不到這篇指南</h1><a href="/courts/">球場指南</a>');
      });
    },
  };
}
