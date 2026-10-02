import { run } from "graphile-worker";
import { parseEnv } from "./env";
import { crontab, taskList } from "./tasks";

const env = parseEnv();

const runner = await run({
  connectionString: env.DATABASE_URL,
  concurrency: env.WORKER_CONCURRENCY,
  taskList,
  crontab,
});

await runner.promise;
