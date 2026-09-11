import { handleShareImage } from "../server/shareImage.js";

export default async function handler(request, response) {
  try {
    const result = await handleShareImage(
      new Request(`https://local.invalid${request.url}`, { method: request.method }),
      { env: process.env }
    );
    response.statusCode = result.status;
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.statusCode = 503;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end(request.method === "HEAD" ? "" : "圖片暫時無法載入。");
  }
}
