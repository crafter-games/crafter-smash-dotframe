// iOS entry, compiled with scriptc in library mode. The native host calls init once with the app bundle's
// resource path, then frame every display refresh. Loading is synchronous: library mode has no promises.
import { createDraw2D, type Draw2D } from "../../vendor/dotframe/src/draw2d";
import { openLibraryPlatform } from "../../vendor/dotframe/src/native/library";
import { createCPUController } from "../src/ai";
import { CHAR_IDS } from "../src/characters";
import { Game } from "../src/game";
import { ITEM_NAMES, itemIsSmooth, setItem } from "../src/items";
import { SFX_NAMES } from "../src/sfx-names";
import { createMenu, type Menu } from "../src/menu";
import { initSound, registerSound, registerTrack } from "../src/sound";
import { loadSpriteData, setAtlas } from "../src/sprites";
import { createTouchControls } from "../src/touch";

const STEP = 1 / 60;
const LOGICAL_HEIGHT = 720;
let menu: Menu | null = null;
let ctx: Draw2D | null = null;
let simulated = -1;

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
  const music = ["battlefield", "final_destination", "big_blue", "menu"];
  for (const id of CHAR_IDS) music.push(`victory_${id}`);
  for (const name of music) registerTrack(name, platform.track(read(`assets/music/${name}.mp3`)));

  const controls = createTouchControls(platform.input, width, LOGICAL_HEIGHT);
  const created = new Game(platform.gpu, width, LOGICAL_HEIGHT, (port: number, cpu: boolean, level: number) =>
    port === 0 && !cpu ? controls.controller : createCPUController(level),
  );
  menu = createMenu({ game: created, input: platform.input, width, height: LOGICAL_HEIGHT, modes: ["cpu", "training"], touch: controls });
  ctx = draw;
}

// Returns false to ask the host to quit.
export function frame(time: number): boolean {
  const m = menu;
  const draw = ctx;
  if (!m || !draw) return true;
  if (simulated < 0) simulated = time;
  let steps = 0;
  while (simulated + STEP <= time && steps < 5) {
    m.step();
    simulated += STEP;
    steps += 1;
  }
  if (steps === 5) simulated = time;
  draw.begin();
  m.render(draw);
  draw.end({ r: 0, g: 0, b: 0 });
  return true;
}
