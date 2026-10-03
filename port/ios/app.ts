// iOS entry, compiled with scriptc in library mode. The native host calls init once with the app bundle's
// resource path, then frame every display refresh. Loading is synchronous: library mode has no promises.
import { createDraw2D, type Draw2D } from "../../../dotframe/src/draw2d";
import { openLibraryPlatform } from "../../../dotframe/src/native/library";
import { createCPUController } from "../src/ai";
import { CHAR_IDS } from "../src/characters";
import { Game, type Results } from "../src/game";
import { ITEM_NAMES, itemIsSmooth, setItem } from "../src/items";
import { SFX_NAMES } from "../src/sfx-names";
import { initSound, registerSound, registerTrack } from "../src/sound";
import { loadSpriteData, setAtlas } from "../src/sprites";
import { createTouchControls, type TouchControls } from "../src/touch";

const STEP = 1 / 60;
const LOGICAL_HEIGHT = 720;
const CHARACTER_PAIRS = [
  ["railly", "anthony"],
  ["shiara", "edward"],
  ["jibaru", "railly"],
  ["anthony", "shiara"],
  ["edward", "jibaru"],
];
const STAGE_IDS = ["station", "final", "lima"];

let game: Game | null = null;
let ctx: Draw2D | null = null;
let touch: TouchControls | null = null;
let simulated = -1;
let round = 0;

export function init(base: string): void {
  const platform = openLibraryPlatform({ width: 1280, height: 720, title: "Crafter Smash" });
  const aspect = platform.width / Math.max(platform.height, 1);
  const width = Math.round(LOGICAL_HEIGHT * aspect);
  const draw = createDraw2D(platform.gpu, width, LOGICAL_HEIGHT);
  const decoder = new TextDecoder();
  const read = (path: string): Uint8Array => platform.readFile(`${base}/${path}`);

  draw.addFont(["Bangers", "Press Start 2P"], platform.image(read("dotframe/assets/fonts/bangers.png"), true), decoder.decode(read("dotframe/assets/fonts/bangers.json")));
  draw.addFont(
    ["Archivo Black", "Arial Black", "Impact", "sans-serif", "monospace", "Menlo", "Rubik"],
    platform.image(read("dotframe/assets/fonts/archivo-black.png"), true),
    decoder.decode(read("dotframe/assets/fonts/archivo-black.json")),
  );
  loadSpriteData(decoder.decode(read("port/assets/sprite-data.json")));
  for (const id of CHAR_IDS) {
    for (const variant of ["base", "alt"]) {
      setAtlas(id + variant, platform.image(read(`assets/sprites/${id}_${variant}.png`), false), false);
      setAtlas(id + variant, platform.image(read(`assets/sprites/${id}_${variant}_face.png`), false), true);
    }
  }
  for (const name of ITEM_NAMES) setItem(name, platform.image(read(`assets/items/${name}.png`), itemIsSmooth(name)));
  initSound(platform.audio);
  for (const name of SFX_NAMES) registerSound(name, platform.sound(read(`port/assets/sfx/${name}.mp3`)));
  for (const name of ["battlefield", "final_destination", "big_blue"]) registerTrack(name, platform.track(read(`assets/music/${name}.mp3`)));

  const controls = createTouchControls(platform.input, width, LOGICAL_HEIGHT);
  const created = new Game(platform.gpu, width, LOGICAL_HEIGHT, (port: number, cpu: boolean, level: number) =>
    port === 0 && !cpu ? controls.controller : createCPUController(level),
  );
  created.onEnd = (_results: Results): void => startRound(created);
  game = created;
  ctx = draw;
  touch = controls;
  startRound(created);
}

function startRound(g: Game): void {
  const pair = CHARACTER_PAIRS[round % CHARACTER_PAIRS.length];
  g.start({ stage: STAGE_IDS[round % STAGE_IDS.length], chars: [pair[0], pair[1]], mode: "vs", stocks: 3, cpu: [false, true], cpuLevel: 5 });
  round += 1;
}

// Returns false to ask the host to quit.
export function frame(time: number): boolean {
  const g = game;
  const draw = ctx;
  const controls = touch;
  if (!g || !draw || !controls) return true;
  if (simulated < 0) simulated = time;
  let steps = 0;
  while (simulated + STEP <= time && steps < 5) {
    g.step();
    simulated += STEP;
    steps += 1;
  }
  if (steps === 5) simulated = time;
  draw.begin();
  g.render(draw);
  controls.draw(draw);
  draw.end({ r: 0, g: 0, b: 0 });
  return true;
}
