import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleSharePage } from "../server/sharePage.js";

export default async function handler(request, response) {
  try {
    const template = readFileSync(join(process.cwd(), "server-generated/share-shell.html"), "utf8");
    const result = await handleSharePage(
      new Request(`https://local.invalid${request.url}`, { method: request.method }),
      { template, env: process.env }
    );
    response.statusCode = result.status;
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(await result.text());
  } catch {
    response.statusCode = 503;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(request.method === "HEAD" ? "" : '<p>球局暫時無法載入。</p><a href="/">找其他球局</a>');
  }
}
