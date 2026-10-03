// Discord Activity entry: detects the embedded launch, completes the SDK handshake and reports what the client supports.
import { DiscordSDK } from "@discord/embedded-app-sdk";

const HANDSHAKE_TIMEOUT_MS = 20000;

export function isDiscordActivity(): boolean {
  const params = new URLSearchParams(location.search);
  return /\.discordsays\.com$/.test(location.hostname) || (params.has("frame_id") && params.has("instance_id"));
}

// Discord serves the Activity from <client id>.discordsays.com; ?client_id= covers local tests.
function clientId(): string {
  const fromHost = /^(\d{17,20})\.discordsays\.com$/.exec(location.hostname);
  if (fromHost) return fromHost[1];
  return new URLSearchParams(location.search).get("client_id") ?? "";
}

function report(key: string, value: string): void {
  document.documentElement.dataset[key] = value;
  console.log(`discord ${key}: ${value}`);
}

export function showMessage(text: string): void {
  const box = document.createElement("div");
  box.textContent = text;
  box.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:#fff;font:600 18px system-ui;background:#07060f";
  document.body.appendChild(box);
}

// Resolves once Discord has acknowledged the Activity; rejects on timeout or a missing client id.
export async function startDiscord(): Promise<void> {
  report("webgpu", "gpu" in navigator && navigator.gpu ? "available" : "missing");
  const id = clientId();
  if (id === "") throw new Error("Falta el client id de Discord.");
  const sdk = new DiscordSDK(id, { disableConsoleLogOverride: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sdk.ready(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Discord no respondió. Cierra y vuelve a abrir la Activity.")), HANDSHAKE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  report("handshake", "ready");
  report("platform", sdk.platform);
}
