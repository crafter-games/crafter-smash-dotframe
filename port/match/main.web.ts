import { loadBytes, run } from "../../vendor/dotframe/src/web/run";
import { isDiscordActivity, showMessage, startDiscord } from "./discord";
import { createRollback } from "../src/netplay";
import { connectOnline } from "../src/online";
import { createSetup, windowOptions } from "./game";

// Menus by default. ?chars=railly,shiara&stage=lima&human=1&level=7&stocks=3 jumps straight into a match.
const params = new URLSearchParams(location.search);
const chars = (params.get("chars") ?? "railly,anthony").split(",");
const discord = isDiscordActivity();
// In Discord the player always fights the CPU until there is netcode.
const direct = params.has("chars") || params.has("stage");
const human = discord || !direct || params.get("human") === "1";
let room = params.get("room") ?? "";
if (discord) {
  try {
    room = await startDiscord();
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "No se pudo conectar con Discord.");
    throw error;
  }
}
// Online play: in Discord the relay is reached through the Activity's /relay URL mapping and the room is the
// Activity instance, so everyone who joins the same launch meets. On the web, ?room= pairs two tabs or links.
if (room === "") {
  room = Math.random().toString(36).slice(2, 10);
  if (!discord) {
    params.set("room", room);
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  }
}
const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const relay = params.get("relay") ?? (discord ? `wss://${location.host}/relay` : local ? "ws://localhost:8787" : "");
const netplay = relay === "" ? null : { connect: () => connectOnline(relay, room), createRollback };
try {
  await run(
  windowOptions,
  createSetup(loadBytes, {
    root: ".",
    dotframe: "dotframe",
    config: direct ? {
      stage: params.get("stage") ?? "station",
      chars: [chars[0], chars.length > 1 ? chars[1] : chars[0]],
      mode: "vs",
      stocks: Number(params.get("stocks") ?? "3"),
      cpu: [!human, true],
      cpuLevel: Number(params.get("level") ?? "7"),
    } : null,
    humanP1: human,
    netplay,
  }),
  );
} catch (error) {
  // Most likely no WebGPU in this browser or Discord client; say so instead of a black screen.
  showMessage(error instanceof Error ? error.message : "No se pudo iniciar el juego.");
  throw error;
}
