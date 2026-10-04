// k6 load test (docs/11): 3,000 realtime connections held through the Pact
// reveal, then a burst of messages between the pairs the reveal created.
// The clients behave like the reveal screen (pact-screen.tsx): on the
// broadcast they refresh `pact.current` and ask for their result, each
// after a random delay within PACT_RULES.revealJitterMs. API_URL may list
// several app processes (comma-separated): requests are spread over them
// by member, as a load balancer would.
// Prepared by `pnpm pact:load` (fictional « Charge » members, ids 10ad0000-…);
// see infra/load/README.md. Each VU holds SOCKETS_PER_VU members (pairs stay
// in the same VU, so a message's delivery is timed by one clock).
import { check } from "k6";
import exec from "k6/execution";
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";
import { WebSocket } from "k6/websockets";

const APIS = (__ENV.API_URL || "http://localhost:3000").split(",");
const MEMBERS = Number(__ENV.MEMBERS || 3000);
const PER_VU = Number(__ENV.SOCKETS_PER_VU || 30);
const RAMP_SECONDS = Number(__ENV.RAMP_SECONDS || 60);
const MESSAGES_PER_PAIR = Number(__ENV.MESSAGES_PER_PAIR || 3);
/** Results the API serves per second: the reveal window follows it (`revealWindowMs` in @atomes/core). */
const RESULTS_PER_SECOND = Number(__ENV.PACT_REVEAL_RESULTS_PER_SECOND || 400);
const REVEAL_JITTER_MS = Number(
  __ENV.REVEAL_JITTER_MS || Math.max(3000, Math.ceil((MEMBERS / RESULTS_PER_SECOND) * 1000)),
);
/** The burst starts this long after the reveal, once the result requests are over. */
const BURST_DELAY_MS = Number(__ENV.BURST_DELAY_SECONDS || 45) * 1000;
const REVEAL_AT = Date.parse(__ENV.REVEAL_AT || "");
const REVEAL_WAIT_MS = 60_000;
const DELIVERY_WAIT_MS = 15_000;

if (Number.isNaN(REVEAL_AT)) {
  throw new Error("REVEAL_AT is required (printed by pnpm pact:load).");
}
if (PER_VU % 2 !== 0) {
  throw new Error("SOCKETS_PER_VU must be even: the two members of a pair share a VU.");
}

const connected = new Rate("realtime_connected");
const connectTime = new Trend("realtime_connect_time", true);
const revealReceived = new Rate("pact_reveal_received");
const revealDelay = new Trend("pact_reveal_delay", true);
const resultReady = new Trend("pact_result_ready", true);
const personalEvents = new Counter("personal_events");
const messageDelivered = new Rate("message_delivered");
const messageDelivery = new Trend("message_delivery", true);

export const options = {
  scenarios: {
    reveal: {
      executor: "per-vu-iterations",
      vus: Math.ceil(MEMBERS / PER_VU),
      iterations: 1,
      maxDuration: "20m",
    },
  },
  thresholds: {
    realtime_connected: ["rate>0.99"],
    pact_reveal_received: ["rate>0.99"],
    // From the announced minute to the screen: docs/11 asks for a synchronised reveal.
    pact_reveal_delay: ["p(95)<3000"],
    // From the announced minute to the result on screen (the suspense lasts 2.6 s, the requests are spread over 3 s).
    pact_result_ready: ["p(95)<8000"],
    "http_req_duration{name:realtime.token}": ["p(95)<300"],
    // docs/11: message delivery (send → receipt) p95 < 1 s.
    message_delivery: ["p(95)<1000"],
    message_delivered: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const memberId = (index) => `10ad0000-0000-7000-8000-${index.toString(16).padStart(12, "0")}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** UUIDv7, as the app's clients generate message ids. */
function uuidv7() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let ms = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | (bytes[6] & 0x0f);
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** An oRPC procedure, signed in as `member` through the development header. */
async function rpc(path, member, input) {
  const api = APIS[Number.parseInt(member.slice(-4), 16) % APIS.length];
  const response = await http.asyncRequest(
    "POST",
    `${api}/api/rpc/${path.replace(".", "/")}`,
    JSON.stringify(input === undefined ? {} : { json: input }),
    {
      headers: { "content-type": "application/json", "x-dev-user-id": member },
      tags: { name: path },
      timeout: "30s",
    },
  );
  return response.status === 200 ? response.json("json") : null;
}

/** One member's Centrifugo connection, subscribed to its personal channel and the Pact broadcast. */
function connect(member, onPush) {
  return new Promise((resolve) => {
    let settled = false;
    const started = Date.now();
    const finish = (socket) => {
      if (!settled) {
        settled = true;
        connected.add(socket !== null);
        if (socket) {
          connectTime.add(Date.now() - started);
        }
        resolve(socket);
      }
    };
    rpc("realtime.token", member).then((auth) => {
      if (!auth) {
        finish(null);
        return;
      }
      const socket = new WebSocket(auth.url.replace("localhost", __ENV.CENTRIFUGO_HOST || "localhost"));
      const pending = new Set([1, 2, 3]);
      socket.onopen = () => {
        socket.send(
          [
            { id: 1, connect: { token: auth.token, name: "k6" } },
            { id: 2, subscribe: { channel: "broadcast:pact" } },
            { id: 3, subscribe: { channel: auth.channel } },
          ]
            .map((command) => JSON.stringify(command))
            .join("\n"),
        );
      };
      socket.onmessage = (event) => {
        for (const line of String(event.data).split("\n")) {
          if (line.length === 0) {
            continue;
          }
          const reply = JSON.parse(line);
          if (Object.keys(reply).length === 0) {
            socket.send("{}"); // pong
          } else if (reply.id !== undefined) {
            if (reply.error) {
              finish(null);
              socket.close();
              return;
            }
            pending.delete(reply.id);
            if (pending.size === 0) {
              finish(socket);
            }
          } else if (reply.push?.pub) {
            onPush(reply.push.channel, reply.push.pub.data);
          }
        }
      };
      socket.onerror = () => finish(null);
      socket.onclose = () => finish(null);
      setTimeout(() => {
        if (!settled) {
          finish(null);
          socket.close();
        }
      }, 15_000);
    });
  });
}

export default async function () {
  const vu = exec.vu.idInTest - 1;
  const first = vu * PER_VU;
  const indices = [];
  for (let i = first; i < Math.min(first + PER_VU, MEMBERS); i++) {
    indices.push(i);
  }
  // Connections spread over the ramp, as people open the reveal page.
  await wait((vu / Math.ceil(MEMBERS / PER_VU)) * RAMP_SECONDS * 1000);

  const members = indices.map((index) => ({
    id: memberId(index),
    socket: null,
    revealed: false,
    matchId: null,
  }));
  const sent = new Map(); // message id → send time
  const delivered = new Set();

  // Resolved once every connected member has its Pact result.
  let connectedCount = 0;
  let resultsIn = 0;
  let connecting = true;
  let resolveAll;
  const allRevealed = new Promise((resolve) => {
    resolveAll = resolve;
  });
  const settle = () => {
    if (!connecting && resultsIn === connectedCount) {
      resolveAll();
    }
  };

  for (const member of members) {
    member.socket = await connect(member.id, (channel, data) => {
      if (channel === "broadcast:pact" && data?.type === "pact.reveal" && !member.revealed) {
        member.revealed = true;
        revealDelay.add(Date.now() - REVEAL_AT);
        // What the reveal screen does: ask for the result after a random delay within the window that
        // `pact.current` gives for this season's size, and resync the season within the next minute.
        wait(REVEAL_JITTER_MS + Math.random() * 60_000).then(() => rpc("pact.current", member.id));
        wait(Math.random() * REVEAL_JITTER_MS)
          .then(() => rpc("pact.result", member.id, { locale: "fr" }))
          .then((result) => {
            member.matchId = result?.matches?.[0]?.matchId ?? null;
            if (result) {
              resultReady.add(Date.now() - REVEAL_AT);
            }
            check(member, { "pact.result has the pair's match": (m) => m.matchId !== null });
          })
          .finally(() => {
            resultsIn++;
            settle();
          });
      } else if (channel.startsWith("personal:")) {
        personalEvents.add(1);
        if (data?.type === "message.created" && sent.has(data.messageId) && !delivered.has(data.messageId)) {
          delivered.add(data.messageId);
          messageDelivery.add(Date.now() - sent.get(data.messageId));
        }
      }
    });
    if (member.socket) {
      connectedCount++;
    }
    await wait(20);
  }
  connecting = false;
  settle();

  // Waits for the reveal (scheduled by pnpm pact:load), at most a minute after the announced time.
  await Promise.race([allRevealed, wait(Math.max(0, REVEAL_AT - Date.now()) + REVEAL_WAIT_MS)]);
  for (const member of members) {
    if (member.socket) {
      revealReceived.add(member.revealed !== false);
    }
  }

  // Burst: in each pair, the first member writes to the second, a few seconds apart.
  await wait(Math.max(0, REVEAL_AT + BURST_DELAY_MS - Date.now()));
  const sends = [];
  for (let i = 0; i + 1 < members.length; i += 2) {
    const from = members[i];
    const to = members[i + 1];
    if (!from.matchId || !to.socket) {
      continue;
    }
    sends.push(
      (async () => {
        for (let n = 0; n < MESSAGES_PER_PAIR; n++) {
          await wait(1000 + Math.random() * 4000);
          const id = uuidv7();
          sent.set(id, Date.now());
          const ok = await rpc("messaging.send", from.id, {
            id,
            matchId: from.matchId,
            text: `Message de charge ${n + 1}`,
          });
          if (!ok) {
            sent.delete(id);
          }
        }
      })(),
    );
  }
  await Promise.all(sends);
  const deadline = Date.now() + DELIVERY_WAIT_MS;
  while (delivered.size < sent.size && Date.now() < deadline) {
    await wait(200);
  }
  for (const id of sent.keys()) {
    messageDelivered.add(delivered.has(id));
  }

  for (const member of members) {
    member.socket?.close();
  }
}
