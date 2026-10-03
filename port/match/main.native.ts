import { loadBytes, run } from "../../../dotframe/src/native/run";
import { createSetup, windowOptions } from "./game";

// Menus by default; CHARS or STAGE jump straight into a match.
const direct = process.env.CHARS !== undefined || process.env.STAGE !== undefined;
const human = !direct || process.env.HUMAN === "1";
const chars = (process.env.CHARS ?? "railly,anthony").split(",");
await run(
  windowOptions,
  createSetup(loadBytes, {
    root: process.env.SMASH_ROOT ?? ".",
    dotframe: process.env.DOTFRAME ?? "../dotframe",
    config: direct ? {
      stage: process.env.STAGE ?? "station",
      chars: [chars[0], chars.length > 1 ? chars[1] : chars[0]],
      mode: "vs",
      stocks: Number(process.env.STOCKS ?? "3"),
      cpu: [!human, true],
      cpuLevel: Number(process.env.CPU_LEVEL ?? "7"),
    } : null,
    humanP1: human,
  }),
);
