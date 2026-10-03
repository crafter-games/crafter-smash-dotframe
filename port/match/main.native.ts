import { loadBytes, run } from "../../../dotframe/src/native/run";
import { createSetup, windowOptions } from "./game";

const chars = (process.env.CHARS ?? "railly,anthony").split(",");
await run(
  windowOptions,
  createSetup(loadBytes, {
    root: process.env.SMASH_ROOT ?? ".",
    dotframe: process.env.DOTFRAME ?? "../dotframe",
    config: {
      stage: process.env.STAGE ?? "station",
      chars: [chars[0], chars.length > 1 ? chars[1] : chars[0]],
      mode: "vs",
      stocks: Number(process.env.STOCKS ?? "3"),
      cpu: [process.env.HUMAN !== "1", true],
      cpuLevel: Number(process.env.CPU_LEVEL ?? "7"),
    },
    humanP1: process.env.HUMAN === "1",
  }),
);
