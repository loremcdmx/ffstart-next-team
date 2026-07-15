import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = resolve(process.env.FF_LOCAL_ROOT || defaultRoot);
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".srt": "application/x-subrip; charset=utf-8",
  ".svg": "image/svg+xml",
  ".vtt": "text/vtt; charset=utf-8",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function localPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}`).pathname);
  if (pathname === "/") return "index.html";
  if (pathname === "/favicon.ico") return "assets/favicon.svg";
  const relative = pathname.replace(/^\/+/, "");
  return extname(relative) ? relative : `${relative}.html`;
}

function parseByteRange(value, size) {
  if (typeof value !== "string" || size <= 0) return null;

  // This server deliberately supports one range only. Multipart byte-range
  // responses add no value for the local media player and are easy to get
  // subtly wrong, so malformed and multiple ranges are rejected as 416.
  const match = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start >= size
    || requestedEnd < start
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(requestedEnd, size - 1),
  };
}

function streamFile(file, response, range) {
  const stream = createReadStream(file, range || undefined);
  stream.on("error", (error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Server error");
  });
  response.on("close", () => stream.destroy());
  stream.pipe(response);
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let relative;
  try {
    relative = localPath(request.url || "/");
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Length": fileStat.size,
      "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream",
    };

    if (request.method === "GET" && request.headers.range !== undefined) {
      const range = parseByteRange(request.headers.range, fileStat.size);
      if (!range) {
        response.writeHead(416, {
          ...headers,
          "Content-Length": 0,
          "Content-Range": `bytes */${fileStat.size}`,
        });
        response.end();
        return;
      }

      response.writeHead(206, {
        ...headers,
        "Content-Length": range.end - range.start + 1,
        "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`,
      });
      streamFile(file, response, range);
      return;
    }

    response.writeHead(200, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    streamFile(file, response);
  } catch (error) {
    response.writeHead(error?.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(error?.code === "ENOENT" ? "Not found" : "Server error");
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const activePort = address && typeof address === "object" ? address.port : port;
  console.log(`Local learning hub: http://${host}:${activePort}`);
});
