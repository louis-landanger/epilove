// Stand-in for the Claude Messages API in the end-to-end scenarios (CHAT-04):
// the app is pointed at it with ANTHROPIC_BASE_URL and never reaches the real API.
import { createServer } from "node:http";

const port = Number(process.env.ANTHROPIC_MOCK_PORT ?? 3102);
const suggestions = [
  "Plutôt escalade en salle ou en falaise ?",
  "Ton spot préféré du campus pour réviser au calme ?",
  "Le dernier concert qui t'a vraiment marqué·e ?",
];

createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  if (request.method !== "POST" || !request.url?.startsWith("/v1/messages")) {
    response.writeHead(404).end();
    return;
  }
  request.resume();
  request.on("end", () => {
    response.writeHead(200, { "content-type": "application/json", "request-id": "req_e2e" });
    response.end(
      JSON.stringify({
        id: "msg_e2e",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify({ suggestions }) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
  });
}).listen(port, "127.0.0.1");
