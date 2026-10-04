// Menus drawn in the game canvas (title, character select, pause, results), shared by every platform.
// The original used DOM screens; drawing them with draw2d makes them work on native, iOS and Discord.
import type { Draw2D } from "../../vendor/dotframe/src/draw2d";
import { GamepadAxis, GamepadButton, type Input, keyCodes, MouseButton, type Touch } from "../../vendor/dotframe/src/input";
import { CHAR_IDS, getCharacter } from "./characters";
import { createHumanController, DEFAULT_KEYMAPS, type Keymap } from "./controllers";
import type { Fighter } from "./fighter";
import { Game, type GameConfig, type Results } from "./game";
import type { Controller, RawInput } from "./input";
import { decodeInput, encodeInput } from "./netinput";
import type { Netplay, OnlineLink, Rollback, StartMessage } from "./net-types";
import { playMusic, sfx, voice } from "./sound";
import { faces } from "./sprites";
import { STAGES } from "./stages";
import type { TouchControls } from "./touch";
import { clamp, seedRandom, shade } from "./util";

export interface MenuOptions {
  game: Game;
  input: Input;
  width: number;
  height: number;
  // Modes offered on the title screen: "cpu", "2p", "training".
  modes: string[];
  // Present on touch devices: drawn during fights, with a pause button.
  touch: TouchControls | null;
  // Relay connection and rollback engine for the "online" mode; null where netplay is unavailable.
  netplay: Netplay | null;
}

export interface Menu {
  // One 60 Hz step: reads input, advances the screen and, during fights, the game.
  step: () => void;
  render: (ctx: Draw2D) => void;
}

interface Button {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Nav {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
  start: boolean;
}

interface Selection {
  cur: number;
  chosen: boolean;
}

interface StatRow {
  label: string;
  value: (f: Fighter) => string;
}

const MODE_LABELS = new Map<string, string>([
  ["cpu", "1 JUGADOR vs CPU"],
  ["2p", "2 JUGADORES"],
  ["training", "ENTRENAMIENTO"],
  ["online", "EN LÍNEA"],
]);
const INPUT_DELAY = 2;
// About 330 ms at 60 Hz: past this unconfirmed span a peer waits instead of predicting.
export const MAX_ROLLBACK = 20;
const PAUSE_BUTTON = 44;
const INK = "#0d0b1a";

const emptyNav = (): Nav => ({ up: false, down: false, left: false, right: false, confirm: false, back: false, start: false });
const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a / b) * 100)}%` : "-");

const STAT_ROWS: StatRow[] = [
  { label: "KOs", value: (f: Fighter): string => `${f.record.kos}` },
  { label: "Caídas", value: (f: Fighter): string => `${f.record.falls}` },
  { label: "Autodestrucciones", value: (f: Fighter): string => `${f.record.sd}` },
  { label: "Daño hecho", value: (f: Fighter): string => `${Math.round(f.record.dealt)}%` },
  { label: "Daño recibido", value: (f: Fighter): string => `${Math.round(f.record.taken)}%` },
  { label: "Combo máximo", value: (f: Fighter): string => `${f.record.maxCombo} hits` },
  { label: "L-Cancel", value: (f: Fighter): string => `${f.record.lcOk}/${f.record.lcTotal} (${pct(f.record.lcOk, f.record.lcTotal)})` },
  { label: "Wavedashes", value: (f: Fighter): string => `${f.record.wavedash}` },
  { label: "Techs", value: (f: Fighter): string => `${f.record.techs}` },
  { label: "Parries", value: (f: Fighter): string => `${f.record.parries}` },
];

export function createMenu(options: MenuOptions): Menu {
  const game = options.game;
  const input = options.input;
  const W = options.width;
  const H = options.height;
  const cfg: GameConfig = { mode: "cpu", chars: ["railly", "anthony"], stage: "station", stocks: 3, cpuLevel: 5, cpu: [false, true] };
  const sel: Selection[] = [
    { cur: 0, chosen: false },
    { cur: 1, chosen: true },
  ];
  let screen = "title";
  let focus = 0;
  // Character select: once P1 has chosen, P1's stick walks these rows (stage, stocks, CPU level, ready).
  let optFocus = 0;
  let results: Results | null = null;
  let resultsT = 0;
  let t = 0;
  let greeted = false;
  // Netplay: its own Game whose controllers read the rollback engine's input slots.
  let link: OnlineLink | null = null;
  let rollback: Rollback | null = null;
  let notice = "";
  const netSlots = [0, 0];
  const netGame = new Game(game.gpu, W, H, (port: number): Controller => ({ isCPU: false, read: (): RawInput => decodeInput(netSlots[port]) }));
  const localController: Controller = options.touch ? options.touch.controller : createHumanController(input, 0, DEFAULT_KEYMAPS[0]);
  const online = (): boolean => cfg.mode === "online";
  const host = (): boolean => link !== null && link.slot() === 0;

  // ---------- Input: edge-triggered navigation per player, plus taps in logical pixels ----------
  const prevNav: Nav[] = [emptyNav(), emptyNav()];
  const nav: Nav[] = [emptyNav(), emptyNav()];
  const taps: number[] = [];
  let prevTouchIds: number[] = [];
  let prevMouse = false;

  const key = (code: string): boolean => {
    const id = keyCodes.indexOf(code);
    return id >= 0 && input.down(id);
  };
  const readNav = (port: number, keymap: Keymap): Nav => {
    const b = (button: number): boolean => input.button(port, button);
    const ax = input.axis(port, GamepadAxis.LeftX);
    const ay = input.axis(port, GamepadAxis.LeftY);
    const n = emptyNav();
    n.up = key(keymap.up) || b(GamepadButton.DpadUp) || ay < -0.6;
    n.down = key(keymap.down) || b(GamepadButton.DpadDown) || ay > 0.6;
    n.left = key(keymap.left) || b(GamepadButton.DpadLeft) || ax < -0.6;
    n.right = key(keymap.right) || b(GamepadButton.DpadRight) || ax > 0.6;
    n.confirm = key(keymap.attack) || b(GamepadButton.South);
    n.back = key(keymap.special) || b(GamepadButton.East);
    n.start = b(GamepadButton.Start);
    if (port === 0) {
      n.confirm = n.confirm || key("Enter");
      n.back = n.back || key("Escape") || key("Backspace");
      n.start = n.start || key("KeyP");
    }
    return n;
  };
  const edge = (now: boolean, before: boolean): boolean => now && !before;
  const readInput = (): void => {
    for (let p = 0; p < 2; p++) {
      const now = readNav(p, DEFAULT_KEYMAPS[p]);
      const before = prevNav[p];
      nav[p] = {
        up: edge(now.up, before.up),
        down: edge(now.down, before.down),
        left: edge(now.left, before.left),
        right: edge(now.right, before.right),
        confirm: edge(now.confirm, before.confirm),
        back: edge(now.back, before.back),
        start: edge(now.start, before.start),
      };
      prevNav[p] = now;
    }
    taps.length = 0;
    const pointer = input.pointer();
    const mouse = (pointer.buttons & MouseButton.Left) !== 0;
    if (mouse && !prevMouse) {
      taps.push(pointer.x * W);
      taps.push(pointer.y * H);
    }
    prevMouse = mouse;
    const touches: Touch[] = input.touches();
    const ids: number[] = [];
    for (const touch of touches) {
      ids.push(touch.id);
      if (prevTouchIds.indexOf(touch.id) < 0) {
        taps.push(touch.x * W);
        taps.push(touch.y * H);
      }
    }
    prevTouchIds = ids;
    if (taps.length > 0 && !greeted) {
      greeted = true;
      voice("name_crafter_smash", 1);
    }
  };
  const tapped = (b: Button): boolean => {
    for (let i = 0; i < taps.length; i += 2) {
      const x = taps[i];
      const y = taps[i + 1];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    return false;
  };

  // ---------- Layout (shared by step and render) ----------
  const column = (ids: string[], labels: string[], top: number): Button[] => {
    const out: Button[] = [];
    const w = 460;
    for (let i = 0; i < ids.length; i++) out.push({ id: ids[i], label: labels[i], x: (W - w) / 2, y: top + i * 78, w, h: 62 });
    return out;
  };
  const titleButtons = (): Button[] => {
    const labels: string[] = [];
    const modes: string[] = [];
    for (const mode of options.modes) if (mode !== "online" || options.netplay) modes.push(mode);
    for (const mode of modes) labels.push(MODE_LABELS.get(mode) ?? mode);
    return column(modes, labels, 380);
  };
  const pauseButtons = (): Button[] => column(["resume", "restart", "quit"], ["CONTINUAR", "REINICIAR", "SALIR AL MENÚ"], 300);
  const resultButtons = (): Button[] => {
    const out: Button[] = [];
    const ids = ["rematch", "reselect", "menu"];
    const labels = ["REVANCHA", "CAMBIAR PERSONAJES", "MENÚ"];
    const w = 300;
    const gap = 24;
    const x0 = (W - (w * 3 + gap * 2)) / 2;
    for (let i = 0; i < 3; i++) out.push({ id: ids[i], label: labels[i], x: x0 + i * (w + gap), y: H - 100, w, h: 64 });
    return out;
  };
  const CARD_W = 150;
  const CARD_H = 168;
  const cards = (): Button[] => {
    const out: Button[] = [];
    const gap = 18;
    const x0 = (W - (CARD_W * CHAR_IDS.length + gap * (CHAR_IDS.length - 1))) / 2;
    for (let i = 0; i < CHAR_IDS.length; i++) out.push({ id: CHAR_IDS[i], label: getCharacter(CHAR_IDS[i]).name, x: x0 + i * (CARD_W + gap), y: 96, w: CARD_W, h: CARD_H });
    return out;
  };
  const panelRect = (p: number): Button => {
    const w = Math.min(560, W / 2 - 60);
    const x = p === 0 ? W / 2 - 20 - w : W / 2 + 20;
    return { id: `panel${p}`, label: "", x, y: 286, w, h: 230 };
  };
  const tagRect = (p: number): Button => {
    const r = panelRect(p);
    return { id: `tag${p}`, label: "", x: r.x, y: r.y, w: 110, h: 44 };
  };
  // Option rows under the panels; each row is a list of buttons.
  const optionRows = (): Button[][] => {
    const rows: Button[][] = [];
    if (online() && !host()) return rows;
    const y = 538;
    const stageRow: Button[] = [];
    const sw = 210;
    let x = W / 2 - (sw * STAGES.length + 12 * (STAGES.length - 1)) / 2;
    for (const stage of STAGES) {
      stageRow.push({ id: `stage:${stage.id}`, label: stage.name, x, y, w: sw, h: 48 });
      x += sw + 12;
    }
    rows.push(stageRow);
    const steppers: string[] = [];
    if (cfg.mode !== "training") steppers.push("stocks");
    if (cfg.cpu[1] && cfg.mode !== "training" && !online()) steppers.push("cpuLevel");
    const stepW = 260;
    let sx = W / 2 - (stepW * steppers.length + 24 * (steppers.length - 1)) / 2;
    for (const name of steppers) {
      const row: Button[] = [];
      row.push({ id: `${name}:-`, label: "-", x: sx, y: y + 62, w: 56, h: 48 });
      row.push({ id: `${name}:+`, label: "+", x: sx + stepW - 56, y: y + 62, w: 56, h: 48 });
      rows.push(row);
      sx += stepW + 24;
    }
    return rows;
  };
  const backButton = (): Button => ({ id: "back", label: "VOLVER", x: 30, y: H - 76, w: 180, h: 56 });
  const readyButton = (): Button => ({ id: "ready", label: "¡A PELEAR!", x: W - 290, y: H - 82, w: 260, h: 64 });
  const pauseTouchButton = (): Button => ({ id: "pause", label: "II", x: W / 2 - PAUSE_BUTTON / 2, y: 12, w: PAUSE_BUTTON, h: PAUSE_BUTTON });

  // ---------- Flow ----------
  const variantOf = (p: number): string => (p === 1 && cfg.chars[0] === cfg.chars[1] && sel[0].chosen ? "alt" : "base");
  const ready = (): boolean => sel[0].chosen && sel[1].chosen;
  const show = (next: string): void => {
    screen = next;
    focus = 0;
    optFocus = 0;
    if (next === "title" || next === "select" || next === "online") playMusic("menu", false);
  };
  const leaveOnline = (message: string): void => {
    if (link) link.close();
    link = null;
    rollback = null;
    netGame.stop();
    notice = message;
    cfg.mode = "cpu";
    cfg.cpu = [false, true];
    show("title");
  };
  const enterOnlineSelect = (): void => {
    cfg.mode = "online";
    cfg.cpu = [false, false];
    sel[0].cur = CHAR_IDS.indexOf(cfg.chars[0]);
    sel[0].chosen = false;
    sel[1].chosen = false;
    show("select");
    voice("choose", 1);
  };
  const beginOnline = (start: StartMessage): void => {
    const l = link;
    const net = options.netplay;
    if (!l || !net) return;
    seedRandom(start.seed);
    netGame.start({ mode: "vs", chars: [start.chars[0], start.chars[1]], stage: start.stage, stocks: start.stocks, cpuLevel: 5, cpu: [false, false] });
    netGame.onEnd = null;
    rollback = net.createRollback({ game: netGame, transport: l.transport, localPort: l.slot(), slots: netSlots, inputDelay: INPUT_DELAY, maxRollback: MAX_ROLLBACK });
    sfx.select();
    show("online-fight");
  };
  const selectMode = (mode: string): void => {
    notice = "";
    if (mode === "online") {
      if (!options.netplay) return;
      link = options.netplay.connect();
      cfg.mode = "online";
      show("online");
      return;
    }
    cfg.mode = mode;
    cfg.cpu = mode === "2p" ? [false, false] : [false, true];
    sel[0].cur = CHAR_IDS.indexOf(cfg.chars[0]);
    sel[0].chosen = false;
    sel[1].cur = CHAR_IDS.indexOf(cfg.chars[1]);
    sel[1].chosen = cfg.cpu[1];
    show("select");
    voice("choose", 1);
  };
  const choose = (p: number): void => {
    cfg.chars[p] = CHAR_IDS[sel[p].cur];
    sel[p].chosen = true;
    if (online() && p === 0 && link) link.sendLobby({ t: "pick", char: cfg.chars[0] });
    sfx.medallion();
    voice(`name_${cfg.chars[p]}`, 1);
  };
  const unchoose = (p: number): void => {
    if (!sel[p].chosen) {
      if (p === 0) {
        sfx.back();
        if (online()) leaveOnline("");
        else show("title");
      }
      return;
    }
    sel[p].chosen = false;
    if (online() && p === 0 && link) link.sendLobby({ t: "unpick" });
    sfx.back();
  };
  const moveCursor = (p: number, d: number): void => {
    const n = CHAR_IDS.length;
    sel[p].cur = (sel[p].cur + d + n) % n;
    sfx.move();
  };
  const toggleCPU = (): void => {
    if (cfg.mode === "training" || online()) return;
    cfg.cpu[1] = !cfg.cpu[1];
    cfg.mode = cfg.cpu[1] ? "cpu" : "2p";
    sel[1].chosen = cfg.cpu[1];
    sfx.select();
  };
  const fight = (): void => {
    if (!ready()) {
      sfx.back();
      return;
    }
    if (online()) {
      // The host decides stage, stocks and the shared seed; the guest waits for that.
      const l = link;
      if (!l || !host()) return;
      const seed = Math.floor(Math.random() * 4294967296) >>> 0;
      // The host is slot 0, so its own pick (shown as P1) goes first.
      const start: StartMessage = { t: "start", seed, chars: [cfg.chars[0], cfg.chars[1]], stage: cfg.stage, stocks: cfg.stocks };
      l.sendLobby(start);
      beginOnline(start);
      return;
    }
    sfx.select();
    game.paused = false;
    game.start({ mode: cfg.mode, chars: [cfg.chars[0], cfg.chars[1]], stage: cfg.stage, stocks: cfg.stocks, cpuLevel: cfg.cpuLevel, cpu: [cfg.cpu[0], cfg.cpu[1]] });
    show("fight");
  };
  const pause = (on: boolean): void => {
    if (!game.running || game.phase === "gameover") return;
    game.paused = on;
    sfx.pause();
    show(on ? "pause" : "fight");
  };
  const quitToMenu = (): void => {
    game.stop();
    game.paused = false;
    show("title");
  };
  game.onEnd = (r: Results): void => {
    game.paused = true;
    results = r;
    resultsT = 0;
    show("results");
    const w = r.winner;
    playMusic(w ? `victory_${w.charId}` : "", false);
    voice("winnerIs", 1);
  };
  const adjust = (name: string, d: number): void => {
    if (name === "stocks") cfg.stocks = clamp(cfg.stocks + d, 1, 9);
    if (name === "cpuLevel") cfg.cpuLevel = clamp(cfg.cpuLevel + d, 1, 9);
    if (name === "stage") {
      let i = 0;
      for (let s = 0; s < STAGES.length; s++) if (STAGES[s].id === cfg.stage) i = s;
      cfg.stage = STAGES[(i + d + STAGES.length) % STAGES.length].id;
    }
    sfx.move();
  };
  // Rows P1 walks once chosen: the stage row, each stepper, then the ready button.
  const optionNames = (): string[] => {
    if (online() && !host()) return ["ready"];
    const out: string[] = ["stage"];
    if (cfg.mode !== "training") out.push("stocks");
    if (cfg.cpu[1] && cfg.mode !== "training" && !online()) out.push("cpuLevel");
    out.push("ready");
    return out;
  };
  const menuList = (buttons: Button[], onPick: (id: string) => void): void => {
    const n0 = nav[0];
    if (n0.down || n0.right) {
      focus = (focus + 1) % buttons.length;
      sfx.move();
    }
    if (n0.up || n0.left) {
      focus = (focus - 1 + buttons.length) % buttons.length;
      sfx.move();
    }
    for (let i = 0; i < buttons.length; i++) {
      if (tapped(buttons[i])) {
        focus = i;
        onPick(buttons[i].id);
        return;
      }
    }
    if (n0.confirm || n0.start) onPick(buttons[focus].id);
  };

  const stepLobby = (): boolean => {
    const l = link;
    if (!l) return false;
    if (l.status() !== "paired") {
      leaveOnline(l.status() === "closed" ? "Se perdió la conexión." : "Tu rival salió de la sala.");
      return true;
    }
    for (const message of l.receiveLobby()) {
      if (message.t === "pick") {
        cfg.chars[1] = message.char;
        sel[1].cur = CHAR_IDS.indexOf(message.char);
        sel[1].chosen = true;
      } else if (message.t === "unpick") {
        sel[1].chosen = false;
      } else if (message.t === "start" && !host()) {
        // Start lists chars by slot: the guest's own pick is chars[1].
        beginOnline(message);
        return true;
      }
    }
    return false;
  };

  const stepSelect = (): void => {
    if (online() && stepLobby()) return;
    const cardList = cards();
    for (let i = 0; i < cardList.length; i++) {
      if (!tapped(cardList[i])) continue;
      // Taps pick for P1, then for a human P2 still choosing.
      const p = sel[0].chosen && !cfg.cpu[1] && !sel[1].chosen && !online() ? 1 : 0;
      sel[p].cur = i;
      choose(p);
      return;
    }
    if (tapped(tagRect(1))) {
      toggleCPU();
      return;
    }
    const rows = optionRows();
    const stageRow: Button[] = rows.length > 0 ? rows[0] : [];
    for (const b of stageRow) {
      if (tapped(b)) {
        cfg.stage = b.id.slice(6);
        sfx.move();
        return;
      }
    }
    for (let r = 1; r < rows.length; r++) {
      for (const b of rows[r]) {
        if (tapped(b)) {
          const parts = b.id.split(":");
          adjust(parts[0], parts[1] === "+" ? 1 : -1);
          return;
        }
      }
    }
    if (tapped(backButton())) {
      sfx.back();
      show("title");
      return;
    }
    if (tapped(readyButton()) || nav[0].start) {
      fight();
      return;
    }
    for (let p = 0; p < 2; p++) {
      if (cfg.cpu[p] || (online() && p === 1)) continue;
      const n = nav[p];
      if (!sel[p].chosen) {
        if (n.left || n.up) moveCursor(p, -1);
        if (n.right || n.down) moveCursor(p, 1);
        if (n.confirm) choose(p);
        if (n.back) unchoose(p);
        continue;
      }
      if (n.back) {
        unchoose(p);
        continue;
      }
      if (p !== 0) continue;
      const names = optionNames();
      optFocus = clamp(optFocus, 0, names.length - 1);
      if (n.down) {
        optFocus = (optFocus + 1) % names.length;
        sfx.move();
      }
      if (n.up) {
        optFocus = (optFocus - 1 + names.length) % names.length;
        sfx.move();
      }
      const name = names[optFocus];
      if (name !== "ready" && n.left) adjust(name, -1);
      if (name !== "ready" && n.right) adjust(name, 1);
      // Once both have chosen, confirm starts the match from any row (the original's Enter).
      if (n.confirm && (name === "ready" || ready())) fight();
    }
  };

  const step = (): void => {
    t += 1;
    readInput();
    if (screen === "title") {
      menuList(titleButtons(), (id: string): void => {
        sfx.select();
        selectMode(id);
      });
    } else if (screen === "select") {
      stepSelect();
    } else if (screen === "online") {
      const l = link;
      if (!l || l.status() === "closed") leaveOnline("No se pudo conectar al servidor.");
      else if (l.status() === "paired") enterOnlineSelect();
      else if (nav[0].back || tapped(backButton())) {
        sfx.back();
        leaveOnline("");
      }
    } else if (screen === "online-fight") {
      const l = link;
      const rb = rollback;
      if (!l || !rb) return;
      if (l.status() !== "paired") {
        leaveOnline("Tu rival se desconectó.");
        return;
      }
      const me = netGame.fighters[l.slot()];
      rb.tick(encodeInput(localController.read(me, netGame)));
      // The match is over only once the frame that ended it is confirmed by both peers.
      if (netGame.phase === "gameover" && netGame.phaseT >= 160 && rb.confirmedFrame() >= rb.stats().frame) {
        results = netGame.results();
        resultsT = 0;
        show("results");
        const w = results.winner;
        playMusic(w ? `victory_${w.charId}` : "", false);
        voice("winnerIs", 1);
      }
    } else if (screen === "fight") {
      const wantsPause = nav[0].start || nav[1].start || (key("Escape") && nav[0].back) || (options.touch !== null && tapped(pauseTouchButton()));
      if (wantsPause) pause(true);
      else game.step();
    } else if (screen === "pause") {
      if (nav[0].start || nav[1].start || nav[0].back) {
        pause(false);
        return;
      }
      menuList(pauseButtons(), (id: string): void => {
        if (id === "resume") pause(false);
        else if (id === "restart") fight();
        else quitToMenu();
      });
    } else if (screen === "results") {
      resultsT += 1;
      const w = results ? results.winner : null;
      if (resultsT === 87 && w) voice(`name_${w.charId}`, 1);
      if (resultsT < 30) return;
      if (online()) {
        const l = link;
        // Keep feeding the peer so it can confirm the same ending.
        if (rollback) rollback.settle();
        if (l && l.status() !== "paired") {
          leaveOnline("Tu rival salió de la sala.");
          return;
        }
        menuList(resultButtons(), (id: string): void => {
          if (id === "menu") leaveOnline("");
          else enterOnlineSelect();
        });
        return;
      }
      menuList(resultButtons(), (id: string): void => {
        if (id === "rematch") fight();
        else if (id === "menu") quitToMenu();
        else {
          game.stop();
          game.paused = false;
          sel[0].cur = CHAR_IDS.indexOf(cfg.chars[0]);
          sel[0].chosen = false;
          sel[1].cur = CHAR_IDS.indexOf(cfg.chars[1]);
          show("select");
        }
      });
    }
  };

  // ---------- Drawing ----------
  const text = (ctx: Draw2D, s: string, x: number, y: number, size: number, color: string, align: string, font: string): void => {
    ctx.setFont(`${size}px ${font}`);
    ctx.setTextAlign(align);
    ctx.setTextBaseline("middle");
    // Drop shadow only for light text; dark text on a light button stays crisp.
    if (color !== INK) {
      ctx.setFillStyle(INK);
      ctx.fillText(s, x + 3, y + 3);
    }
    ctx.setFillStyle(color);
    ctx.fillText(s, x, y);
  };
  const panel = (ctx: Draw2D, x: number, y: number, w: number, h: number, fill: string, border: string): void => {
    ctx.setFillStyle(INK);
    ctx.fillRect(x + 5, y + 5, w, h);
    ctx.setFillStyle(fill);
    ctx.fillRect(x, y, w, h);
    ctx.setStrokeStyle(border);
    ctx.setLineWidth(3);
    ctx.strokeRect(x, y, w, h);
  };
  const button = (ctx: Draw2D, b: Button, focused: boolean, size: number): void => {
    panel(ctx, b.x, b.y, b.w, b.h, focused ? "#ffd23f" : "#2a2347", focused ? "#fff7cf" : "#5b4f8a");
    text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 2, size, focused ? INK : "#ffffff", "center", "Bangers");
  };
  // Cuts text with an ellipsis so it fits maxWidth at the current font.
  const fit = (ctx: Draw2D, s: string, maxWidth: number): string => {
    if (ctx.measureText(s).width <= maxWidth) return s;
    let n = s.length;
    while (n > 1 && ctx.measureText(`${s.slice(0, n)}…`).width > maxWidth) n -= 1;
    return `${s.slice(0, n)}…`;
  };
  const face = (ctx: Draw2D, id: string, variant: string, x: number, y: number, w: number, h: number, alpha: number): void => {
    const tex = faces.get(id + variant);
    if (!tex) return;
    const prev = ctx.getGlobalAlpha();
    ctx.setGlobalAlpha(prev * alpha);
    // Faces are square crops; fit them inside the box keeping the aspect.
    const s = Math.min(w / tex.width, h / tex.height);
    const dw = tex.width * s;
    const dh = tex.height * s;
    ctx.drawImage(tex, 0, 0, tex.width, tex.height, x + (w - dw) / 2, y + (h - dh), dw, dh);
    ctx.setGlobalAlpha(prev);
  };
  const backdrop = (ctx: Draw2D): void => {
    ctx.setFillStyle("#120e24");
    ctx.fillRect(0, 0, W, H);
    // Diagonal stripes drifting slowly.
    ctx.setFillStyle("#1a1533");
    const off = (t * 0.6) % 80;
    for (let x = -H - 80 + off; x < W + 80; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x + 40, H);
      ctx.lineTo(x + 40 + H, 0);
      ctx.lineTo(x + H, 0);
      ctx.closePath();
      ctx.fill();
    }
  };
  const dim = (ctx: Draw2D, alpha: number): void => {
    ctx.setFillStyle(`rgba(8,6,18,${alpha})`);
    ctx.fillRect(0, 0, W, H);
  };

  const renderTitle = (ctx: Draw2D): void => {
    backdrop(ctx);
    const n = CHAR_IDS.length;
    const size = 120;
    const x0 = W / 2 - (n * size + (n - 1) * 16) / 2;
    for (let i = 0; i < n; i++) {
      const c = getCharacter(CHAR_IDS[i]).colors;
      const bob = Math.sin(t / 20 + i * 1.3) * 8;
      const x = x0 + i * (size + 16);
      const y = 210 + bob;
      panel(ctx, x, y, size, size, shade(c.main, -40), c.main);
      face(ctx, CHAR_IDS[i], "base", x + 4, y + 4, size - 8, size - 8, 1);
    }
    const pulse = 1 + Math.sin(t / 15) * 0.03;
    ctx.save();
    ctx.translate(W / 2, 110);
    ctx.scale(pulse, pulse);
    text(ctx, "CRAFTER SMASH", 0, 0, 110, "#ffd23f", "center", "Bangers");
    ctx.restore();
    text(ctx, "Peleas de la comunidad Crafter Station", W / 2, 178, 22, "#c9c2ff", "center", "Archivo Black");
    const buttons = titleButtons();
    for (let i = 0; i < buttons.length; i++) button(ctx, buttons[i], i === focus, 34);
    if (notice !== "") text(ctx, notice, W / 2, H - 30, 22, "#ff8c8c", "center", "Archivo Black");
  };

  const renderOnline = (ctx: Draw2D): void => {
    backdrop(ctx);
    text(ctx, "EN LÍNEA", W / 2, 150, 90, "#ffd23f", "center", "Bangers");
    const l = link;
    const status = l ? l.status() : "closed";
    const dots = ".".repeat(1 + (Math.floor(t / 20) % 3));
    const line = status === "connecting" ? `Conectando${dots}` : status === "waiting" ? `Esperando rival${dots}` : "Conectado";
    text(ctx, line, W / 2, 300, 44, "#ffffff", "center", "Bangers");
    if (l) text(ctx, `Sala ${l.room.slice(0, 8)}: comparte esta Activity o este enlace con tu rival`, W / 2, 360, 20, "#c9c2ff", "center", "Archivo Black");
    button(ctx, backButton(), false, 28);
  };

  const renderPanel = (ctx: Draw2D, p: number): void => {
    const r = panelRect(p);
    const s = sel[p];
    const cpu = cfg.cpu[p];
    const id = s.chosen ? cfg.chars[p] : CHAR_IDS[s.cur];
    const c = getCharacter(id);
    const col = variantOf(p) === "alt" ? c.alt : c.colors;
    const tagColor = cpu ? "#8a8a99" : p === 0 ? "#ff4d5e" : "#3fa9ff";
    if (online() && p === 1 && !s.chosen) {
      panel(ctx, r.x, r.y, r.w, r.h, "#1d1838", tagColor);
      text(ctx, "RIVAL", r.x + r.w / 2, r.y + 80, 40, "#3fa9ff", "center", "Bangers");
      text(ctx, "eligiendo...", r.x + r.w / 2, r.y + 130, 20, "#c9c2ff", "center", "Archivo Black");
      return;
    }
    panel(ctx, r.x, r.y, r.w, r.h, shade(col.main, -65), tagColor);
    face(ctx, id, variantOf(p), r.x + 12, r.y + 52, 170, 170, s.chosen ? 1 : 0.45);
    const tag = tagRect(p);
    ctx.setFillStyle(tagColor);
    ctx.fillRect(tag.x, tag.y, tag.w, tag.h);
    const swap = p === 1 && cfg.mode !== "training" && !online() ? " ⇄" : "";
    const label = online() ? (p === 0 ? "TÚ" : "RIVAL") : cpu ? "CPU" : `P${p + 1}`;
    text(ctx, label + swap, tag.x + tag.w / 2, tag.y + tag.h / 2 + 2, 28, "#ffffff", "center", "Bangers");
    const tx = r.x + 196;
    text(ctx, s.chosen ? c.name : `¿${c.name}?`, tx, r.y + 30, 40, shade(col.main, 50), "left", "Bangers");
    text(ctx, c.title, tx, r.y + 68, 15, "#d8d2f5", "left", "Archivo Black");
    ctx.setFont("13px Archivo Black");
    ctx.setTextAlign("left");
    ctx.setTextBaseline("middle");
    const lines = Math.min(c.moveList.length, 6);
    for (let i = 0; i < lines; i++) {
      const m = c.moveList[i];
      ctx.setFillStyle("#ffd23f");
      ctx.fillText(m.input, tx, r.y + 100 + i * 21);
      ctx.setFillStyle("#ffffff");
      ctx.fillText(fit(ctx, m.text.trim(), r.x + r.w - 14 - (tx + 84)), tx + 84, r.y + 100 + i * 21);
    }
  };

  const renderSelect = (ctx: Draw2D): void => {
    backdrop(ctx);
    text(ctx, "ELIGE TU LUCHADOR", W / 2, 44, 52, "#ffffff", "center", "Bangers");
    text(ctx, MODE_LABELS.get(cfg.mode) ?? "", W - 30, 44, 26, "#ffd23f", "right", "Bangers");
    const list = cards();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const c = getCharacter(b.id).colors;
      let border = c.main;
      if (sel[0].cur === i && !sel[0].chosen) border = "#ff4d5e";
      if (sel[1].cur === i && !sel[1].chosen && !cfg.cpu[1]) border = "#3fa9ff";
      panel(ctx, b.x, b.y, b.w, b.h, shade(c.main, -55), border);
      face(ctx, b.id, "base", b.x + 6, b.y + 6, b.w - 12, b.h - 40, 1);
      text(ctx, b.label, b.x + b.w / 2, b.y + b.h - 18, 24, "#ffffff", "center", "Bangers");
      for (let p = 0; p < 2; p++) {
        const here = sel[p].chosen ? CHAR_IDS.indexOf(cfg.chars[p]) === i : sel[p].cur === i && !cfg.cpu[p];
        if (!here) continue;
        const tc = cfg.cpu[p] ? "#8a8a99" : p === 0 ? "#ff4d5e" : "#3fa9ff";
        const tx = b.x + 8 + p * 54;
        ctx.setFillStyle(INK);
        ctx.beginPath();
        ctx.arc(tx + 22, b.y + 24, 22, 0, Math.PI * 2, false);
        ctx.fill();
        ctx.setFillStyle(tc);
        ctx.beginPath();
        ctx.arc(tx + 20, b.y + 22, 20, 0, Math.PI * 2, false);
        ctx.fill();
        text(ctx, online() ? (p === 0 ? "TÚ" : "RIV") : cfg.cpu[p] ? "CPU" : `P${p + 1}`, tx + 20, b.y + 24, 18, "#ffffff", "center", "Bangers");
      }
    }
    renderPanel(ctx, 0);
    renderPanel(ctx, 1);
    const rows = optionRows();
    const names = optionNames();
    const focusName = sel[0].chosen && !cfg.cpu[0] ? names[clamp(optFocus, 0, names.length - 1)] : "";
    const stageRow: Button[] = rows.length > 0 ? rows[0] : [];
    for (const b of stageRow) {
      const on = b.id.slice(6) === cfg.stage;
      panel(ctx, b.x, b.y, b.w, b.h, on ? "#ffd23f" : "#2a2347", focusName === "stage" ? "#ffffff" : on ? "#fff7cf" : "#5b4f8a");
      text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 2, 24, on ? INK : "#ffffff", "center", "Bangers");
    }
    for (let r = 1; r < rows.length; r++) {
      const minus = rows[r][0];
      const plus = rows[r][1];
      const name = minus.id.split(":")[0];
      const label = name === "stocks" ? `VIDAS ${cfg.stocks}` : `NIVEL CPU ${cfg.cpuLevel}`;
      const focused = focusName === name;
      panel(ctx, minus.x, minus.y, plus.x + plus.w - minus.x, minus.h, "#1d1838", focused ? "#ffffff" : "#5b4f8a");
      button(ctx, minus, false, 32);
      button(ctx, plus, false, 32);
      text(ctx, label, (minus.x + plus.x + plus.w) / 2, minus.y + minus.h / 2 + 2, 26, focused ? "#ffd23f" : "#ffffff", "center", "Bangers");
    }
    button(ctx, backButton(), false, 28);
    if (ready() && online() && !host()) {
      text(ctx, "Esperando al anfitrión...", W - 30, H - 50, 24, "#ffd23f", "right", "Bangers");
    } else if (ready()) {
      const b = readyButton();
      const glow = focusName === "ready" || Math.floor(t / 20) % 2 === 0;
      button(ctx, b, glow, 36);
    }
    if (online() && link) text(ctx, `Sala ${link.room.slice(0, 8)}`, 30, 44, 20, "#9f97cc", "left", "Archivo Black");
    if (options.touch === null) {
      text(ctx, "Mover: WASD / Flechas / Stick  ·  Elegir: F / K / A  ·  Soltar: G / L / B  ·  Pelear: Enter / Start", W / 2, H - 14, 13, "#9f97cc", "center", "Archivo Black");
    }
  };

  const renderPause = (ctx: Draw2D): void => {
    dim(ctx, 0.6);
    text(ctx, "PAUSA", W / 2, 220, 90, "#ffd23f", "center", "Bangers");
    const buttons = pauseButtons();
    for (let i = 0; i < buttons.length; i++) button(ctx, buttons[i], i === focus, 34);
  };

  const renderResults = (ctx: Draw2D): void => {
    const r = results;
    if (!r) return;
    const reveal = clamp(resultsT / 30, 0, 1);
    dim(ctx, 0.75 * reveal);
    ctx.setGlobalAlpha(reveal);
    const w = r.winner;
    const color = w ? w.c.main : "#ffffff";
    text(ctx, "¡GANADOR!", W / 2, 54, 46, "#ffffff", "center", "Bangers");
    if (w) {
      panel(ctx, W / 2 - 300, 92, 170, 170, shade(color, -40), color);
      face(ctx, w.charId, w.variant, W / 2 - 296, 96, 162, 162, 1);
    }
    text(ctx, w ? w.char.name : "EMPATE", w ? W / 2 - 100 : W / 2, 176, 96, color, w ? "left" : "center", "Bangers");
    const fs = r.fighters;
    const tableW = Math.min(900, W - 80);
    const x0 = (W - tableW) / 2;
    const labelW = 300;
    const colW = (tableW - labelW) / Math.max(fs.length, 1);
    const y0 = 290;
    panel(ctx, x0 - 16, y0 - 12, tableW + 32, 40 + STAT_ROWS.length * 28, "rgba(29,24,56,0.92)", "#5b4f8a");
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      text(ctx, f.char.name + (f.isCPU ? " (CPU)" : ""), x0 + labelW + colW * i + colW / 2, y0 + 12, 24, f.c.main, "center", "Bangers");
    }
    ctx.setFont("16px Archivo Black");
    ctx.setTextBaseline("middle");
    for (let row = 0; row < STAT_ROWS.length; row++) {
      const y = y0 + 44 + row * 28;
      ctx.setTextAlign("left");
      ctx.setFillStyle("#c9c2ff");
      ctx.fillText(STAT_ROWS[row].label, x0, y);
      ctx.setTextAlign("center");
      ctx.setFillStyle("#ffffff");
      for (let i = 0; i < fs.length; i++) ctx.fillText(STAT_ROWS[row].value(fs[i]), x0 + labelW + colW * i + colW / 2, y);
    }
    const buttons = resultButtons();
    for (let i = 0; i < buttons.length; i++) button(ctx, buttons[i], i === focus, 30);
    ctx.setGlobalAlpha(1);
  };

  const render = (ctx: Draw2D): void => {
    if (screen === "title") {
      renderTitle(ctx);
      return;
    }
    if (screen === "select") {
      renderSelect(ctx);
      return;
    }
    if (screen === "online") {
      renderOnline(ctx);
      return;
    }
    const active = online() ? netGame : game;
    active.render(ctx);
    const rb = rollback;
    if (screen === "online-fight" && rb) {
      const st = rb.stats();
      if (options.touch) options.touch.draw(ctx);
      ctx.setFont("14px Archivo Black");
      ctx.setTextAlign("left");
      ctx.setTextBaseline("top");
      ctx.setFillStyle(st.desync >= 0 ? "#ff4d5e" : "rgba(255,255,255,0.6)");
      const ping = Math.round((st.rtt * 1000) / 60);
      const line = `EN LÍNEA · ping ${ping} ms · rollbacks ${st.rollbacks} (máx ${st.longestRollback}f) · pausas ${st.stalls} · adelanto ${st.ahead.toFixed(1)}f · tick ${st.tickMs.toFixed(1)} ms`;
      ctx.fillText(st.desync >= 0 ? `DESYNC en frame ${st.desync}` : line, 12, 10);
    }
    const controls = options.touch;
    if (screen === "fight" && controls) {
      controls.draw(ctx);
      const b = pauseTouchButton();
      ctx.setFillStyle("rgba(13,11,26,0.55)");
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.setFillStyle("#ffffff");
      ctx.fillRect(b.x + 14, b.y + 11, 6, 22);
      ctx.setFillStyle("#ffffff");
      ctx.fillRect(b.x + 25, b.y + 11, 6, 22);
    }
    if (screen === "pause") renderPause(ctx);
    if (screen === "results") renderResults(ctx);
  };

  show("title");
  return { step, render };
}
