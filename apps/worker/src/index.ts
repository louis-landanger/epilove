import { createServer } from "node:http";
import { createDatabase } from "@epilove/db";
import { createPublisher } from "@epilove/realtime";
import { run } from "graphile-worker";
import { parseEnv } from "./env";
import { crontab, taskList } from "./tasks";
import { startOutboxRelay } from "./tasks/outbox/relay";

const env = parseEnv();

// Realtime: outbox events published to Centrifugo as soon as their transaction commits.
if (env.CENTRIFUGO_URL && env.CENTRIFUGO_HTTP_API_KEY) {
  const { db } = createDatabase(env.DATABASE_URL, { maxConnections: 2 });
  await startOutboxRelay({
    db,
    databaseUrl: env.DATABASE_URL,
    publisher: createPublisher({ url: env.CENTRIFUGO_URL, apiKey: env.CENTRIFUGO_HTTP_API_KEY }),
    log: (line) => console.error(`[worker] ${line}`),
  });
} else {
  console.warn("[worker] CENTRIFUGO_URL is not set: realtime events are not relayed.");
}

if (env.WORKER_HEALTH_PORT) {
  createServer((request, response) => {
    response.writeHead(request.url === "/health" ? 200 : 404, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: request.url === "/health" ? "ok" : "not_found" }));
  }).listen(env.WORKER_HEALTH_PORT, "127.0.0.1");
}

const runner = await run({
  connectionString: env.DATABASE_URL,
  concurrency: env.WORKER_CONCURRENCY,
  taskList,
  crontab,
});

await runner.promise;
