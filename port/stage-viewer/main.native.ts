import { loadBytes, run } from "../../vendor/dotframe/src/native/run";
import { createSetup, windowOptions } from "./game";

const dotframe = process.env.DOTFRAME ?? "vendor/dotframe";
await run(
  windowOptions,
  createSetup(
    {
      atlas: await loadBytes(`${dotframe}/assets/fonts/bangers.png`),
      metrics: await loadBytes(`${dotframe}/assets/fonts/bangers.json`),
    },
    Number(process.env.STAGE ?? "-1"),
  ),
);
