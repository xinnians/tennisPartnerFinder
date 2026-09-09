import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { handleSharePage } from "../server/sharePage.js";

export function sharePagePlugin() {
  let config;
  return {
    name: "qiuka-share-page",
    configResolved(value) {
      config = value;
    },
    writeBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset") throw new Error("Share template missing app shell");
      mkdirSync(resolve(config.root, "server-generated"), { recursive: true });
      writeFileSync(resolve(config.root, "server-generated/share-shell.html"), index.source);
    },
    configureServer(server) {
      attach(server, false);
    },
    configurePreviewServer(server) {
      attach(server, true);
    },
  };
  function attach(server, preview) {
    const env = { ...loadEnv(config.mode, config.root, ""), ...process.env };
    server.middlewares.use(async (req, res, next) => {
      if (!/^\/(?:s(?:\/|$)|api\/share(?:\?|$))/.test(req.url || "")) return next();
      try {
        let template = readFileSync(resolve(config.root, preview ? "dist/index.html" : "index.html"), "utf8");
        if (!preview) template = await server.transformIndexHtml(req.url, template);
        const result = await handleSharePage(new Request(`http://127.0.0.1${req.url}`, { method: req.method }), {
          template,
          env,
        });
        res.statusCode = result.status;
        result.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await result.text());
      } catch {
        res.statusCode = 503;
        res.setHeader("Cache-Control", "no-store");
        res.end("球局暫時無法載入。");
      }
    });
  }
}
