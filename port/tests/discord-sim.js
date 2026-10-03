// agent-browser init script that plays Discord's side of the Embedded App SDK RPC, as craft-ones' discord.spec.ts does.
// The SDK posts [opcode, payload] to window.parent; at top level that is this window, so replies are dispatched here
// with Discord's origin. Opcode 0 is the handshake, 1 a command frame, 2 close.
window.addEventListener("message", (event) => {
  if (event.origin === "https://discord.com") return;
  const message = event.data;
  if (!Array.isArray(message) || ![0, 1, 2].includes(message[0])) return;
  event.stopImmediatePropagation();
  const [opcode, payload] = message;
  const reply = (data) =>
    setTimeout(() => window.dispatchEvent(new MessageEvent("message", { origin: "https://discord.com", data: [1, data] })), 0);
  if (opcode === 0) {
    reply({ cmd: "DISPATCH", evt: "READY", nonce: null, data: { v: 1, config: { api_endpoint: "//discord.com/api", environment: "production" } } });
    return;
  }
  if (opcode === 2) {
    document.documentElement.dataset.discordClosed = "true";
    return;
  }
  reply({ cmd: payload.cmd, evt: null, nonce: payload.nonce, data: {} });
});
