import { os } from "../procedures";

export const system = {
  health: os.system.health.handler(({ context }) => ({
    status: "ok" as const,
    version: context.version,
    time: new Date().toISOString(),
  })),
};
