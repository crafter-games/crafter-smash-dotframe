// Milestone viewer: bakes every stage and cycles through them with the game's default camera.
import { createDraw2D } from "../../vendor/dotframe/src/draw2d";
import type { Frame, Setup, Texture } from "../../vendor/dotframe/src/gpu";
import type { Platform } from "../../vendor/dotframe/src/platform";
import { drawStageBackground, drawStageForeground, makeStage, STAGES, type Stage } from "../src/stages";

export const windowOptions = { width: 1280, height: 720, title: "Crafter Smash: stages" };

export interface FontAssets {
  atlas: Uint8Array;
  metrics: Uint8Array;
}

// stageIndex < 0 cycles through every stage.
export function createSetup(font: FontAssets, stageIndex: number): Setup {
  return ({ gpu }: Platform): Frame => {
    const W = windowOptions.width;
    const H = windowOptions.height;
    const ctx = createDraw2D(gpu, W, H);
    gpu.createImage(font.atlas, true).then((atlas: Texture): void => {
      ctx.addFont(["Bangers", "Press Start 2P", "monospace"], atlas, new TextDecoder().decode(font.metrics));
    });
    const bakeStart = performance.now();
    const stages: Stage[] = STAGES.map((def): Stage => makeStage(def.id, gpu));
    console.log(`baked ${stages.length} stages in ${(performance.now() - bakeStart).toFixed(0)} ms`);
    const cam = { x: 800, y: 450, zoom: Math.min(W / 1300, H / 760) };

    return (time: number): boolean => {
      const stage = stages[stageIndex >= 0 ? stageIndex : Math.floor(time / 4) % stages.length];
      const t = time * 60;
      ctx.begin();
      ctx.setFillStyle("#07060f");
      ctx.fillRect(0, 0, W, H);
      drawStageBackground(stage, ctx, W, H, cam, t);
      const z = cam.zoom;
      ctx.setTransform(z, 0, 0, z, W / 2 - cam.x * z, H / 2 - cam.y * z);
      drawStageForeground(stage, ctx);
      ctx.resetTransform();
      ctx.setFont("28px Bangers");
      ctx.setTextAlign("left");
      ctx.setTextBaseline("top");
      ctx.setFillStyle("#ffffff");
      ctx.fillText(stage.name, 20, 16);
      ctx.end({ r: 0, g: 0, b: 0 });
      return true;
    };
  };
}
