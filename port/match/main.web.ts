import { loadBytes, run } from "../../../dotframe/src/web/run";
import { isDiscordActivity, showMessage, startDiscord } from "./discord";
import { createSetup, windowOptions } from "./game";

// Menus by default. ?chars=railly,shiara&stage=lima&human=1&level=7&stocks=3 jumps straight into a match.
const params = new URLSearchParams(location.search);
const chars = (params.get("chars") ?? "railly,anthony").split(",");
const discord = isDiscordActivity();
// In Discord the player always fights the CPU until there is netcode.
const direct = params.has("chars") || params.has("stage");
const human = discord || !direct || params.get("human") === "1";
if (discord) {
  try {
    await startDiscord();
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "No se pudo conectar con Discord.");
    throw error;
  }
}
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
  }),
  );
} catch (error) {
  // Most likely no WebGPU in this browser or Discord client; say so instead of a black screen.
  showMessage(error instanceof Error ? error.message : "No se pudo iniciar el juego.");
  throw error;
}
