// Fighter: state machine and Melee-style physics, ported from js/fighter.js.
import type { Draw2D } from "../../vendor/dotframe/src/draw2d";
import { getCharacter } from "./characters";
import type { Game } from "./game";
import { type Controller, emptyFrameInput, emptyInput, type FrameInput, type RawInput, TAP_JUMP } from "./input";
import { drawHammer } from "./items";
import { BASE_POSE, lerpPose, mergePose, type Pose, type PoseOverride } from "./pose";
import { sfx } from "./sound";
import { drawFighterBody, spriteFrame } from "./sprites";
import type { Ledge, Platform } from "./stages";
import { type Character, type Colors, H, type Hitbox, type Move, type Stats, type Throw } from "./types";
import { approach, clamp, DEG, easeOut, lerp, rand, sgn, SZ, TAU } from "./util";

const BUFFER = 6; // input buffer frames
export const KB_SCALE = 0.13; // knockback to px/frame
const KB_DECAY = 0.24; // knockback deceleration per frame
export const TUMBLE_KB = 80; // knockback from which a hit causes tumble
export const HURT_W = 44 * SZ;
export const HURT_H = 108 * SZ;
const CROUCH_H = 70 * SZ;
const LCANCEL_WIN = 7;
const TECH_WIN = 20;
const AIR_POSE: PoseOverride = { legF: [60, -95], legB: [15, -70], armF: [60, 50], armB: [-50, 40], lean: 0 };

export interface FighterRecord {
  dealt: number;
  taken: number;
  kos: number;
  falls: number;
  lcOk: number;
  lcTotal: number;
  wavedash: number;
  techs: number;
  parries: number;
  maxCombo: number;
  sd: number;
  aerial: number;
  dashdance: number;
}

interface Buffer {
  attack: number;
  special: number;
  jump: number;
  shield: number;
  grab: number;
  taunt: number;
  c: number;
}

interface Tap {
  dir: number;
  age: number;
}

interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Knockback {
  speed: number;
  ang: number;
}

// Per-move scratch state, reset on every startMove.
export interface MoveScratch {
  dir: number;
  throwDir: string;
  dx: number;
  dy: number;
  ct: number;
  c: number;
  caught: Fighter | null;
  wd: boolean;
  dmg: number;
  baseY: number;
  cat: string;
}

const emptyScratch = (): MoveScratch => ({
  dir: 0,
  throwDir: "",
  dx: 0,
  dy: 0,
  ct: 0,
  c: 0,
  caught: null,
  wd: false,
  dmg: 0,
  baseY: 0,
  cat: "",
});

const emptyRecord = (): FighterRecord => ({
  dealt: 0,
  taken: 0,
  kos: 0,
  falls: 0,
  lcOk: 0,
  lcTotal: 0,
  wavedash: 0,
  techs: 0,
  parries: 0,
  maxCombo: 0,
  sd: 0,
  aerial: 0,
  dashdance: 0,
});

const SLIDE_STATES = new Set(["idle", "walk", "dash", "run", "turn", "land", "crouch", "shielddrop", "hitstun", "down", "dizzy", "tech"]);
const FALL_OFF_STATES = new Set(["idle", "walk", "dash", "run", "turn", "land", "crouch", "shielddrop"]);
const NO_PHYSICS_STATES = new Set(["ledge", "grabbed", "locked", "dead", "respawn"]);

export class Fighter {
  game: Game;
  char: Character;
  charId: string;
  c: Colors;
  variant: string;
  stats: Stats;
  port: number;
  ctrl: Controller;
  isCPU: boolean;
  stocks = 3;
  percent = 0;
  meter = 0;
  record: FighterRecord = emptyRecord();
  prevRaw: RawInput = emptyInput();
  inp: FrameInput = emptyFrameInput();
  buf: Buffer = { attack: -999, special: -999, jump: -999, shield: -999, grab: -999, taunt: -999, c: -999 };
  cdir: Vec = { x: 0, y: 0 };
  tapX: Tap = { dir: 0, age: 99 };
  tapY: Tap = { dir: 0, age: 99 };
  lastShieldPress = -999;
  shieldDir: Vec = { x: 0, y: 0 };
  staleQueue: string[] = [];
  dynHB: Hitbox[] = [];
  hitGroups = new Map<number, Set<number>>();
  pose: Pose = mergePose(BASE_POSE, null);

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  kvx = 0;
  kvy = 0;
  facing = 1;
  state = "idle";
  sf = 0;
  ground: Platform | null = null;
  jumps = 0;
  move: Move | null = null;
  mv: MoveScratch = emptyScratch();
  hitlag = 0;
  hitstun = 0;
  tumble = false;
  pendingKB: Knockback | null = null;
  shieldHP = 60;
  invincible = 0;
  ledge: Ledge | null = null;
  ledgeCooldown = 0;
  ledgeInvUsed = false;
  ledgeHang = 0;
  grabbedBy: Fighter | null = null;
  grabbing: Fighter | null = null;
  grabTimer = 0;
  lockedBy: Fighter | null = null;
  lastHitBy: Fighter | null = null;
  lastHitFrame = -9999;
  fastfall = false;
  airdodgeUsed = false;
  floatLeft = 0;
  jumpHeld = false;
  dropT = 0;
  lag = 0;
  chargeT = 0;
  poseRot = 0;
  djumpT = 0;
  drawOff: Vec = { x: 0, y: 0 };
  hurtFlash = 0;
  dizzyT = 0;
  deadT = 0;
  combo = 0;
  comboT = 0;
  beam = 0;
  chargeFlash = false;
  lcFlash = 0;
  reflecting = false;
  countering = false;
  superArmor = false;
  walkT = 0;
  noGrav = false;
  moveHit = false;
  cHold = false;
  jsqStart = 0;
  jsqDodge = false;
  jsqDir: Vec = { x: 0, y: 0 };

  constructor(game: Game, charId: string, port: number, controller: Controller, alt: boolean) {
    this.game = game;
    this.char = getCharacter(charId);
    this.charId = charId;
    this.c = alt ? this.char.alt : this.char.colors;
    this.variant = alt ? "alt" : "base";
    this.stats = this.char.stats;
    this.port = port;
    this.ctrl = controller;
    this.isCPU = controller.isCPU;
    this.reset(0, 0, 1);
  }

  reset(x: number, y: number, facing: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.kvx = 0;
    this.kvy = 0;
    this.facing = facing;
    this.state = "idle";
    this.sf = 0;
    this.ground = null;
    this.jumps = this.stats.airJumps;
    this.move = null;
    this.mv = emptyScratch();
    this.hitlag = 0;
    this.hitstun = 0;
    this.tumble = false;
    this.pendingKB = null;
    this.shieldHP = 60;
    this.invincible = 0;
    this.ledge = null;
    this.ledgeCooldown = 0;
    this.ledgeInvUsed = false;
    this.ledgeHang = 0;
    this.grabbedBy = null;
    this.grabbing = null;
    this.grabTimer = 0;
    this.fastfall = false;
    this.airdodgeUsed = false;
    this.floatLeft = this.stats.float;
    this.jumpHeld = false;
    this.dropT = 0;
    this.lag = 0;
    this.chargeT = 0;
    this.poseRot = 0;
    this.djumpT = 0;
    this.drawOff = { x: 0, y: 0 };
    this.hurtFlash = 0;
    this.dizzyT = 0;
    this.deadT = 0;
    this.combo = 0;
    this.comboT = 0;
    this.beam = 0;
    this.chargeFlash = false;
    this.lcFlash = 0;
    this.reflecting = false;
    this.countering = false;
    this.superArmor = false;
    this.walkT = 0;
  }

  // ---------- Input ----------
  readInput(): void {
    const g = this.game;
    const r = g.inputLocked ? emptyInput() : this.ctrl.read(this, g);
    const p = this.prevRaw;
    const i = this.inp;
    i.x = r.x;
    i.y = r.y;
    i.cx = r.cx;
    i.cy = r.cy;
    i.attack = r.attack;
    i.special = r.special;
    i.shield = r.shield;
    i.grab = r.grab;
    i.jump = r.jump;
    i.taunt = r.taunt;
    i.attackP = r.attack && !p.attack;
    i.specialP = r.special && !p.special;
    i.shieldP = r.shield && !p.shield;
    i.grabP = r.grab && !p.grab;
    i.jumpP = r.jump && !p.jump;
    i.tauntP = r.taunt && !p.taunt;
    const f = g.frame;
    if (i.attackP) this.buf.attack = f;
    if (i.specialP) this.buf.special = f;
    if (i.shieldP) {
      this.buf.shield = f;
      this.lastShieldPress = f;
      this.shieldDir = { x: r.x, y: r.y };
    }
    if (i.grabP) this.buf.grab = f;
    if (i.jumpP) {
      this.buf.jump = f;
      this.jumpHeld = true;
    }
    if (i.tauntP) this.buf.taunt = f;
    if (!r.jump) this.jumpHeld = false;
    // Stick taps ("smash" inputs).
    if (Math.abs(r.x) >= 0.8 && (Math.abs(p.x) < 0.5 || sgn(p.x) !== sgn(r.x))) this.tapX = { dir: sgn(r.x), age: 0 };
    else this.tapX.age += 1;
    if (Math.abs(r.y) >= 0.8 && (Math.abs(p.y) < 0.5 || sgn(p.y) !== sgn(r.y))) this.tapY = { dir: sgn(r.y), age: 0 };
    else this.tapY.age += 1;
    // C-stick.
    if ((r.cx || r.cy) && !(p.cx || p.cy)) {
      this.buf.c = f;
      this.cdir = { x: r.cx, y: r.cy };
    }
    this.prevRaw = r;
  }

  private bufferAt(k: string): number {
    const b = this.buf;
    return k === "attack" ? b.attack : k === "special" ? b.special : k === "jump" ? b.jump : k === "shield" ? b.shield : k === "grab" ? b.grab : k === "taunt" ? b.taunt : b.c;
  }

  private clearBuffer(k: string): void {
    const b = this.buf;
    if (k === "attack") b.attack = -999;
    else if (k === "special") b.special = -999;
    else if (k === "jump") b.jump = -999;
    else if (k === "shield") b.shield = -999;
    else if (k === "grab") b.grab = -999;
    else if (k === "taunt") b.taunt = -999;
    else b.c = -999;
  }

  consume(k: string): boolean {
    if (this.game.frame - this.bufferAt(k) <= BUFFER) {
      this.clearBuffer(k);
      return true;
    }
    return false;
  }

  anyPress(): boolean {
    const i = this.inp;
    return i.attackP || i.specialP || i.jumpP || i.shieldP || i.grabP || this.tapX.age === 0 || this.tapY.age === 0;
  }

  setState(s: string): void {
    const ledge = this.ledge;
    if (this.state === "ledge" && s !== "ledge" && ledge) {
      ledge.occupant = -1;
      this.ledge = null;
    }
    const held = this.grabbing;
    if (this.state === "grabbing" && s !== "pummel" && s !== "throw" && s !== "grabbing" && held) {
      this.grabbing = null;
      if (held.grabbedBy === this) {
        held.grabbedBy = null;
        if (held.state === "grabbed") held.setState("air");
      }
    }
    this.state = s;
    this.sf = 0;
    this.poseRot = 0;
    if (s !== "attack") {
      this.move = null;
      this.chargeFlash = false;
      this.beam = 0;
    }
  }

  // ---------- Main update ----------
  update(): void {
    this.readInput();
    if (this.state === "dead") return;
    if (this.invincible > 0) this.invincible -= 1;
    if (this.ledgeCooldown > 0) this.ledgeCooldown -= 1;
    if (this.hurtFlash > 0) this.hurtFlash -= 1;
    if (this.dropT > 0) this.dropT -= 1;
    if (this.djumpT > 0) this.djumpT -= 1;
    if (this.lcFlash > 0) this.lcFlash -= 1;
    if (this.comboT > 0) {
      this.comboT -= 1;
      if (this.comboT === 0) this.combo = 0;
    }
    this.drawOff.x *= 0.7;
    this.drawOff.y *= 0.7;
    if (this.state !== "shield" && this.state !== "shieldstun") this.shieldHP = Math.min(60, this.shieldHP + 0.08);

    if (this.hitlag > 0) {
      this.hitlag -= 1;
      if (this.hitlag === 0 && this.pendingKB) this.applyLaunch();
      return;
    }
    this.noGrav = false;
    this.dynHB.length = 0;
    this.reflecting = false;
    this.countering = false;
    this.superArmor = false;
    this.sf += 1;
    this.runState();
    this.physics();
  }

  private runState(): void {
    switch (this.state) {
      case "idle":
        this.st_idle();
        break;
      case "walk":
        this.st_walk();
        break;
      case "dash":
        this.st_dash();
        break;
      case "run":
        this.st_run();
        break;
      case "turn":
        this.st_turn();
        break;
      case "crouch":
        this.st_crouch();
        break;
      case "jumpsquat":
        this.st_jumpsquat();
        break;
      case "air":
        this.st_air();
        break;
      case "tumble":
        this.st_air();
        break;
      case "fall":
        this.st_fall();
        break;
      case "airdodge":
        this.st_airdodge();
        break;
      case "land":
        this.st_land();
        break;
      case "attack":
        this.st_attack();
        break;
      case "shield":
        this.st_shield();
        break;
      case "shieldstun":
        this.st_shieldstun();
        break;
      case "shielddrop":
        this.st_shielddrop();
        break;
      case "dizzy":
        this.st_dizzy();
        break;
      case "roll":
        this.st_roll();
        break;
      case "spotdodge":
        this.st_spotdodge();
        break;
      case "hitstun":
        this.st_hitstun();
        break;
      case "down":
        this.st_down();
        break;
      case "getup":
        this.st_getup();
        break;
      case "getroll":
        this.st_getroll();
        break;
      case "tech":
        this.st_tech();
        break;
      case "ledge":
        this.st_ledge();
        break;
      case "ledgeup":
        this.st_ledgeup();
        break;
      case "ledgeroll":
        this.st_ledgeroll();
        break;
      case "grabbing":
        this.st_grabbing();
        break;
      case "pummel":
        this.st_pummel();
        break;
      case "throw":
        this.st_throw();
        break;
      case "grabbed":
        this.st_grabbed();
        break;
      case "locked":
        this.st_locked();
        break;
      case "respawn":
        this.st_respawn();
        break;
    }
  }

  // ---------- Actions ----------
  groundActions(): boolean {
    if (this.consume("c")) {
      this.cstickGround();
      return true;
    }
    if (this.consume("special")) {
      this.doSpecial();
      return true;
    }
    if (this.consume("attack")) {
      this.groundAttack();
      return true;
    }
    if (this.consume("grab")) {
      this.startMove(this.state === "dash" || this.state === "run" ? "dashgrab" : "grab");
      return true;
    }
    if (this.consume("jump")) {
      this.startJumpsquat();
      return true;
    }
    if ((this.state === "idle" || this.state === "walk" || this.state === "crouch") && this.consume("taunt")) {
      this.startMove("taunt");
      return true;
    }
    if (this.inp.shield) {
      this.buf.shield = -999;
      this.setState("shield");
      sfx.shieldUp();
      return true;
    }
    return false;
  }

  airActions(): boolean {
    if (this.consume("c")) {
      this.doAerial(this.cdir.x, this.cdir.y);
      return true;
    }
    if (this.consume("special")) {
      this.doSpecial();
      return true;
    }
    if (this.consume("attack")) {
      this.doAerial(this.inp.x, this.inp.y);
      return true;
    }
    if (this.jumps > 0 && this.consume("jump")) {
      this.doubleJump();
      return true;
    }
    if (!this.airdodgeUsed && this.consume("shield")) {
      this.startAirdodge(this.shieldDir);
      return true;
    }
    return false;
  }

  // Direction of a recent stick tap held past 0.6, or null.
  smashDir(): Vec | null {
    const lim = 4;
    const tx = this.tapX.age <= lim && Math.abs(this.inp.x) > 0.6;
    const ty = this.tapY.age <= lim && Math.abs(this.inp.y) > 0.6;
    if (tx && ty) return this.tapX.age <= this.tapY.age ? { x: this.tapX.dir, y: 0 } : { x: 0, y: this.tapY.dir };
    if (tx) return { x: this.tapX.dir, y: 0 };
    if (ty) return { x: 0, y: this.tapY.dir };
    return null;
  }

  startSmash(d: Vec): void {
    if (d.y > 0) this.startMove("usmash");
    else if (d.y < 0) this.startMove("dsmash");
    else {
      this.facing = d.x;
      this.startMove("fsmash");
    }
  }

  cstickGround(): void {
    this.startSmash(this.cdir.y ? { x: 0, y: this.cdir.y } : { x: this.cdir.x, y: 0 });
    this.cHold = true;
  }

  groundAttack(): void {
    const d = this.smashDir();
    if (d && this.state !== "run") {
      this.startSmash(d);
      return;
    }
    const i = this.inp;
    if (this.state === "dash" || this.state === "run") {
      this.startMove("dashattack");
      return;
    }
    if (i.y > 0.5) this.startMove("utilt");
    else if (i.y < -0.5) this.startMove("dtilt");
    else if (Math.abs(i.x) > 0.3) {
      this.facing = sgn(i.x);
      this.startMove("ftilt");
    } else this.startMove("jab");
  }

  doAerial(x: number, y: number): void {
    let id = "nair";
    if (Math.abs(y) > 0.5 && Math.abs(y) >= Math.abs(x)) id = y > 0 ? "uair" : "dair";
    else if (Math.abs(x) > 0.5) id = x * this.facing > 0 ? "fair" : "bair";
    this.startMove(id);
  }

  doSpecial(): void {
    const i = this.inp;
    if (this.meter >= 100 && Math.abs(i.x) < 0.3 && Math.abs(i.y) < 0.3) {
      this.meter = 0;
      this.startMove("final");
      return;
    }
    if (i.y > 0.5) this.startMove("uspecial");
    else if (i.y < -0.5) this.startMove("dspecial");
    else if (Math.abs(i.x) > 0.3) {
      this.facing = sgn(i.x);
      this.startMove("sspecial");
    } else this.startMove("nspecial");
  }

  startMove(id: string): void {
    const m = this.char.moves.get(id);
    if (!m) return;
    this.setState("attack");
    this.move = m;
    this.mv = emptyScratch();
    this.hitGroups = new Map<number, Set<number>>();
    this.chargeT = 0;
    this.cHold = false;
    this.moveHit = false;
    if (m.aerial) this.game.stat(this, "aerial");
  }

  endMove(): void {
    const m = this.move;
    if (this.ground) this.setState("idle");
    else this.setState(m && m.helplessAir ? "fall" : "air");
  }

  startJumpsquat(): void {
    this.setState("jumpsquat");
    this.jsqStart = this.game.frame;
    this.jsqDodge = false;
  }

  doJump(full: boolean): void {
    const s = this.stats;
    this.ground = null;
    this.y -= 1;
    this.vy = -(full ? s.jump : s.shortHop);
    this.vx = clamp(this.vx * 0.85 + this.inp.x * 1.8, -s.jumpMaxVX, s.jumpMaxVX);
    this.fastfall = false;
    this.setState("air");
    sfx.jump();
    this.game.fx.dust(this.x, this.y, 0, 4);
    if (!full) this.game.callout(this, "short hop", "#9ff", true);
    if (this.jsqDodge) this.startAirdodge(this.jsqDir);
  }

  doubleJump(): void {
    this.jumps -= 1;
    this.vy = -this.stats.djump;
    this.vx = this.inp.x * this.stats.airSpeed;
    this.fastfall = false;
    this.setState("air");
    this.djumpT = 18;
    sfx.djump();
    this.game.fx.shockwave(this.x, this.y, this.c.glow, 40);
  }

  startAirdodge(dir: Vec): void {
    this.airdodgeUsed = true;
    this.setState("airdodge");
    let dx = this.inp.x;
    let dy = this.inp.y;
    if (Math.hypot(dx, dy) < 0.3) {
      dx = dir.x;
      dy = dir.y;
    }
    const m = Math.hypot(dx, dy);
    if (m > 0.3) {
      this.mv.dir = 1;
      this.vx = (dx / m) * this.stats.airdodge;
      this.vy = -(dy / m) * this.stats.airdodge;
    } else {
      this.mv.dir = 0;
      this.vx *= 0.3;
      this.vy = Math.min(this.vy, 0) * 0.3;
    }
    this.fastfall = false;
    sfx.airdodge();
    this.game.fx.afterimage(this);
  }

  airDrift(mult: number): void {
    const s = this.stats;
    const x = this.inp.x;
    const target = x * s.airSpeed;
    if (Math.abs(x) > 0.2) {
      if ((target > 0 && this.vx < target) || (target < 0 && this.vx > target)) this.vx = approach(this.vx, target, s.airAccel * mult);
      else if (Math.abs(this.vx) > s.airSpeed) this.vx = approach(this.vx, sgn(this.vx) * s.airSpeed, s.airFriction);
    } else this.vx = approach(this.vx, 0, s.airFriction);
  }

  checkFastfall(): void {
    if (!this.fastfall && this.vy > -1.5 && this.tapY.age === 0 && this.tapY.dir < 0) {
      this.fastfall = true;
      this.vy = this.stats.fastFall;
      sfx.fastfall();
      this.game.fx.sparkle(this.x, this.y - 130, "#fff");
    }
  }

  checkFloat(): boolean {
    if (this.stats.float && this.jumpHeld && !this.fastfall && this.vy >= 0 && this.floatLeft > 0 && !this.ground) {
      this.vy = 0;
      this.noGrav = true;
      this.floatLeft -= 1;
      if (this.game.frame % 4 === 0) this.game.fx.sparkle(this.x + rand(-20, 20), this.y + 4, this.c.accent);
      return true;
    }
    return false;
  }

  // ---------- States ----------
  st_idle(): void {
    this.vx = approach(this.vx, 0, this.stats.traction);
    if (this.groundActions()) return;
    const i = this.inp;
    if (i.y < -0.6) {
      const ground = this.ground;
      if (ground && ground.soft && this.tapY.age <= 2) {
        this.dropThrough();
        return;
      }
      this.setState("crouch");
      return;
    }
    if (Math.abs(i.x) > 0.3) {
      if (this.tapX.age <= 3 && this.tapX.dir === sgn(i.x)) this.startDash(sgn(i.x));
      else {
        this.setState("walk");
        this.walkT = 0;
      }
    }
  }

  st_walk(): void {
    const i = this.inp;
    const s = this.stats;
    if (this.groundActions()) return;
    if (Math.abs(i.x) < 0.3) {
      this.setState("idle");
      return;
    }
    if (i.y < -0.6) {
      this.setState("crouch");
      return;
    }
    this.facing = sgn(i.x);
    this.vx = approach(this.vx, s.walk * i.x, 0.6);
    if (Math.abs(i.x) > 0.9) this.walkT += 1;
    else this.walkT = 0;
    if ((this.tapX.age <= 2 && this.tapX.dir === sgn(i.x)) || this.walkT > 8) this.startDash(sgn(i.x));
  }

  startDash(dir: number): void {
    this.facing = dir;
    this.setState("dash");
    this.vx = dir * this.stats.dashInit;
    this.game.fx.dust(this.x - dir * 10, this.y, -dir, 4);
    sfx.dash();
  }

  st_dash(): void {
    const i = this.inp;
    const s = this.stats;
    this.vx = approach(this.vx, this.facing * s.dash, 1.2);
    if (this.groundActions()) return;
    if (i.x * this.facing < -0.5) {
      this.startDash(-this.facing);
      this.game.stat(this, "dashdance");
      return;
    }
    if (i.y < -0.6) {
      this.setState("crouch");
      return;
    }
    if (this.sf >= s.dashFrames) this.setState(i.x * this.facing > 0.5 ? "run" : "idle");
  }

  st_run(): void {
    const i = this.inp;
    const s = this.stats;
    this.vx = approach(this.vx, this.facing * s.run, 0.8);
    if (this.game.frame % 9 === 0) this.game.fx.dust(this.x - this.facing * 14, this.y, -this.facing, 1);
    if (this.groundActions()) return;
    if (i.x * this.facing < -0.5) {
      this.setState("turn");
      return;
    }
    if (i.y < -0.6) {
      this.setState("crouch");
      return;
    }
    if (Math.abs(i.x) < 0.3) this.setState("idle");
  }

  st_turn(): void {
    this.vx = approach(this.vx, 0, this.stats.traction * 1.3);
    if (this.consume("jump")) {
      this.facing *= -1;
      this.startJumpsquat();
      return;
    }
    if (this.sf >= 10) {
      this.facing *= -1;
      this.setState(this.inp.x * this.facing > 0.5 ? "run" : "idle");
    }
  }

  st_crouch(): void {
    this.vx = approach(this.vx, 0, this.stats.traction);
    if (this.groundActions()) return;
    if (this.inp.y > -0.5) this.setState("idle");
  }

  dropThrough(): void {
    this.ground = null;
    this.dropT = 12;
    this.y += 2;
    this.vy = 1;
    this.setState("air");
  }

  st_jumpsquat(): void {
    if (this.buf.shield > this.jsqStart - 1 && this.consume("shield")) {
      this.jsqDodge = true;
      this.jsqDir = { x: this.inp.x, y: this.inp.y };
    }
    if (this.jsqDodge && (this.inp.x || this.inp.y)) this.jsqDir = { x: this.inp.x, y: this.inp.y };
    if (this.consume("grab")) {
      this.startMove("grab");
      return;
    }
    if (this.inp.y > 0.5 && this.consume("attack")) {
      this.startMove("usmash");
      return;
    }
    if (this.inp.y > 0.5 && this.consume("special")) {
      this.startMove("uspecial");
      return;
    }
    if (this.sf >= this.stats.jumpsquat) this.doJump(this.inp.jump);
  }

  st_air(): void {
    this.airDrift(1);
    this.checkFastfall();
    this.checkFloat();
    this.airActions();
  }

  st_fall(): void {
    this.airDrift(0.6);
    this.checkFastfall();
  }

  st_airdodge(): void {
    const dir = this.mv.dir !== 0;
    this.noGrav = dir ? this.sf < 24 : this.sf < 10;
    if (dir) {
      this.vx *= 0.91;
      this.vy *= 0.91;
    }
    if (this.sf % 3 === 0 && this.sf < 18) this.game.fx.afterimage(this);
    if (this.sf >= 30) this.setState(dir ? "fall" : "air");
  }

  st_land(): void {
    this.vx = approach(this.vx, 0, this.stats.traction * (this.mv.wd ? 0.85 : 1));
    if (this.mv.wd && Math.abs(this.vx) > 3 && this.game.frame % 2 === 0) this.game.fx.dust(this.x, this.y, -sgn(this.vx), 1);
    if (this.sf >= this.lag) {
      this.setState("idle");
      this.st_idle();
    }
  }

  st_attack(): void {
    const m = this.move;
    const g = this.game;
    if (!m) {
      this.endMove();
      return;
    }
    // Smash charge.
    if (m.charge && this.sf === m.charge && (this.inp.attack || (this.cHold && (this.inp.cx || this.inp.cy))) && this.chargeT < 60) {
      this.chargeT += 1;
      this.sf -= 1;
      this.chargeFlash = true;
      if (this.chargeT === 1) sfx.charge();
      if (this.ground) this.vx = approach(this.vx, 0, this.stats.traction);
      return;
    }
    this.chargeFlash = false;
    if (this.ground) {
      if (!m.slideOff || !m.update) this.vx = approach(this.vx, 0, this.stats.traction);
    } else {
      this.airDrift(m.special ? 0.5 : 1);
      if (m.aerial) {
        this.checkFastfall();
        this.checkFloat();
      }
    }
    if (this.sf === m.as && !m.special) {
      if (m.smash) sfx.heavyWhiff();
      else sfx.whiff();
    }
    // Spawned by the simulation, once: from draw() it repeated per drawn frame and differed between netplay peers.
    if (this.sf === m.as && this.charId === "anthony" && m.id === "fsmash") g.fx.text(this.x + this.facing * 90, this.y - 140, "¡PUM!", "#ffd23f", 26, { life: 30, max: 30 });
    const update = m.update;
    if (update) {
      update(this, this.sf, g);
      if (this.state !== "attack" || this.move !== m) return;
    }
    if (m.next !== "" && this.sf >= m.nextWin[0] && this.sf <= m.nextWin[1] && this.consume("attack")) {
      this.startMove(m.next);
      return;
    }
    if (m.iasa && this.sf >= m.iasa) {
      if (this.ground ? this.groundActions() : this.airActions()) return;
    }
    if (this.sf >= m.frames) this.endMove();
  }

  st_shield(): void {
    this.vx = approach(this.vx, 0, this.stats.traction);
    this.shieldHP -= 0.13;
    if (this.shieldHP <= 0) {
      this.shieldBreak();
      return;
    }
    const i = this.inp;
    if (this.consume("jump") || (TAP_JUMP[this.port] && this.tapY.age === 0 && this.tapY.dir > 0)) {
      this.startJumpsquat();
      return;
    }
    if (i.y > 0.5 && this.consume("special")) {
      this.startMove("uspecial");
      return;
    }
    if (this.consume("attack") || this.consume("grab")) {
      this.startMove("grab");
      return;
    }
    if (this.tapX.age <= 1 && Math.abs(i.x) > 0.7) {
      this.startRoll(sgn(i.x));
      return;
    }
    if (this.tapY.age <= 1 && i.y < -0.7) {
      const ground = this.ground;
      if (ground && ground.soft) {
        this.dropThrough();
        return;
      }
      this.setState("spotdodge");
      sfx.airdodge();
      return;
    }
    if (!i.shield) this.setState("shielddrop");
  }

  st_shieldstun(): void {
    this.vx = approach(this.vx, 0, this.stats.traction);
    if (this.sf >= this.lag) this.setState(this.inp.shield ? "shield" : "shielddrop");
  }

  st_shielddrop(): void {
    this.vx = approach(this.vx, 0, this.stats.traction);
    if (this.sf >= 7) this.setState("idle");
  }

  shieldBreak(): void {
    this.shieldHP = 30;
    this.setState("dizzy");
    this.dizzyT = 200;
    this.ground = null;
    this.vy = -16;
    this.y -= 2;
    sfx.shieldBreak();
    this.game.fx.spark(this.x, this.y - 60, 2.5, this.c.main);
    this.game.fx.text(this.x, this.y - 170 * SZ, "¡ESCUDO ROTO!", "#ff5", 30, {});
    this.game.shake(10);
  }

  st_dizzy(): void {
    if (this.ground) {
      this.vx = approach(this.vx, 0, this.stats.traction);
      this.dizzyT -= this.anyPress() ? 6 : 1;
      if (this.dizzyT <= 0) this.setState("idle");
    }
  }

  startRoll(dir: number): void {
    this.setState("roll");
    this.mv.dir = dir;
    sfx.roll();
  }

  st_roll(): void {
    const dir = this.mv.dir;
    this.vx = this.sf >= 3 && this.sf <= 18 ? dir * 7 : approach(this.vx, 0, 1);
    if (this.sf >= 26) {
      if (dir === this.facing) this.facing *= -1;
      this.setState(this.inp.shield ? "shield" : "idle");
    }
  }

  st_spotdodge(): void {
    this.vx = approach(this.vx, 0, 1);
    if (this.sf >= 22) this.setState(this.inp.shield ? "shield" : "idle");
  }

  st_hitstun(): void {
    if (!this.ground) this.airDrift(0.2);
    else this.vx = approach(this.vx, 0, this.stats.traction);
    this.hitstun -= 1;
    if (this.hitstun <= 0) {
      if (this.ground) this.setState("idle");
      else this.setState(this.tumble ? "tumble" : "air");
    }
  }

  st_down(): void {
    this.vx = approach(this.vx, 0, this.stats.traction);
    this.kvx = approach(this.kvx, 0, 0.8);
    if (this.sf < 14) return;
    const i = this.inp;
    if (this.consume("attack")) {
      this.startMove("getupattack");
      return;
    }
    if (Math.abs(i.x) > 0.6) {
      this.setState("getroll");
      this.mv.dir = sgn(i.x);
      sfx.roll();
      return;
    }
    if (i.y > 0.5 || this.consume("jump") || this.consume("shield") || this.sf > 100) this.setState("getup");
  }

  st_getup(): void {
    this.vx = 0;
    if (this.sf >= 28) this.setState("idle");
  }

  st_getroll(): void {
    this.vx = this.sf >= 4 && this.sf <= 24 ? this.mv.dir * 6 : 0;
    if (this.sf >= 34) {
      this.facing = -this.mv.dir;
      this.setState("idle");
    }
  }

  st_tech(): void {
    const d = this.mv.dir;
    this.vx = d && this.sf >= 2 && this.sf <= 20 ? d * 6.5 : approach(this.vx, 0, 1);
    if (this.sf >= 26) this.setState("idle");
  }

  st_ledge(): void {
    const L = this.ledge;
    if (!L) {
      this.setState("air");
      return;
    }
    this.noGrav = true;
    this.vx = 0;
    this.vy = 0;
    this.kvx = 0;
    this.kvy = 0;
    this.x = L.x + L.side * 24 * SZ;
    this.y = L.y + 88 * SZ;
    this.ledgeHang += 1;
    if (this.ledgeHang > 360) {
      this.ledgeDrop();
      return;
    }
    if (this.sf < 8) return;
    const i = this.inp;
    if (this.consume("jump") || (this.tapY.age <= 1 && i.y > 0.7)) {
      this.setState("air");
      this.x = L.x + L.side * 6;
      this.y = L.y - 4;
      this.vy = -this.stats.jump * 0.95;
      this.vx = -L.side * 2.5;
      this.ledgeCooldown = 20;
      sfx.jump();
      return;
    }
    if (this.consume("attack")) {
      this.climb(L);
      this.startMove("ledgeattack");
      return;
    }
    if (this.consume("shield")) {
      this.climb(L);
      this.setState("ledgeroll");
      this.mv.dir = -L.side;
      return;
    }
    if (i.x * -L.side > 0.6 || (i.y > 0.6 && this.tapY.age > 1)) {
      this.climb(L);
      this.setState("ledgeup");
      return;
    }
    if (i.y < -0.6 || i.x * L.side > 0.6) this.ledgeDrop();
  }

  ledgeDrop(): void {
    const L = this.ledge;
    this.setState("air");
    if (L) this.x = L.x + L.side * 30;
    this.vy = 1;
    this.ledgeCooldown = 30;
  }

  climb(L: Ledge): void {
    const ox = this.x;
    const oy = this.y;
    this.setState("idle");
    this.x = L.x - L.side * 28;
    this.y = L.y;
    this.ground = this.game.stage.main;
    this.facing = -L.side;
    this.drawOff = { x: ox - this.x, y: oy - this.y };
  }

  st_ledgeup(): void {
    this.vx = 0;
    if (this.sf >= 30) this.setState("idle");
  }

  st_ledgeroll(): void {
    this.vx = this.sf >= 8 && this.sf <= 30 ? this.mv.dir * 5.5 : 0;
    if (this.sf >= 38) this.setState("idle");
  }

  grabLedge(L: Ledge): void {
    this.setState("ledge");
    this.ledge = L;
    L.occupant = this.port;
    this.ledgeHang = 0;
    this.facing = -L.side;
    this.x = L.x + L.side * 24 * SZ;
    this.y = L.y + 88 * SZ;
    this.vx = 0;
    this.vy = 0;
    this.kvx = 0;
    this.kvy = 0;
    this.jumps = this.stats.airJumps;
    this.airdodgeUsed = false;
    this.fastfall = false;
    this.floatLeft = this.stats.float;
    if (!this.ledgeInvUsed) {
      this.invincible = Math.max(this.invincible, 34);
      this.ledgeInvUsed = true;
    }
    sfx.ledge();
  }

  st_grabbing(): void {
    const t = this.grabbing;
    this.vx = approach(this.vx, 0, this.stats.traction);
    if (!t || t.grabbedBy !== this) {
      this.grabbing = null;
      this.setState("idle");
      return;
    }
    this.holdVictim(t);
    if (t.grabTimer <= 0) {
      this.game.grabRelease(this, t);
      return;
    }
    if (this.sf < 6) return;
    const i = this.inp;
    let dir = "";
    if (this.consume("c")) dir = this.cdir.y ? (this.cdir.y > 0 ? "u" : "d") : this.cdir.x * this.facing > 0 ? "f" : "b";
    else if (Math.abs(i.x) > 0.6) dir = i.x * this.facing > 0 ? "f" : "b";
    else if (Math.abs(i.y) > 0.6) dir = i.y > 0 ? "u" : "d";
    if (dir !== "") {
      this.setState("throw");
      this.mv.throwDir = dir;
      this.grabbing = t;
      return;
    }
    if (this.consume("attack") || this.consume("grab")) {
      this.setState("pummel");
      this.grabbing = t;
    }
  }

  holdVictim(t: Fighter): void {
    t.x = this.x + this.facing * 48 * SZ;
    t.y = this.y;
    t.vx = 0;
    t.vy = 0;
    t.kvx = 0;
    t.kvy = 0;
    t.facing = -this.facing;
    t.ground = this.ground;
  }

  st_pummel(): void {
    const t = this.grabbing;
    if (!t) {
      this.setState("idle");
      return;
    }
    this.holdVictim(t);
    if (this.sf === 6) {
      t.percent += 2;
      t.hurtFlash = 6;
      t.hitlag = 5;
      this.hitlag = 5;
      this.game.fx.spark(t.x, t.y - 60, 0.6, this.c.glow);
      sfx.hit(0.5, "");
      this.game.addDamage(this, t, 2);
    }
    if (this.sf >= 18) {
      this.setState("grabbing");
      this.grabbing = t;
      this.sf = 6;
    }
  }

  private throwFor(dir: string): Throw {
    const th = this.char.throws;
    return dir === "b" ? th.b : dir === "u" ? th.u : dir === "d" ? th.d : th.f;
  }

  st_throw(): void {
    const t = this.grabbing;
    const dir = this.mv.throwDir;
    if (!t) {
      this.setState("idle");
      return;
    }
    if (this.sf < 12) {
      if (dir === "b" && this.sf === 6) this.facing *= -1;
      this.holdVictim(t);
      if (dir === "u") t.y = this.y - this.sf * 5;
      if (dir === "d") t.x = this.x + this.facing * 30;
    }
    if (this.sf === 12) {
      const th = this.throwFor(dir);
      this.grabbing = null;
      t.grabbedBy = null;
      t.setState("air");
      sfx.throw();
      const hb = H(0, 0, 0, 0, 0, th.d, dir === "b" ? 180 - th.a : th.a, th.b, th.k, { unblockable: true });
      this.game.resolveHit(this, t, hb, this.x, this.facing, null, true);
    }
    if (this.sf >= 30) this.setState("idle");
  }

  st_grabbed(): void {
    if (!this.grabbedBy) {
      this.setState("air");
      return;
    }
    this.grabTimer -= 1 + (this.anyPress() ? 5 : 0);
  }

  st_locked(): void {
    const by = this.lockedBy;
    const move = by ? by.move : null;
    if (!by || by.state !== "attack" || !move || !move.final) {
      this.lockedBy = null;
      this.setState("air");
    }
  }

  st_respawn(): void {
    this.noGrav = true;
    this.vx = 0;
    this.vy = 0;
    const i = this.inp;
    if (this.sf > 30 && (Math.abs(i.x) > 0.5 || i.y < -0.5 || i.jumpP || i.attackP || i.specialP || this.sf > 300)) {
      this.setState("air");
      this.ground = null;
    }
  }

  // ---------- Physics ----------
  canSlideOff(): boolean {
    const s = this.state;
    if (SLIDE_STATES.has(s)) return s !== "tech";
    const move = this.move;
    return s === "attack" && !!move && move.slideOff;
  }

  decayKB(): void {
    const s = Math.hypot(this.kvx, this.kvy);
    if (s > 0) {
      const ns = Math.max(0, s - KB_DECAY);
      this.kvx *= ns / s;
      this.kvy *= ns / s;
    }
  }

  physics(): void {
    const st = this.game.stage;
    if (NO_PHYSICS_STATES.has(this.state)) return;
    const ground = this.ground;
    if (ground) {
      this.x += this.vx + this.kvx;
      this.decayKB();
      this.y = ground.y;
      if (this.kvy < -0.5) {
        this.ground = null;
      } else if (this.x < ground.x1 || this.x > ground.x2) {
        if (this.canSlideOff()) {
          this.ground = null;
          if (FALL_OFF_STATES.has(this.state)) this.setState("air");
          if (this.state === "down") this.setState("air");
        } else {
          this.x = clamp(this.x, ground.x1, ground.x2);
          if (this.state === "hitstun" || this.state === "shieldstun") this.kvx = 0;
        }
      }
      if (this.ground) return;
    }
    // Airborne.
    if (!this.noGrav) {
      if (this.fastfall) this.vy = this.stats.fastFall;
      else this.vy = Math.min(this.vy + this.stats.gravity, this.stats.maxFall);
    }
    const px = this.x;
    const py = this.y;
    this.x += this.vx + this.kvx;
    this.y += this.vy + this.kvy;
    this.decayKB();
    const movingDown = this.y - py >= 0;
    if (movingDown) {
      for (const p of st.platforms) {
        if (p.soft && this.dropT > 0) continue;
        if (py <= p.y - p.dy + 0.5 && this.y >= p.y && this.x >= p.x1 - 3 && this.x <= p.x2 + 3) {
          this.y = p.y;
          this.x = clamp(this.x, p.x1, p.x2);
          this.land(p);
          return;
        }
      }
    }
    // Solid main block.
    const m = st.main;
    const hw = 18;
    const hh = 96;
    if (this.x + hw > m.x1 && this.x - hw < m.x2 && this.y > m.y && this.y - hh < m.bottom) {
      if (px + hw <= m.x1 + 1) {
        this.x = m.x1 - hw;
        this.hitWall(-1);
      } else if (px - hw >= m.x2 - 1) {
        this.x = m.x2 + hw;
        this.hitWall(1);
      } else if (py - hh >= m.bottom - 2) {
        this.y = m.bottom + hh;
        this.vy = Math.max(this.vy, 0);
        this.kvy = Math.max(this.kvy, 0) * 0.3;
      } else {
        this.y = m.y;
        this.land(m);
        return;
      }
    }
    // Ledges.
    if (this.canGrabLedge()) {
      for (const L of st.ledges) {
        if (L.occupant >= 0 && L.occupant !== this.port) continue;
        const hx = L.x + L.side * 24 * SZ;
        if (Math.abs(this.x - hx) < 38 && this.y - L.y > 26 && this.y - L.y < 150 * SZ) {
          this.grabLedge(L);
          break;
        }
      }
    }
  }

  canGrabLedge(): boolean {
    if (this.ledgeCooldown > 0) return false;
    const s = this.state;
    const falling = this.vy + this.kvy >= 0;
    if ((s === "air" || s === "tumble" || s === "fall") && falling && this.inp.y > -0.6) return true;
    const move = this.move;
    return s === "attack" && !!move && move.ledgeFrom > 0 && this.sf >= move.ledgeFrom;
  }

  hitWall(side: number): void {
    const g = this.game;
    if ((this.state === "hitstun" || this.state === "tumble") && Math.abs(this.kvx) > 3) {
      if (g.frame - this.lastShieldPress <= TECH_WIN) {
        this.kvx = 0;
        this.kvy = 0;
        this.vx = side * 2;
        this.vy = -4;
        this.setState("air");
        this.invincible = Math.max(this.invincible, 12);
        g.callout(this, "WALL TECH!", "#7cf6ff", false);
        sfx.tech();
        this.record.techs += 1;
        return;
      }
      this.kvx *= -0.6;
      g.fx.dust(this.x, this.y - 50, side, 6);
      g.shake(4);
    } else {
      this.kvx = 0;
      if (sgn(this.vx) === -side) this.vx = 0;
    }
  }

  land(p: Platform): void {
    const g = this.game;
    const prev = this.state;
    const m = this.move;
    const impact = this.kvy + this.vy;
    this.ground = p;
    this.vy = 0;
    this.kvy = 0;
    this.jumps = this.stats.airJumps;
    this.airdodgeUsed = false;
    this.fastfall = false;
    this.floatLeft = this.stats.float;
    this.ledgeInvUsed = false;
    if (prev === "attack" && m) {
      if (m.aerial) {
        let lag = m.landLag;
        this.record.lcTotal += 1;
        if (g.frame - this.lastShieldPress <= LCANCEL_WIN) {
          lag = Math.ceil(lag / 2);
          this.record.lcOk += 1;
          this.lcFlash = 10;
          g.callout(this, "L-CANCEL", "#fff", true);
          sfx.lcancel();
        }
        this.toLand(lag);
      } else if (m.special) {
        if (m.landKeep || m.final || m.id === "dspecial" || m.id === "counterHit" || (m.id === "nspecial" && this.charId === "anthony")) return;
        this.toLand(m.landLag || 8);
      }
      return;
    }
    switch (prev) {
      case "airdodge": {
        this.toLand(10);
        if (Math.abs(this.vx) > 2.5) {
          this.mv.wd = true;
          this.record.wavedash += 1;
          g.callout(this, Math.abs(this.vx) > 5 ? "WAVEDASH" : "WAVELAND", "#7cf6ff", true);
          sfx.wavedash();
          g.fx.dust(this.x, this.y, -sgn(this.vx), 8);
        }
        break;
      }
      case "fall":
        this.toLand(14);
        break;
      case "hitstun":
      case "tumble": {
        if (this.tumble || prev === "tumble") {
          if (g.frame - this.lastShieldPress <= TECH_WIN) {
            this.setState("tech");
            this.mv.dir = Math.abs(this.inp.x) > 0.5 ? sgn(this.inp.x) : 0;
            this.kvx = 0;
            this.vx = 0;
            this.record.techs += 1;
            g.callout(this, this.mv.dir ? "TECH ROLL!" : "TECH!", "#7cf6ff", false);
            sfx.tech();
          } else {
            if (impact > 9 && prev === "hitstun") {
              // Bounce off the floor.
              this.ground = null;
              this.kvy = -impact * 0.45;
              this.y -= 2;
              g.fx.dust(this.x, this.y, 0, 10);
              g.shake(5);
              return;
            }
            this.setState("down");
            this.kvx *= 0.5;
            g.fx.dust(this.x, this.y, 0, 8);
            sfx.land();
          }
        }
        break;
      }
      case "dizzy":
        break;
      case "respawn":
        break;
      default:
        this.toLand(4);
        sfx.land();
        g.fx.dust(this.x, this.y, 0, 3);
    }
  }

  toLand(lag: number): void {
    this.setState("land");
    this.lag = lag;
  }

  // ---------- Hits ----------
  isIntangible(): boolean {
    if (this.invincible > 0) return true;
    const f = this.sf;
    switch (this.state) {
      case "airdodge":
        return f >= 3 && f <= (this.mv.dir ? 22 : 26);
      case "roll":
        return f >= 3 && f <= 18;
      case "spotdodge":
        return f >= 2 && f <= 16;
      case "tech":
        return f <= 20;
      case "getup":
      case "getroll":
      case "ledgeup":
        return true;
      case "ledgeroll":
        return f <= 30;
      case "respawn":
      case "dead":
        return true;
      case "attack": {
        const m = this.move;
        return !!m && m.intangible.length === 2 && f >= m.intangible[0] && f <= m.intangible[1];
      }
    }
    return false;
  }

  hurtbox(): Rect {
    if (this.state === "down") return { x: this.x - 55 * SZ, y: this.y - 36 * SZ, w: 110 * SZ, h: 36 * SZ };
    const move = this.move;
    const crouch =
      this.state === "crouch" || (this.state === "attack" && !!move && move.crouchMove) || (this.state === "land" && this.lag > 6);
    const h = crouch ? CROUCH_H : HURT_H;
    return { x: this.x - HURT_W / 2, y: this.y - h, w: HURT_W, h };
  }

  activeHitboxes(): Hitbox[] {
    const out: Hitbox[] = [];
    if (this.hitlag > 0 && this.dynHB.length === 0 && this.state !== "attack") return out;
    const move = this.move;
    if (this.state === "attack" && move) {
      for (const h of move.hitboxes) if (this.sf >= h.s && this.sf <= h.e) out.push(h);
    }
    for (const h of this.dynHB) out.push(h);
    return out;
  }

  staleMul(id: string): number {
    let n = 0;
    for (const queued of this.staleQueue) if (queued === id) n += 1;
    return Math.max(0.55, 1 - n * 0.06);
  }

  pushStale(id: string): void {
    this.staleQueue.push(id);
    if (this.staleQueue.length > 9) this.staleQueue.shift();
  }

  applyLaunch(): void {
    const kb = this.pendingKB;
    this.pendingKB = null;
    if (!kb) return;
    let a = kb.ang * DEG;
    // DI: stick perpendicular to the trajectory bends it up to 18 degrees.
    const sx = this.inp.x;
    const sy = this.inp.y;
    if (kb.speed > 3 && (sx || sy)) {
      const m = Math.hypot(sx, sy) || 1;
      const px = -Math.sin(a);
      const py = Math.cos(a);
      const dot = (sx / m) * px + (sy / m) * py;
      a += dot * 18 * DEG;
      if (Math.abs(dot) > 0.5 && kb.speed > 10) this.game.callout(this, "DI", "#ccc", true);
    }
    this.kvx = Math.cos(a) * kb.speed;
    this.kvy = -Math.sin(a) * kb.speed;
    this.vx = 0;
    this.vy = 0;
    if (this.ground) {
      if (this.kvy < -1) {
        this.ground = null;
        this.y -= 1;
      } else if (this.kvy > 0.5) {
        if (this.tumble) {
          this.kvy = -this.kvy * 0.8;
          this.ground = null;
          this.y -= 1;
          this.game.fx.dust(this.x, this.y, 0, 8);
        } else this.kvy = 0;
      }
    }
  }

  // ---------- Drawing ----------
  getPose(): Pose {
    const t = this.game.frame;
    const s = this.state;
    const sf = this.sf;
    const cycle = (spd: number, amp: number, lean: number): Pose => {
      const ph = t * spd;
      const k1 = Math.sin(ph);
      const k2 = Math.sin(ph + Math.PI);
      return mergePose(BASE_POSE, {
        lean,
        legF: [k1 * amp, -Math.max(0, Math.cos(ph)) * amp * 1.4 - 10],
        legB: [k2 * amp, -Math.max(0, -Math.cos(ph)) * amp * 1.4 - 10],
        armF: [-k1 * amp * 0.9 + 10, 60],
        armB: [-k2 * amp * 0.9 + 10, 60],
        yOff: -Math.abs(Math.cos(ph)) * 3,
      });
    };
    let p: Pose;
    switch (s) {
      case "idle":
      case "respawn":
        p = mergePose(BASE_POSE, { lean: 4 + Math.sin(t * 0.07) * 2, crouch: 1 + Math.sin(t * 0.07) * 1.5, armF: [22 + Math.sin(t * 0.07) * 4, 40] });
        break;
      case "walk":
        p = cycle(0.2, 28, 6);
        break;
      case "dash":
      case "run":
        p = cycle(0.34, 55, 20);
        break;
      case "turn":
        p = mergePose(BASE_POSE, { lean: -20, legF: [50, -20], legB: [-30, -10], armF: [-40, 30], armB: [60, 30] });
        break;
      case "crouch":
        p = mergePose(BASE_POSE, { crouch: 16, lean: 25, legF: [80, -130], legB: [40, -120], armF: [50, 60], armB: [30, 60] });
        break;
      case "jumpsquat":
        p = mergePose(BASE_POSE, { crouch: 12, lean: 15, legF: [50, -90], legB: [20, -80] });
        break;
      case "land":
        p = mergePose(BASE_POSE, { crouch: this.lag > 6 ? 14 : 8, lean: 14, legF: [50, -90], legB: [20, -80], armF: [40, 30], armB: [-40, 30] });
        break;
      case "air":
      case "fall": {
        const rising = this.vy < 0;
        p = mergePose(
          BASE_POSE,
          rising
            ? { legF: [60, -100], legB: [10, -60], armF: [140, 30], armB: [-30, 40], lean: 0 }
            : { legF: [20, -30], legB: [-15, -20], armF: [110, 20], armB: [-110, 20], lean: -4 },
        );
        if (this.djumpT > 0) p.rot = (18 - this.djumpT) * 20;
        if (s === "fall") {
          p.armF = [170, 10];
          p.armB = [-170, 10];
          p.lean = -10;
        }
        break;
      }
      case "hitstun":
      case "tumble":
      case "grabbed":
      case "locked":
        p = mergePose(BASE_POSE, { lean: -25, armF: [150 + Math.sin(t * 0.5) * 20, 20], armB: [-150, 20], legF: [40, -30], legB: [-20, -20], headTilt: 20 });
        if (s === "tumble" || (s === "hitstun" && this.tumble && !this.ground)) p.rot = -t * 18;
        break;
      case "shield":
      case "shieldstun":
      case "shielddrop":
        p = mergePose(BASE_POSE, { crouch: 8, lean: 10, armF: [120, 110], armB: [100, 110], legF: [30, -40], legB: [-25, -20] });
        break;
      case "airdodge":
      case "spotdodge":
        p = mergePose(BASE_POSE, { crouch: 10, legF: [80, -140], legB: [60, -140], armF: [60, 100], armB: [40, 100], lean: 20 });
        break;
      case "roll":
      case "getroll":
      case "ledgeroll":
        p = mergePose(BASE_POSE, {
          crouch: 20,
          legF: [100, -150],
          legB: [80, -150],
          armF: [60, 110],
          armB: [40, 110],
          lean: 30,
          rot: (this.mv.dir || 1) * this.facing * sf * 16,
          yOff: -6,
        });
        break;
      case "tech":
        p = mergePose(BASE_POSE, { crouch: 18, legF: [100, -150], legB: [80, -150], armF: [60, 110], lean: 30, rot: this.mv.dir ? this.mv.dir * this.facing * sf * 15 : 0 });
        break;
      case "down":
        p = mergePose(BASE_POSE, { rot: -90, yOff: 40, armF: [100, 10], armB: [80, 10], legF: [5, 0], legB: [-5, 0] });
        break;
      case "getup":
      case "ledgeup":
        p = lerpPose(mergePose(BASE_POSE, { crouch: 20, lean: 40 }), BASE_POSE, sf / 28);
        break;
      case "ledge":
        p = mergePose(BASE_POSE, { armF: [175, 0], armB: [170, 0], legF: [10, -20], legB: [-10, -10], lean: 12, yOff: 0 });
        break;
      case "grabbing":
      case "pummel": {
        p = mergePose(BASE_POSE, { armF: [92, 0], armB: [80, 10], lean: 10, crouch: 4 });
        if (s === "pummel" && sf >= 4 && sf <= 8) {
          p.armB = [95, 0];
          p.lean = 16;
        }
        break;
      }
      case "throw": {
        const d = this.mv.throwDir;
        const target: PoseOverride =
          d === "b"
            ? { armF: [-80, 0], armB: [-90, 0], lean: -20 }
            : d === "u"
              ? { armF: [175, 0], armB: [170, 0], lean: -10 }
              : d === "d"
                ? { armF: [40, 0], armB: [40, 0], lean: 35, crouch: 12 }
                : { armF: [100, 0], armB: [90, 0], lean: 25 };
        p = lerpPose(mergePose(BASE_POSE, { armF: [92, 0], armB: [80, 10] }), mergePose(BASE_POSE, target), clamp(sf / 12, 0, 1));
        break;
      }
      case "dizzy":
        p = mergePose(BASE_POSE, { lean: Math.sin(t * 0.1) * 18, armF: [30, 60], armB: [-30, 60], headTilt: Math.sin(t * 0.1) * 20 });
        break;
      case "attack":
        p = this.movePose();
        break;
      default:
        p = mergePose(BASE_POSE, null);
    }
    if (this.poseRot) p.rot += this.poseRot;
    const frame = spriteFrame(this);
    p.sprAnim = frame.anim;
    p.sprIndex = frame.i;
    p.sprRot = this.poseRot;
    return p;
  }

  movePose(): Pose {
    const m = this.move;
    const sf = this.sf;
    if (!m) return mergePose(BASE_POSE, null);
    const poses = m.poses;
    if (!poses) return mergePose(BASE_POSE, null);
    const air = !this.ground && !m.special;
    const base = air ? mergePose(BASE_POSE, AIR_POSE) : mergePose(BASE_POSE, null);
    const wind = mergePose(base, poses.wind);
    const hit = mergePose(base, poses.hit);
    let p: Pose;
    if (sf < m.as) p = lerpPose(base, wind, easeOut(clamp(sf / m.as, 0, 1)));
    else if (sf <= m.ae) p = lerpPose(wind, hit, clamp((sf - m.as + 1) / 2, 0, 1));
    else p = lerpPose(hit, base, clamp((sf - m.ae) / Math.max(1, m.frames - m.ae), 0, 1));
    if (this.chargeT > 0 && sf === m.charge) p.lean += Math.sin(this.game.frame * 1.3) * 2;
    const anim = m.anim;
    if (anim) {
      const o = anim(this, sf);
      if (o) p = mergePose(p, o);
    }
    return p;
  }

  draw(ctx: Draw2D): void {
    if (this.state === "dead") return;
    const g = this.game;
    // Computed per draw and kept local: drawing must not write simulation state.
    const pose = this.getPose();
    let x = this.x + this.drawOff.x;
    let y = this.y + this.drawOff.y;
    if (this.hitlag > 0 && this.pendingKB) {
      x += rand(-4, 4);
      y += rand(-3, 3);
    }
    const ground = this.ground;
    if (ground) {
      ctx.setFillStyle("rgba(0,0,0,.3)");
      ctx.beginPath();
      ctx.ellipse(this.x, ground.y + 2, 28, 7, 0, 0, TAU, false);
      ctx.fill();
    }
    if (this.state === "respawn") {
      ctx.setFillStyle(this.c.main);
      ctx.setGlobalAlpha(0.8);
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 6, 50, 10, 0, 0, TAU, false);
      ctx.fill();
      ctx.setGlobalAlpha(1);
      ctx.setStrokeStyle("#fff");
      ctx.setLineWidth(2);
      ctx.stroke();
    }
    // Super aura. Canvas2D used a radial gradient; concentric translucent rings approximate it.
    if (this.meter >= 100) {
      const r = 70 + Math.sin(g.frame * 0.2) * 6;
      ctx.setFillStyle(`${this.c.glow}22`);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(x, y - 60 * SZ, r * (0.75 + k * 0.12), 0, TAU, false);
        ctx.fill();
      }
    }
    let alpha = 1;
    if (this.isIntangible() && this.state !== "respawn") alpha = this.invincible > 0 ? (g.frame % 6 < 3 ? 0.55 : 0.9) : 0.55;
    drawFighterBody(ctx, this, pose, x, y, this.facing, alpha, "");
    const move = this.move;
    if (this.state === "attack" && move && move.id === "dspecial" && this.reflecting && this.charId === "railly") drawShine(ctx, x, y - 60 * SZ, g.frame);
    if (this.beam) drawBeam(ctx, this, x, y);
    if (this.lcFlash > 0 || (this.chargeFlash && g.frame % 8 < 4)) {
      ctx.setGlobalAlpha(this.lcFlash > 0 ? (this.lcFlash / 10) * 0.8 : 0.5);
      drawFighterBody(ctx, this, pose, x, y, this.facing, 1, "#fff");
      ctx.setGlobalAlpha(1);
    }
    if (this.hurtFlash > 0 && this.hurtFlash % 4 < 2) drawFighterBody(ctx, this, pose, x, y, this.facing, 0.6, "#ffffff");
    if (this.state === "attack" && move) {
      const drawOver = move.drawOver;
      if (drawOver) drawOver(ctx, this, g);
      if (this.charId === "anthony" && move.id === "fsmash") {
        const sf = this.sf;
        let ang: number;
        if (sf < move.as) ang = lerp(-0.4, -2.3, clamp(sf / move.as, 0, 1)) + (this.chargeT > 0 ? Math.sin(g.frame) * 0.05 : 0);
        else if (sf <= move.ae) ang = lerp(-2.3, 1.75, clamp((sf - move.as + 1) / 3, 0, 1));
        else ang = lerp(1.75, 1.2, clamp((sf - move.ae) / 12, 0, 1));
        ctx.save();
        ctx.translate(x + this.facing * 16, y - 62 * SZ);
        ctx.scale(this.facing, 1);
        drawHammer(ctx, 0, 0, ang, 64);
        ctx.restore();
      }
    }
    if (this.countering) {
      ctx.setStrokeStyle("rgba(255,255,255,.8)");
      ctx.setLineWidth(3);
      ctx.beginPath();
      ctx.arc(x, y - 60 * SZ, 66 + Math.sin(g.frame * 0.6) * 4, 0, TAU, false);
      ctx.stroke();
    }
    if (this.state === "shield" || this.state === "shieldstun") {
      const r = (18 + 48 * (this.shieldHP / 60)) * SZ;
      const pw = g.frame - this.lastShieldPress <= 4;
      ctx.setFillStyle(pw ? "rgba(255,255,255,.55)" : `${this.c.main}66`);
      ctx.setStrokeStyle(pw ? "#fff" : this.c.main);
      ctx.setLineWidth(3);
      ctx.beginPath();
      ctx.arc(x, y - 60 * SZ, r, 0, TAU, false);
      ctx.fill();
      ctx.stroke();
      ctx.setFillStyle("rgba(255,255,255,.35)");
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - 60 * SZ - r * 0.35, r * 0.25, 0, TAU, false);
      ctx.fill();
    }
    if (this.state === "dizzy" && this.ground) {
      // Canvas2D drew a star emoji; the SDF fonts have no emoji, so draw a five-point star.
      for (let i = 0; i < 3; i++) {
        const a = g.frame * 0.12 + (i * TAU) / 3;
        drawStar(ctx, x + Math.cos(a) * 40, y - 150 * SZ + Math.sin(a) * 8 - 6, 8, "#ffd23f");
      }
    }
    // Player indicator.
    const label = this.isCPU ? "CPU" : `P${this.port + 1}`;
    const col = this.isCPU ? "#aaa" : this.port === 0 ? "#ff4d5e" : "#3fa9ff";
    const ty = y - 168 * SZ - (this.state === "down" ? -70 : 0);
    ctx.setFillStyle(col);
    ctx.beginPath();
    ctx.moveTo(x - 8, ty);
    ctx.lineTo(x + 8, ty);
    ctx.lineTo(x, ty + 10);
    ctx.closePath();
    ctx.fill();
    ctx.setFont('bold italic 16px "Arial Black", Impact, sans-serif');
    ctx.setTextAlign("center");
    ctx.setTextBaseline("alphabetic");
    ctx.setLineWidth(4);
    ctx.setStrokeStyle("#0d0b1a");
    ctx.strokeText(label, x, ty - 4);
    ctx.fillText(label, x, ty - 4);
  }
}

function drawStar(ctx: Draw2D, x: number, y: number, r: number, color: string): void {
  ctx.setFillStyle(color);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    else ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

function drawShine(ctx: Draw2D, x: number, y: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.15);
  ctx.setStrokeStyle("#bff8ff");
  ctx.setFillStyle("rgba(124,246,255,.25)");
  ctx.setLineWidth(4);
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i * TAU) / 6;
    if (i === 0) ctx.moveTo(Math.cos(a) * 48, Math.sin(a) * 48);
    else ctx.lineTo(Math.cos(a) * 48, Math.sin(a) * 48);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Canvas2D drew this with a linear gradient and a glow; stepped translucent bands approximate it.
function drawBeam(ctx: Draw2D, f: Fighter, x: number, y: number): void {
  const k = 1 - Math.abs(f.beam - 18.5) / 5;
  const bx = x + f.facing * 18 * SZ;
  const by = y - 92 * SZ;
  const len = 400 * f.facing;
  ctx.save();
  const alpha = clamp(k + 0.3, 0, 1);
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    ctx.setGlobalAlpha(alpha * (1 - t0));
    ctx.setFillStyle(i === 0 ? "#ffffff" : f.c.glow);
    const segX = bx + len * t0;
    const segLen = len / steps;
    ctx.fillRect(Math.min(segX, segX + segLen), by - 9, Math.abs(segLen), 18);
  }
  ctx.setGlobalAlpha(alpha);
  ctx.setFillStyle("#fff");
  ctx.fillRect(Math.min(bx, bx + len * 0.8), by - 3, Math.abs(len * 0.8), 6);
  ctx.restore();
}
