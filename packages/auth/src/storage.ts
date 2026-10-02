import type { Redis } from "@epilove/rate-limit";
import type { SecondaryStorage } from "better-auth";

// INCR, and set the expiry only when the key is created (fixed window).
const INCREMENT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

/** Better Auth secondary storage on Valkey: sessions cache and rate-limit counters. */
export function valkeySecondaryStorage(client: Redis, prefix = "auth:"): SecondaryStorage {
  const key = (name: string) => `${prefix}${name}`;
  return {
    get: (name) => client.get(key(name)),
    getAndDelete: (name) => client.getdel(key(name)),
    increment: async (name, ttl) => Number(await client.eval(INCREMENT_SCRIPT, 1, key(name), ttl)),
    set: async (name, value, ttl) => {
      if (ttl && ttl > 0) {
        await client.set(key(name), value, "EX", ttl);
      } else {
        await client.set(key(name), value);
      }
    },
    delete: async (name) => {
      await client.del(key(name));
    },
  };
}
