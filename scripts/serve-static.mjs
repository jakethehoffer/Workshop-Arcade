import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "..");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".wav", "audio/wav"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
]);

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log(`usage: node scripts/serve-static.mjs [--host host] [--port port] [--root path]

Starts the Workshop Arcade static site.

Defaults:
  --host ${options.host}
  --port ${options.port}
  --root ${options.root}`);
  process.exit(0);
}

const root = path.resolve(options.root);

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  let requestPath;

  try {
    requestPath = decodeURIComponent(requestUrl.pathname);
  } catch {
    sendText(response, 400, "Bad request");
    return;
  }

  const resolvedPath = resolveRequestPath(root, requestPath);

  if (!resolvedPath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  let filePath = resolvedPath;

  try {
    let fileStat = statSync(filePath);

    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      fileStat = statSync(filePath);
    }

    if (!fileStat.isFile()) {
      sendText(response, 404, "Not found");
      return;
    }
  } catch {
    sendText(response, 404, "Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${options.port} is already in use. Stop the existing server or choose another port.`);
    process.exit(1);
  }

  throw error;
});

server.listen(options.port, options.host, () => {
  console.log(`Workshop Arcade running at http://${options.host}:${options.port}/`);
  console.log("Press Ctrl+C to stop.");
});

function parseArgs(args) {
  const parsed = {
    help: false,
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 4173),
    root: defaultRoot,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--host" && next) {
      parsed.host = next;
      index += 1;
    } else if (arg === "--port" && next) {
      parsed.port = Number(next);
      index += 1;
    } else if (arg === "--root" && next) {
      parsed.root = next;
      index += 1;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) {
    console.error(`Invalid port: ${parsed.port}`);
    process.exit(2);
  }

  return parsed;
}

function resolveRequestPath(rootPath, requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const resolvedPath = path.resolve(rootPath, `.${normalizedPath}`);
  const relativePath = path.relative(rootPath, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return resolvedPath;
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(body);
}
