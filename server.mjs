import { createReadStream, realpathSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const hostname = "127.0.0.1";
const defaultPort = 4173;
const configuredPort = Number(process.env.PORT ?? defaultPort);
if (!Number.isInteger(configuredPort) || configuredPort <= 0 || configuredPort > 65_535) {
  console.error("PORT must be an integer between 1 and 65535.");
  process.exit(1);
}
const port = configuredPort;
const root = realpathSync(process.cwd());
const publicFiles = new Set(["index.html", "script.js", "styles.css"]);

const types = {
  ".avif": "image/avif",
  ".basis": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".hdr": "image/vnd.radiance",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ktx2": "image/ktx2",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".usdz": "model/vnd.usdz+zip",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const sharedHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function isWithinRoot(filePath) {
  const pathFromRoot = relative(root, filePath);
  return pathFromRoot === ""
    || (!isAbsolute(pathFromRoot)
      && pathFromRoot !== ".."
      && !pathFromRoot.startsWith(`..${sep}`));
}

function sendText(request, response, status, message, headers = {}) {
  if (response.headersSent || response.destroyed) return;

  const body = `${message}\n`;
  response.writeHead(status, {
    ...sharedHeaders,
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function requestedSegments(requestUrl) {
  const rawPathname = (requestUrl || "/").split("?", 1)[0];
  const pathname = decodeURIComponent(rawPathname);

  if (pathname.includes("\0") || Buffer.byteLength(pathname) > 4_096) {
    throw new URIError("Invalid URL path");
  }

  const segments = pathname.replaceAll("\\", "/").split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith(".") || segment.includes(":"))) {
    return null;
  }

  return segments;
}

function isMissingOrPrivate(error) {
  return error && [
    "EACCES",
    "EINVAL",
    "ELOOP",
    "ENAMETOOLONG",
    "ENOENT",
    "ENOTDIR",
    "EPERM",
  ].includes(error.code);
}

function isAllowedHost(hostHeader) {
  if (!hostHeader) return true;
  const host = hostHeader.toLowerCase();
  return host === hostname
    || host === "localhost"
    || host === `${hostname}:${port}`
    || host === `localhost:${port}`;
}

function isPublicPath(segments) {
  if (segments.length === 1) return publicFiles.has(segments[0]);
  if (segments[0] === "assets") return true;

  // Three.js is vendored, so the only library path the page asks for is this
  // one. The node_modules rules this replaced — including the special case for
  // pnpm's hidden store junction — served a tree the page no longer loads.
  return segments[0] === "vendor" && segments[1] === "three";
}

function isAllowedCanonicalPath(requestedPath, canonicalPath) {
  if (!isWithinRoot(canonicalPath)) return false;

  const canonicalSegments = relative(root, canonicalPath).split(sep);
  const hasHiddenSegment = canonicalSegments.some((segment) => segment.startsWith("."));

  if (requestedPath.length === 1) {
    return canonicalSegments.length === 1
      && canonicalSegments[0] === requestedPath[0]
      && publicFiles.has(canonicalSegments[0]);
  }

  if (requestedPath[0] === "assets") {
    return canonicalSegments[0] === "assets" && !hasHiddenSegment;
  }

  return canonicalSegments[0] === "vendor"
    && canonicalSegments[1] === "three"
    && !hasHiddenSegment;
}

async function locateFile(segments) {
  const filePath = resolve(root, ...segments);
  if (!isWithinRoot(filePath)) return null;

  const canonicalPath = await realpath(filePath);
  if (!isAllowedCanonicalPath(segments, canonicalPath)) return null;

  const fileStat = await stat(canonicalPath);
  return fileStat.isFile() ? { filePath: canonicalPath, fileStat } : null;
}

function streamFile(request, response, filePath, fileStat) {
  const headers = {
    ...sharedHeaders,
    "Content-Length": fileStat.size,
    "Content-Type": types[extname(filePath).toLowerCase()] || "application/octet-stream",
  };

  if (request.method === "HEAD") {
    response.writeHead(200, headers);
    response.end();
    return;
  }

  const stream = createReadStream(filePath);

  stream.once("error", (error) => {
    console.error(`Unable to stream ${filePath}:`, error.message);
    if (!response.headersSent) {
      sendText(request, response, 500, "Internal server error");
    } else if (!response.destroyed) {
      response.destroy();
    }
  });

  stream.once("open", () => {
    if (response.destroyed) {
      stream.destroy();
      return;
    }

    response.writeHead(200, headers);
    stream.pipe(response);
  });

  response.once("close", () => {
    if (!stream.destroyed) stream.destroy();
  });
}

async function handleRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(request, response, 405, "Method not allowed", { Allow: "GET, HEAD" });
    return;
  }

  if (!isAllowedHost(request.headers.host)) {
    sendText(request, response, 403, "Forbidden");
    return;
  }

  let segments;
  try {
    segments = requestedSegments(request.url);
  } catch {
    sendText(request, response, 400, "Bad request");
    return;
  }

  if (!segments) {
    sendText(request, response, 404, "Not found");
    return;
  }

  try {
    const publicPath = segments.length ? segments : ["index.html"];
    if (!isPublicPath(publicPath)) {
      sendText(request, response, 404, "Not found");
      return;
    }

    const file = await locateFile(publicPath);
    if (!file) {
      sendText(request, response, 404, "Not found");
      return;
    }

    streamFile(request, response, file.filePath, file.fileStat);
  } catch (error) {
    if (isMissingOrPrivate(error)) {
      sendText(request, response, 404, "Not found");
      return;
    }

    console.error("Static file request failed:", error);
    sendText(request, response, 500, "Internal server error");
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.on("clientError", (_error, socket) => {
  if (socket.writable) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  }
});

server.on("error", (error) => {
  console.error(`Unable to start the local server: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, hostname, () => {
  console.log(`Golden wattle bouquet: http://${hostname}:${port}`);
});
