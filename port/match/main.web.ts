import { loadBytes, run } from "../../../dotframe/src/web/run";
import { createSetup, windowOptions } from "./game";

// ?chars=railly,shiara&stage=lima&human=1&level=7&stocks=3
const params = new URLSearchParams(location.search);
const chars = (params.get("chars") ?? "railly,anthony").split(",");
const human = params.get("human") === "1";
await run(
  windowOptions,
  createSetup(loadBytes, {
    root: ".",
    dotframe: "dotframe",
    config: {
      stage: params.get("stage") ?? "station",
      chars: [chars[0], chars.length > 1 ? chars[1] : chars[0]],
      mode: "vs",
      stocks: Number(params.get("stocks") ?? "3"),
      cpu: [!human, true],
      cpuLevel: Number(params.get("level") ?? "7"),
    },
    humanP1: human,
  }),
);
