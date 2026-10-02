import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * MapLibre's web worker and the chunk it imports (IRL-02 map), served from
 * the installed package: the bundler does not emit them. Two fixed files
 * only, nothing else from node_modules.
 */
const FILES = new Set(["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]);

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!FILES.has(file)) {
    return new Response("Not found", { status: 404 });
  }
  // Resolved from the app's directory at run time (the bundler would rewrite require.resolve).
  const body = await readFile(path.join(process.cwd(), "node_modules", "maplibre-gl", "dist", file));
  return new Response(body, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
