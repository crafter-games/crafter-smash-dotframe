// Playable milestone: one match with every engine piece of the port (stages, fighters, AI, effects, sound, HUD).
import type { Audio } from "../../vendor/dotframe/src/audio";
import { createDraw2D, type Draw2D } from "../../vendor/dotframe/src/draw2d";
import type { Frame, Gpu, Setup } from "../../vendor/dotframe/src/gpu";
import type { Platform } from "../../vendor/dotframe/src/platform";
import { createCPUController } from "../src/ai";
import { CHAR_IDS } from "../src/characters";
import { createHumanController, DEFAULT_KEYMAPS } from "../src/controllers";
import { Game, type GameConfig } from "../src/game";
import { ITEM_NAMES } from "../src/items";
import { loadAtlas, loadItem, loadSound, loadTrack } from "../src/loaders";
import { SFX_NAMES } from "../src/sfx-names";
import { initSound } from "../src/sound";
import { createMenu } from "../src/menu";
import type { Netplay } from "../src/net-types";
import { loadSpriteData } from "../src/sprites";

export const windowOptions = { width: 1280, height: 720, title: "Crafter Smash" };

export type LoadBytes = (path: string) => Promise<Uint8Array>;

export interface MatchOptions {
  // Paths relative to the crafter-smash repo root and to dotframe's assets.
  root: string;
  dotframe: string;
  // Skips the menus and starts this match directly (smoke tests, Discord 1P vs CPU).
  config: GameConfig | null;
  humanP1: boolean;
  netplay: Netplay | null;
}

export interface AssetTargets {
  gpu: Gpu;
  draw: Draw2D;
  // Null skips sound and music (snapshots render silently).
  audio: Audio | null;
  load: LoadBytes;
  root: string;
  dotframe: string;
}

// Loads fonts, sprite data, sprites, items, and (with audio) sound and music. track() sees each parallel task.
export async function loadMatchAssets(t: AssetTargets, track: (task: Promise<void>) => void = (): void => {}): Promise<void> {
  const { gpu, draw, audio, load, root } = t;
  const decoder = new TextDecoder();
  const tasks: Promise<void>[] = [];
  const add = (task: Promise<void>): void => {
    tasks.push(task);
    track(task);
  };
  const fontAtlas = await gpu.createImage(await load(`${t.dotframe}/assets/fonts/bangers.png`), true);
  draw.addFont(["Bangers", "Press Start 2P"], fontAtlas, decoder.decode(await load(`${t.dotframe}/assets/fonts/bangers.json`)));
  const archivo = await gpu.createImage(await load(`${t.dotframe}/assets/fonts/archivo-black.png`), true);
  draw.addFont(["Archivo Black", "Arial Black", "Impact", "sans-serif", "monospace", "Menlo", "Rubik"], archivo, decoder.decode(await load(`${t.dotframe}/assets/fonts/archivo-black.json`)));
  loadSpriteData(decoder.decode(await load(`${root}/port/assets/sprite-data.json`)));
  for (const id of CHAR_IDS) {
    for (const variant of ["base", "alt"]) {
      add(load(`${root}/assets/sprites/${id}_${variant}.png`).then((png: Uint8Array): Promise<void> => loadAtlas(gpu, id + variant, png, false)));
      add(load(`${root}/assets/sprites/${id}_${variant}_face.png`).then((png: Uint8Array): Promise<void> => loadAtlas(gpu, id + variant, png, true)));
    }
  }
  for (const name of ITEM_NAMES) add(load(`${root}/assets/items/${name}.png`).then((png: Uint8Array): Promise<void> => loadItem(gpu, name, png)));
  if (audio) {
    for (const name of SFX_NAMES) add(load(`${root}/port/assets/sfx/${name}.mp3`).then((mp3: Uint8Array): Promise<void> => loadSound(audio, name, mp3)));
    const music = ["battlefield", "final_destination", "big_blue", "menu"];
    for (const id of CHAR_IDS) music.push(`victory_${id}`);
    for (const name of music) add(load(`${root}/assets/music/${name}.mp3`).then((mp3: Uint8Array): Promise<void> => loadTrack(audio, name, mp3)));
  }
  for (const task of tasks) await task;
}

const STEP = 1 / 60;

export function createSetup(load: LoadBytes, options: MatchOptions): Setup {
  return ({ gpu, input, audio }: Platform): Frame => {
    const W = windowOptions.width;
    const H = windowOptions.height;
    const ctx = createDraw2D(gpu, W, H);
    initSound(audio);
    let ready = false;
    let loaded = 0;
    let total = 0;
    const game = new Game(gpu, W, H, (port, cpu, level) =>
      cpu || (port === 0 && !options.humanP1) ? createCPUController(level) : createHumanController(input, port, DEFAULT_KEYMAPS[port]),
    );

    const loadAll = async (): Promise<void> => {
      await loadMatchAssets({ gpu, draw: ctx, audio, load, root: options.root, dotframe: options.dotframe }, (task: Promise<void>): void => {
        total += 1;
        void task.then((): void => {
          loaded += 1;
        });
      });
      ready = true;
      if (options.config) game.start(options.config);
    };
    loadAll().catch((error: unknown): void => {
      console.error(`asset loading failed: ${error instanceof Error ? error.message : "unknown error"}`);
    });

    const menu = createMenu({ game, input, width: W, height: H, modes: ["cpu", "online", "2p", "training"], touch: null, netplay: options.netplay });
    let simulated = 0;
    let started = -1;
    return (time: number): boolean => {
      ctx.begin();
      if (!ready) {
        ctx.setFillStyle("#07060f");
        ctx.fillRect(0, 0, W, H);
        ctx.setFont("40px Bangers");
        ctx.setTextAlign("center");
        ctx.setTextBaseline("middle");
        ctx.setFillStyle("#ffffff");
        ctx.fillText(`CARGANDO ${loaded}/${total}`, W / 2, H / 2);
        ctx.end({ r: 0, g: 0, b: 0 });
        return true;
      }
      if (started < 0) {
        started = time;
        simulated = time;
      }
      // Fixed 60 Hz simulation, at most 5 steps per frame (as the original loop).
      let steps = 0;
      while (simulated + STEP <= time && steps < 5) {
        if (options.config) game.step();
        else menu.step();
        simulated += STEP;
        steps += 1;
      }
      if (steps === 5) simulated = time;
      if (options.config) game.render(ctx);
      else menu.render(ctx);
      ctx.end({ r: 0, g: 0, b: 0 });
      return true;
    };
  };
}
