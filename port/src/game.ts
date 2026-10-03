// Game: loop, camera, hits and HUD, ported from js/game.js.
import type { Draw2D } from "../../vendor/dotframe/src/draw2d";
import type { RenderGpu } from "../../vendor/dotframe/src/gpu";
import { Effects } from "./effects";
import { Fighter, KB_SCALE, type Rect, TUMBLE_KB } from "./fighter";
import type { Controller } from "./input";
import { drawCodexTerminal, drawItem, drawMeme, drawVercel } from "./items";
import { duckMusic, playMusic, sfx, voice } from "./sound";
import { faces } from "./sprites";
import { type Camera, drawStageBackground, drawStageForeground, makeStage, type Stage, updateStage } from "./stages";
import { H, type Hitbox } from "./types";
import { circleRect, clamp, DEG, lerp, rand, rectRect, sgn, SZ, TAU } from "./util";

const KB_DECAY = 0.24;

export interface GameConfig {
  stage: string;
  chars: string[];
  mode: string;
  stocks: number;
  cpu: boolean[];
  cpuLevel: number;
}

export type ProjectileUpdate = (p: Projectile, g: Game) => void;
export type ProjectileDraw = (ctx: Draw2D, p: Projectile, g: Game) => void;
export type ProjectileHit = (p: Projectile, target: Fighter, g: Game) => void;

export interface Projectile {
  owner: Fighter;
  kind: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  d: number;
  a: number;
  b: number;
  k: number;
  g: number;
  fkb: number;
  fx: string;
  life: number;
  maxLife: number;
  t: number;
  rot: number;
  spin: number;
  grav: number;
  wave: boolean;
  roll: boolean;
  bounce: number;
  entity: boolean;
  harmless: boolean;
  noReflect: boolean;
  noClash: boolean;
  noFlinch: boolean;
  hitSet: Set<number> | null;
  // [w, h] for rectangular projectiles, empty for circles.
  rect: number[];
  dir: number;
  img: string;
  frames: string[];
  fspd: number;
  h: number;
  flip: boolean;
  text: string;
  size: number;
  color: string;
  glyph: string;
  lines: string[];
  alpha: number;
  ended: boolean;
  update: ProjectileUpdate | null;
  draw: ProjectileDraw | null;
  onHit: ProjectileHit | null;
  onEnd: ProjectileUpdate | null;
}

export interface ProjectileOptions {
  kind?: string;
  type?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  r?: number;
  d?: number;
  a?: number;
  b?: number;
  k?: number;
  g?: number;
  fkb?: number;
  fx?: string;
  life?: number;
  rot?: number;
  spin?: number;
  grav?: number;
  wave?: boolean;
  roll?: boolean;
  bounce?: number;
  entity?: boolean;
  harmless?: boolean;
  noReflect?: boolean;
  noClash?: boolean;
  noFlinch?: boolean;
  pierce?: boolean;
  rect?: number[];
  dir?: number;
  img?: string;
  frames?: string[];
  fspd?: number;
  h?: number;
  flip?: boolean;
  text?: string;
  size?: number;
  color?: string;
  glyph?: string;
  lines?: string[];
  alpha?: number;
  update?: ProjectileUpdate;
  draw?: ProjectileDraw;
  onHit?: ProjectileHit;
  onEnd?: ProjectileUpdate;
}

interface Banner {
  text: string;
  color: string;
  t: number;
  dur: number;
  big: boolean;
}

interface WorldHitbox {
  rect: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

export interface Photo {
  t: number;
}

export interface Results {
  winner: Fighter | null;
  fighters: Fighter[];
  cfg: GameConfig;
}

export type ControllerFactory = (port: number, cpu: boolean, level: number) => Controller;

const SKIP_PUSH = new Set(["dead", "grabbed", "locked", "ledge", "respawn"]);
const EMBLEMS = new Map<string, string>([
  ["anthony", "✌"],
  ["railly", "▲"],
  ["jibaru", "◓"],
  ["edward", "=^.^="],
  ["shiara", "★"],
]);

export class Game {
  gpu: RenderGpu;
  fx = new Effects();
  W: number;
  H: number;
  running = false;
  paused = false;
  debug = false;
  cam: Camera = { x: 800, y: 450, zoom: 1 };
  cfg: GameConfig = { stage: "station", chars: ["railly", "anthony"], mode: "vs", stocks: 3, cpu: [false, true], cpuLevel: 5 };
  stage: Stage;
  frame = 0;
  projs: Projectile[] = [];
  banners: Banner[] = [];
  flashA = 0;
  flashC = "#fff";
  shakeA = 0;
  slowmo = 0;
  slowTick = 0;
  fatalT = 0;
  focus: Fighter | null = null;
  photo: Photo | null = null;
  phase = "countdown";
  phaseT = 0;
  inputLocked = true;
  training = false;
  fighters: Fighter[] = [];
  winner: Fighter | null = null;
  dummyMode = 0;
  hudShake: number[] = [0, 0];
  onEnd: ((results: Results) => void) | null = null;
  makeController: ControllerFactory;

  constructor(gpu: RenderGpu, width: number, height: number, makeController: ControllerFactory) {
    this.gpu = gpu;
    this.W = width;
    this.H = height;
    this.makeController = makeController;
    this.stage = makeStage("station", gpu);
  }

  start(cfg: GameConfig): void {
    this.cfg = cfg;
    this.stage = makeStage(cfg.stage, this.gpu);
    this.frame = 0;
    this.fx.clear();
    this.projs = [];
    this.banners = [];
    this.flashA = 0;
    this.flashC = "#fff";
    this.shakeA = 0;
    this.slowmo = 0;
    this.slowTick = 0;
    this.fatalT = 0;
    this.focus = null;
    this.photo = null;
    this.phase = "countdown";
    this.phaseT = 0;
    this.inputLocked = true;
    this.training = cfg.mode === "training";
    this.winner = null;
    this.fighters = [];
    for (let i = 0; i < 2; i++) {
      const ctrl = this.makeController(i, cfg.cpu[i], cfg.mode === "training" ? 0 : cfg.cpuLevel);
      const alt = i === 1 && cfg.chars[0] === cfg.chars[1];
      const f = new Fighter(this, cfg.chars[i], i, ctrl, alt);
      const sp = this.stage.spawns[i];
      f.reset(sp.x, sp.y, i === 0 ? 1 : -1);
      f.ground = this.stage.main;
      f.stocks = this.training ? 9999 : cfg.stocks;
      this.fighters.push(f);
    }
    this.dummyMode = 0;
    this.cam = { x: 800, y: 450, zoom: this.baseZoom() };
    this.running = true;
    this.paused = false;
    playMusic(this.stage.music === "" ? "battlefield" : this.stage.music, false);
  }

  stop(): void {
    this.running = false;
  }

  baseZoom(): number {
    return Math.min(this.W / 1300, this.H / 760);
  }

  // Advances the simulation by one 60 Hz step, honoring slow motion.
  step(): void {
    if (!this.running || this.paused) return;
    if (this.slowmo > 0) {
      this.slowmo -= 1;
      this.slowTick += 1;
      if (this.slowTick % 4 !== 0) {
        this.fx.update();
        return;
      }
    }
    this.tick();
  }

  // ---------- Simulation ----------
  tick(): void {
    this.frame += 1;
    this.phaseT += 1;
    if (this.phase === "countdown") {
      if (this.phaseT === 1) {
        this.banner("3", "#fff", 60, true);
        voice("three", 1);
      }
      if (this.phaseT === 60) {
        this.banner("2", "#fff", 60, true);
        voice("two", 1);
      }
      if (this.phaseT === 120) {
        this.banner("1", "#fff", 60, true);
        voice("one", 1);
      }
      if (this.phaseT === 180) {
        this.banner("GO!", "#ffd23f", 50, true);
        voice("go", 1);
        this.phase = "play";
        this.inputLocked = false;
      }
    }
    const onEnd = this.onEnd;
    if (this.phase === "gameover" && this.phaseT === 160 && onEnd) onEnd(this.results());

    updateStage(this.stage, this.frame);
    for (const f of this.fighters) {
      const ground = f.ground;
      if (ground && ground.move && f.state !== "ledge") f.x += ground.dx;
    }
    for (const f of this.fighters) {
      if (f.state === "dead") {
        this.updateDead(f);
        f.readInput();
        continue;
      }
      f.update();
    }
    this.updateProjectiles();
    this.detectHits();
    this.pushApart();
    this.checkKOs();
    this.fx.update();
    for (const b of this.banners) b.t += 1;
    this.banners = this.banners.filter((b: Banner): boolean => b.t < b.dur);
    this.flashA *= 0.88;
    this.shakeA *= 0.85;
    if (this.fatalT > 0) this.fatalT -= 1;
  }

  updateDead(f: Fighter): void {
    f.deadT += 1;
    if (f.stocks > 0 && f.deadT >= 80 && this.phase !== "gameover") {
      const m = this.stage.main;
      f.reset((m.x1 + m.x2) / 2 + (f.port ? 60 : -60), m.y - 330, f.port ? -1 : 1);
      f.percent = 0;
      f.setState("respawn");
      f.invincible = 150;
    }
  }

  spawnProjectile(owner: Fighter, o: ProjectileOptions): Projectile {
    const life = o.life ?? 60;
    const p: Projectile = {
      owner,
      kind: o.kind ?? "",
      type: o.type ?? "",
      x: o.x ?? 0,
      y: o.y ?? 0,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      r: o.r ?? 10,
      d: o.d ?? 0,
      a: o.a ?? 45,
      b: o.b ?? 0,
      k: o.k ?? 0,
      g: o.g ?? 0,
      fkb: o.fkb ?? 0,
      fx: o.fx ?? "",
      life,
      maxLife: life,
      t: 0,
      rot: o.rot ?? 0,
      spin: o.spin ?? 0,
      grav: o.grav ?? 0,
      wave: o.wave ?? false,
      roll: o.roll ?? false,
      bounce: o.bounce ?? 0,
      entity: o.entity ?? false,
      harmless: o.harmless ?? false,
      noReflect: o.noReflect ?? false,
      noClash: o.noClash ?? false,
      noFlinch: o.noFlinch ?? false,
      hitSet: o.pierce ? new Set<number>() : null,
      rect: o.rect ?? [],
      dir: o.dir ?? 0,
      img: o.img ?? "",
      frames: o.frames ?? [],
      fspd: o.fspd ?? 5,
      h: o.h ?? 0,
      flip: o.flip ?? false,
      text: o.text ?? "",
      size: o.size ?? 34,
      color: o.color ?? "",
      glyph: o.glyph ?? "",
      lines: o.lines ?? [],
      alpha: o.alpha ?? 1,
      ended: false,
      update: o.update ?? null,
      draw: o.draw ?? null,
      onHit: o.onHit ?? null,
      onEnd: o.onEnd ?? null,
    };
    this.projs.push(p);
    return p;
  }

  // Invisible hit zone, for summons and area attacks.
  zone(owner: Fighter, x: number, y: number, r: number, o: ProjectileOptions, life: number): Projectile {
    return this.spawnProjectile(owner, {
      type: "zone",
      x,
      y,
      vx: 0,
      vy: 0,
      r,
      life,
      pierce: true,
      noClash: true,
      noReflect: true,
      d: o.d,
      a: o.a,
      b: o.b,
      k: o.k,
      fkb: o.fkb,
      fx: o.fx,
      kind: o.kind,
      noFlinch: o.noFlinch,
      onHit: o.onHit,
      dir: o.dir,
    });
  }

  countProjs(owner: Fighter, kind: string): number {
    let n = 0;
    for (const p of this.projs) if (p.owner === owner && p.kind === kind && p.life > 0) n += 1;
    return n;
  }

  private endProjectile(p: Projectile): void {
    const onEnd = p.onEnd;
    if (onEnd && !p.ended) {
      p.ended = true;
      onEnd(p, this);
    }
  }

  updateProjectiles(): void {
    const m = this.stage.main;
    for (const p of this.projs) {
      if (p.life <= 0) continue;
      p.t += 1;
      const update = p.update;
      if (update) update(p, this);
      if (p.grav) p.vy = Math.min(p.vy + p.grav, 14);
      if (p.wave) p.vy = Math.cos(p.t * 0.16) * 2.4;
      const py = p.y;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      if (p.grav || p.roll) {
        for (const pl of this.stage.platforms) {
          if (p.vy >= 0 && py + p.r <= pl.y + 2 && p.y + p.r >= pl.y && p.x > pl.x1 && p.x < pl.x2) {
            if (p.roll) {
              p.y = pl.y - p.r;
              p.vy = 0;
            } else if (p.bounce > 0) {
              p.y = pl.y - p.r;
              p.vy = -Math.abs(p.vy) * 0.62;
              p.bounce -= 1;
              sfx.land();
            } else if (!p.entity) {
              p.life = 0;
            }
            break;
          }
        }
      }
      if (!p.entity && p.type !== "zone" && p.x > m.x1 && p.x < m.x2 && p.y > m.y + 4 && p.y < m.bottom) {
        p.life = 0;
        this.fx.spark(p.x, p.y, 0.4, "#fff");
      }
      p.life -= 1;
      if (p.life <= 0) this.endProjectile(p);
    }
    // Projectile clashes.
    for (const a of this.projs) {
      for (const b of this.projs) {
        if (a === b || a.owner === b.owner || a.life <= 0 || b.life <= 0 || a.entity || b.entity || a.noClash || b.noClash) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) {
          a.life = 0;
          b.life = 0;
          this.fx.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 1, "#fff");
          sfx.shield();
          this.endProjectile(a);
          this.endProjectile(b);
        }
      }
    }
    for (const p of this.projs) {
      if (p.life <= 0 || p.entity || p.harmless) continue;
      for (const t of this.fighters) {
        if (t === p.owner || t.state === "dead") continue;
        const hitSet = p.hitSet;
        if (hitSet && hitSet.has(t.port)) continue;
        const h = t.hurtbox();
        const hit =
          p.rect.length === 2
            ? rectRect(p.x - p.rect[0] / 2, p.y - p.rect[1] / 2, p.rect[0], p.rect[1], h.x, h.y, h.w, h.h)
            : circleRect(p.x, p.y, p.r, h.x, h.y, h.w, h.h);
        if (!hit || t.isIntangible()) continue;
        const pw = t.state === "shield" && this.frame - t.lastShieldPress <= 4;
        if ((t.reflecting || pw) && !p.noReflect && p.vx) {
          p.vx = -p.vx * 1.15;
          p.owner = t;
          p.d *= 1.4;
          p.life = p.maxLife;
          if (hitSet) hitSet.clear();
          this.fx.hitSpark(p.x, p.y, 60, "#7cf6ff", "shine");
          sfx.shine();
          this.callout(t, pw ? "PARRY!" : "¡REFLEJO!", "#7cf6ff", false);
          if (pw) t.record.parries += 1;
          continue;
        }
        const dir = sgn(p.vx) || p.dir || sgn(t.x - p.x) || 1;
        this.resolveHit(p.owner, t, projectileHitbox(p), p.x - dir * 20, dir, p, false);
        const onHit = p.onHit;
        if (onHit) onHit(p, t, this);
        if (hitSet) {
          hitSet.add(t.port);
          continue;
        }
        p.life = 0;
        this.endProjectile(p);
        break;
      }
    }
    const b = this.stage.blast;
    this.projs = this.projs.filter((p: Projectile): boolean => p.life > 0 && p.x > b.l && p.x < b.r && p.y > b.t && p.y < b.b);
  }

  hitboxWorld(att: Fighter, hb: Hitbox): WorldHitbox {
    if (hb.rect) {
      const x0 = att.x + hb.x * SZ * att.facing;
      const x1 = x0 + hb.w * att.facing;
      return { rect: true, x: Math.min(x0, x1), y: att.y - hb.y * SZ - (hb.h * SZ) / 2, w: hb.w, h: hb.h * SZ, r: 0 };
    }
    return { rect: false, x: att.x + hb.x * SZ * att.facing, y: att.y - hb.y * SZ, w: 0, h: 0, r: hb.r * SZ };
  }

  detectHits(): void {
    const all: Hitbox[][] = this.fighters.map((f: Fighter): Hitbox[] => (f.state === "dead" ? [] : f.activeHitboxes()));
    for (let ai = 0; ai < this.fighters.length; ai++) {
      const att = this.fighters[ai];
      const hbs = all[ai];
      if (hbs.length === 0) continue;
      let grabbed = false;
      for (const tgt of this.fighters) {
        if (grabbed) break;
        if (tgt === att || tgt.state === "dead" || tgt.state === "grabbed" || tgt.state === "locked") continue;
        const h = tgt.hurtbox();
        for (const hb of hbs) {
          const key = hb.g;
          let set = att.hitGroups.get(key);
          if (!set) {
            set = new Set<number>();
            att.hitGroups.set(key, set);
          }
          if (set.has(tgt.port)) continue;
          const w = this.hitboxWorld(att, hb);
          const hit = w.rect ? rectRect(w.x, w.y, w.w, w.h, h.x, h.y, h.w, h.h) : circleRect(w.x, w.y, w.r, h.x, h.y, h.w, h.h);
          if (!hit) continue;
          if (hb.grab) {
            if (att.state !== "attack" || tgt.isIntangible() || (!tgt.ground && tgt.y < att.y - 50)) continue;
            set.add(tgt.port);
            this.startGrab(att, tgt);
            grabbed = true;
            break;
          }
          const onHit = hb.onHit;
          if (tgt.isIntangible() && !onHit) continue;
          if (onHit) {
            if (tgt.isIntangible()) continue;
            set.add(tgt.port);
            if (onHit(att, tgt, this)) break;
          }
          if (this.resolveHit(att, tgt, hb, att.x, att.facing, null, false)) {
            set.add(tgt.port);
            break;
          }
        }
      }
    }
  }

  resolveHit(att: Fighter, tgt: Fighter, hb: Hitbox, srcX: number, srcFacing: number, proj: Projectile | null, isThrow: boolean): boolean {
    if (tgt.state === "dead") return false;
    if (!isThrow && tgt.isIntangible()) return false;
    const w: WorldHitbox = proj
      ? { rect: false, x: proj.x, y: proj.y, w: 0, h: 0, r: 0 }
      : hb.r
        ? this.hitboxWorld(att, hb)
        : { rect: false, x: (att.x + tgt.x) / 2, y: tgt.y - 60 * SZ, w: 0, h: 0, r: 0 };
    const cx = w.rect ? tgt.x : lerp(w.x, tgt.x, 0.4);
    const cy = w.rect ? w.y + w.h / 2 : lerp(w.y, tgt.y - 60 * SZ, 0.4);

    // Counter (Selfie Flash).
    if (tgt.countering && !isThrow && !hb.unblockable) {
      const dmg = Math.max(8, hb.d * 1.35);
      tgt.facing = sgn(att.x - tgt.x) || tgt.facing;
      tgt.startMove("counterHit");
      tgt.mv.dmg = dmg;
      tgt.invincible = 14;
      if (!proj) att.hitlag = 22;
      this.callout(tgt, "COUNTER!", "#fff", false);
      return true;
    }
    // Shield.
    if (!isThrow && !hb.unblockable && (tgt.state === "shield" || tgt.state === "shieldstun")) {
      const d = hb.d;
      const push = sgn(tgt.x - srcX) || srcFacing;
      if (tgt.state === "shield" && this.frame - tgt.lastShieldPress <= 4) {
        this.fx.hitSpark(cx, cy, 90, "#fff", "flash");
        sfx.parry();
        this.callout(tgt, "PARRY!", "#fff", false);
        tgt.record.parries += 1;
        if (!proj) {
          att.hitlag = 20;
          att.hurtFlash = 10;
        }
        tgt.hitlag = 3;
        return true;
      }
      tgt.shieldHP -= d * 1.15;
      const hl = clamp(Math.floor(d / 3 + 3), 3, 16);
      tgt.setState("shieldstun");
      tgt.lag = Math.max(2, Math.floor(((d + 4.45) / 2.235) * 0.8));
      tgt.vx = push * Math.min(8, d * 0.35 + 1.5);
      tgt.hitlag = hl;
      if (!proj) att.hitlag = hl;
      if (!proj && att.ground) att.vx = -push * Math.min(4, d * 0.15);
      sfx.shield();
      this.fx.spark(cx, cy, 0.4, tgt.c.main);
      if (tgt.shieldHP <= 0) tgt.shieldBreak();
      return true;
    }
    // Damage.
    const move = att.move;
    const smash = !proj && !!move && move.smash;
    const stale = hb.noStale || proj || isThrow || !move ? 1 : att.staleMul(move.id);
    const charge = smash && att.chargeT ? 1 + (att.chargeT / 60) * 0.4 : 1;
    const d = Math.round(hb.d * stale * charge * 10) / 10;
    tgt.percent = Math.min(999, tgt.percent + d);
    this.addDamage(att, tgt, d);
    if (!proj && move && !att.moveHit && !isThrow) {
      att.moveHit = true;
      att.pushStale(move.id);
    }
    tgt.lastHitBy = att;
    tgt.lastHitFrame = this.frame;

    let kb: number;
    if (hb.fkb) kb = hb.fkb;
    else {
      const p = tgt.percent;
      const wgt = tgt.stats.weight;
      kb = ((p / 10 + (p * d) / 20) * (200 / (wgt + 100)) * 1.4 + 18) * (hb.k / 100) + hb.b;
    }
    if (hb.noFlinch || (!hb.b && !hb.k && !hb.fkb)) kb = 0;
    const crouching = tgt.state === "crouch";
    if (crouching && kb > 0) {
      kb *= 0.67;
      if (kb < TUMBLE_KB) this.callout(tgt, "CROUCH CANCEL", "#ccc", true);
    }

    if (kb <= 0 || (tgt.superArmor && !isThrow)) {
      tgt.hurtFlash = 6;
      tgt.hitlag = Math.max(tgt.hitlag, 2);
      this.fx.spark(cx, cy, 0.3, att.c.glow);
      sfx.hit(0.3, proj && proj.type === "laser" ? "" : hb.fx);
      return true;
    }
    let ang = hb.a;
    if (ang === 361) ang = tgt.ground && kb < 32 ? 0 : 44;
    const world = srcFacing > 0 ? ang : 180 - ang;
    const hl = clamp(Math.floor(d / 3 + 3 + (kb > 150 ? 5 : 0)), 3, 24);

    const wasStunned = tgt.state === "hitstun" || tgt.state === "tumble" || tgt.state === "grabbed" || tgt.state === "down";
    const victim = tgt.grabbing;
    if (victim) {
      tgt.grabbing = null;
      if (victim.grabbedBy === tgt) {
        victim.grabbedBy = null;
        victim.setState("air");
      }
    }
    const holder = tgt.grabbedBy;
    if (holder && !isThrow) {
      tgt.grabbedBy = null;
      holder.grabbing = null;
      holder.setState("idle");
    }

    tgt.setState("hitstun");
    tgt.hitstun = Math.floor(kb * 0.4);
    tgt.tumble = kb >= TUMBLE_KB;
    tgt.pendingKB = { speed: kb * KB_SCALE, ang: world };
    tgt.hitlag = crouching ? Math.floor(hl * 0.67) : hl;
    if (!proj && !isThrow) att.hitlag = hl;
    tgt.fastfall = false;
    tgt.vx = 0;
    tgt.vy = 0;
    tgt.kvx = 0;
    tgt.kvy = 0;
    tgt.hurtFlash = 8;
    att.combo = wasStunned && att.comboT > 0 ? att.combo + 1 : 1;
    att.comboT = 90;
    if (att.combo >= 2) {
      att.record.maxCombo = Math.max(att.record.maxCombo, att.combo);
      this.fx.text(tgt.x, tgt.y - 175 * SZ, `${att.combo} HITS`, att.c.accent, 22 + Math.min(att.combo, 8) * 2, { life: 40, max: 40 });
    }
    this.fx.hitSpark(cx, cy, kb, att.c.glow, hb.fx);
    sfx.hit(kb / 80, hb.fx);
    this.shake(clamp(kb / 18, 1, 18));
    if (hb.fx === "meteor" && tgt.pendingKB && !tgt.ground) this.callout(tgt, "¡METEORO!", "#ffd23f", false);
    if (kb > 100 && this.predictKO(tgt) && (tgt.stocks === 1 || kb > 200)) this.fatal(tgt);
    return true;
  }

  addDamage(att: Fighter, tgt: Fighter, d: number): void {
    att.record.dealt += d;
    tgt.record.taken += d;
    this.hudShake[tgt.port] = 12;
    const move = att.move;
    const final = !!move && move.final;
    if (!final) {
      const was = att.meter < 100;
      att.meter = Math.min(100, att.meter + d * 0.8);
      if (was && att.meter >= 100) {
        sfx.smashReady();
        this.callout(att, "¡SÚPER LISTO!", att.c.accent, false);
      }
    }
    const wasT = tgt.meter < 100;
    tgt.meter = Math.min(100, tgt.meter + d * 0.3);
    if (wasT && tgt.meter >= 100) {
      sfx.smashReady();
      this.callout(tgt, "¡SÚPER LISTO!", tgt.c.accent, false);
    }
  }

  predictKO(t: Fighter): boolean {
    const kb = t.pendingKB;
    if (!kb) return false;
    const b = this.stage.blast;
    const m = this.stage.main;
    let x = t.x;
    let y = t.y;
    let kvx = Math.cos(kb.ang * DEG) * kb.speed;
    let kvy = -Math.sin(kb.ang * DEG) * kb.speed;
    let vy = 0;
    for (let i = 0; i < 200; i++) {
      vy = Math.min(vy + t.stats.gravity, t.stats.maxFall);
      x += kvx;
      y += kvy + vy;
      const s = Math.hypot(kvx, kvy);
      if (s > 0) {
        const ns = Math.max(0, s - KB_DECAY);
        kvx *= ns / s;
        kvy *= ns / s;
      }
      if (x < b.l || x > b.r || y < b.t) return true;
      if (x > m.x1 && x < m.x2 && y > m.y && y < m.bottom) return false;
      if (s === 0) return false;
    }
    return false;
  }

  fatal(t: Fighter): void {
    this.slowmo = 45;
    this.fatalT = 60;
    this.focus = t;
    sfx.fatal();
    this.flash("#ff2244", 0.5);
  }

  startGrab(att: Fighter, tgt: Fighter): void {
    if (tgt.grabbedBy) return;
    const victim = tgt.grabbing;
    if (victim) {
      tgt.grabbing = null;
      victim.grabbedBy = null;
      victim.setState("air");
    }
    tgt.setState("grabbed");
    tgt.grabbedBy = att;
    tgt.grabTimer = 70 + tgt.percent * 0.9;
    tgt.kvx = 0;
    tgt.kvy = 0;
    tgt.vx = 0;
    tgt.vy = 0;
    att.setState("grabbing");
    att.grabbing = tgt;
    att.holdVictim(tgt);
    sfx.grab();
    this.fx.spark(tgt.x, tgt.y - 60 * SZ, 0.4, "#fff");
  }

  grabRelease(att: Fighter, tgt: Fighter): void {
    att.grabbing = null;
    tgt.grabbedBy = null;
    att.setState("land");
    att.lag = 14;
    tgt.setState("air");
    tgt.ground = null;
    tgt.y -= 2;
    tgt.vy = -7;
    tgt.vx = sgn(tgt.x - att.x) * 4;
    this.callout(tgt, "ESCAPE", "#fff", true);
  }

  pushApart(): void {
    if (this.fighters.length < 2) return;
    const a = this.fighters[0];
    const b = this.fighters[1];
    if (SKIP_PUSH.has(a.state) || SKIP_PUSH.has(b.state) || a.grabbing || b.grabbing) return;
    if (!a.ground || !b.ground || a.ground !== b.ground) return;
    const dx = b.x - a.x;
    if (Math.abs(dx) < 34) {
      const push = (34 - Math.abs(dx)) * 0.12 * (sgn(dx) || 1);
      a.x -= push;
      b.x += push;
    }
  }

  checkKOs(): void {
    const b = this.stage.blast;
    for (const f of this.fighters) {
      if (f.state === "dead") continue;
      if (f.x < b.l || f.x > b.r || f.y > b.b || f.y < b.t) this.ko(f);
    }
  }

  ko(f: Fighter): void {
    const b0 = this.stage.blast;
    const v = this.viewRect();
    const x = clamp(f.x, v.x + 40, v.x + v.w - 40);
    const y = clamp(f.y - 50, v.y + 40, v.y + v.h - 40);
    const m = this.stage.main;
    const ang = Math.atan2(m.y - 200 - y, (m.x1 + m.x2) / 2 - x);
    if (f.y < b0.t && Math.random() < 0.6) {
      // Star KO: flies into the background.
      this.fx.starKO(x, v.y + 60, f);
      sfx.starKO();
    } else {
      this.fx.koBlast(x, y, ang, f.c.main);
      sfx.ko(f.y > b0.b - 10);
      this.shake(22);
      this.flash(f.c.main, 0.35);
    }
    const victim = f.grabbing;
    if (victim) {
      f.grabbing = null;
      victim.grabbedBy = null;
      victim.setState("air");
    }
    const holder = f.grabbedBy;
    if (holder) {
      holder.grabbing = null;
      f.grabbedBy = null;
      holder.setState("idle");
    }
    f.setState("dead");
    f.deadT = 0;
    f.record.falls += 1;
    const killer = f.lastHitBy;
    if (killer && killer !== f && this.frame - f.lastHitFrame < 600) killer.record.kos += 1;
    else f.record.sd += 1;
    f.lastHitBy = null;
    f.stocks -= 1;
    f.meter = Math.min(100, f.meter + 15);
    if (this.training) {
      f.stocks = 9999;
      return;
    }
    const alive = this.fighters.filter((q: Fighter): boolean => q.stocks > 0);
    if (alive.length <= 1 && this.phase !== "gameover") {
      this.phase = "gameover";
      this.phaseT = 0;
      this.slowmo = 70;
      this.winner = alive.length > 0 ? alive[0] : null;
      this.banner("¡GAME!", "#ffd23f", 150, true);
      voice("game", 1);
      duckMusic(0.3);
    }
  }

  results(): Results {
    return { winner: this.winner, fighters: this.fighters, cfg: this.cfg };
  }

  // ---------- Helpers ----------
  callout(f: Fighter, text: string, color: string, small: boolean): void {
    if (small && !this.training && text !== "L-CANCEL" && text !== "WAVEDASH" && text !== "WAVELAND") return;
    this.fx.text(f.x, f.y - 140 * SZ, text, color, small ? 18 : 26, { life: small ? 36 : 50, max: small ? 36 : 50 });
  }

  stat(f: Fighter, key: string): void {
    if (key === "aerial") f.record.aerial += 1;
    else if (key === "dashdance") f.record.dashdance += 1;
  }

  shake(a: number): void {
    this.shakeA = Math.max(this.shakeA, a);
  }

  flash(c: string, a: number): void {
    this.flashC = c;
    this.flashA = Math.max(this.flashA, a);
  }

  banner(text: string, color: string, dur: number, big: boolean): void {
    this.banners.push({ text, color, t: 0, dur, big });
  }

  // ---------- Camera ----------
  updateCamera(): void {
    const m = this.stage.main;
    let minX = (m.x1 + m.x2) / 2;
    let maxX = minX;
    let minY = m.y - 120;
    let maxY = minY;
    for (const f of this.fighters) {
      if (f.state === "dead") continue;
      const py = f.y - 55 * SZ;
      minX = Math.min(minX, f.x);
      maxX = Math.max(maxX, f.x);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    const b = this.stage.blast;
    minX = Math.max(minX, b.l + 150);
    maxX = Math.min(maxX, b.r - 150);
    minY = Math.max(minY, b.t + 150);
    maxY = Math.min(maxY, b.b - 250);
    const w = Math.max(maxX - minX + 520, 1180);
    const h = Math.max(maxY - minY + 440, 690);
    let zoom = clamp(Math.min(this.W / w, this.H / h), this.W / 2600, this.W / 700);
    let tx = (minX + maxX) / 2;
    let ty = (minY + maxY) / 2 + 20;
    let k = 0.08;
    const focus = this.focus;
    if (this.fatalT > 0 && focus) {
      zoom = Math.min(this.W, this.H) / 420;
      tx = focus.x;
      ty = focus.y - 60;
      k = 0.25;
    }
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, k);
    this.cam.zoom = lerp(this.cam.zoom, zoom, k * 0.7);
  }

  viewRect(): Rect {
    const z = this.cam.zoom;
    return { x: this.cam.x - this.W / 2 / z, y: this.cam.y - this.H / 2 / z, w: this.W / z, h: this.H / z };
  }

  // ---------- Rendering ----------
  render(ctx: Draw2D): void {
    const W = this.W;
    const H = this.H;
    this.updateCamera();
    const t = this.frame;
    ctx.resetTransform();
    ctx.setFillStyle("#07060f");
    ctx.fillRect(0, 0, W, H);
    drawStageBackground(this.stage, ctx, W, H, this.cam, t);
    if (this.fatalT > 0) {
      ctx.setFillStyle(`rgba(120,0,20,${Math.min(0.75, this.fatalT / 40)})`);
      ctx.fillRect(0, 0, W, H);
    }
    const sx = rand(-1, 1) * this.shakeA;
    const sy = rand(-1, 1) * this.shakeA;
    const z = this.cam.zoom;
    ctx.setTransform(z, 0, 0, z, W / 2 - this.cam.x * z + sx, H / 2 - this.cam.y * z + sy);
    drawStageForeground(this.stage, ctx);
    this.fx.drawBack(ctx);
    // Attacking fighters draw on top.
    for (const f of this.fighters) if (f.state !== "attack") f.draw(ctx);
    for (const f of this.fighters) if (f.state === "attack") f.draw(ctx);
    this.drawProjectiles(ctx);
    if (this.debug) this.drawDebug(ctx);
    this.fx.draw(ctx);
    ctx.resetTransform();
    this.drawOffscreen(ctx);
    if (this.photo) this.drawPhoto(ctx);
    this.drawHUD(ctx);
    this.drawBanners(ctx);
    if (this.flashA > 0.01) {
      ctx.setGlobalAlpha(this.flashA);
      ctx.setFillStyle(this.flashC);
      ctx.fillRect(0, 0, W, H);
      ctx.setGlobalAlpha(1);
    }
  }

  drawProjectiles(ctx: Draw2D): void {
    for (const p of this.projs) {
      const draw = p.draw;
      if (draw) {
        draw(ctx, p, this);
        continue;
      }
      switch (p.type) {
        case "laser": {
          ctx.setStrokeStyle(p.owner.c.main);
          ctx.setLineWidth(8);
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * 2.4, p.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setStrokeStyle("#fff");
          ctx.setLineWidth(3);
          ctx.stroke();
          break;
        }
        case "vercel": {
          ctx.save();
          ctx.setGlobalAlpha(0.35);
          for (let i = 1; i <= 3; i++) drawVercel(ctx, p.x - p.vx * i * 0.9, p.y, p.r * 2 * (1 - i * 0.18), p.rot - i * 0.2, false);
          ctx.restore();
          drawVercel(ctx, p.x, p.y, p.r * 2.2, p.rot, true);
          break;
        }
        case "peace": {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.setFillStyle(`${p.owner.c.accent}55`);
          ctx.beginPath();
          ctx.arc(0, 0, p.r * 1.6, 0, TAU, false);
          ctx.fill();
          ctx.setFillStyle("rgba(255,255,255,.6)");
          ctx.beginPath();
          ctx.arc(0, 0, p.r * 0.8, 0, TAU, false);
          ctx.fill();
          ctx.rotate(Math.sin(p.t * 0.2) * 0.4);
          ctx.setFont(`${Math.round(p.r * 2)}px "Arial Black", sans-serif`);
          ctx.setTextAlign("center");
          ctx.setTextBaseline("middle");
          ctx.setFillStyle("#b8ff3a");
          ctx.fillText("✌", 0, 0);
          ctx.restore();
          if (p.t % 3 === 0) this.fx.sparkle(p.x - p.vx * 2, p.y, p.owner.c.accent);
          break;
        }
        case "img": {
          const name = p.frames.length > 0 ? p.frames[Math.floor(p.t / p.fspd) % p.frames.length] : p.img;
          drawItem(ctx, name, p.x, p.y, p.h || p.r * 2.4, { rot: p.rot, flip: p.flip });
          break;
        }
        case "meme":
          drawMeme(ctx, p.img, p.x, p.y, p.h || 60, p.rot);
          break;
        case "text": {
          const k = Math.min(1, p.t / 6);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(0.5 + k * 0.5, 0.5 + k * 0.5);
          ctx.setFont(`900 ${p.size}px Bangers, Impact, sans-serif`);
          ctx.setTextAlign("center");
          ctx.setTextBaseline("middle");
          ctx.setLineWidth(8);
          ctx.setStrokeStyle("#1a1020");
          ctx.strokeText(p.text, 0, 0);
          ctx.setFillStyle(p.color === "" ? "#ffd23f" : p.color);
          ctx.fillText(p.text, 0, 0);
          ctx.restore();
          break;
        }
        case "note": {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.sin(p.t * 0.25) * 0.3);
          ctx.setFont(`bold ${Math.round(p.r * 2.6)}px "Arial Black", sans-serif`);
          ctx.setTextAlign("center");
          ctx.setTextBaseline("middle");
          ctx.setLineWidth(4);
          ctx.setStrokeStyle("#0c3b38");
          const glyph = p.glyph === "" ? "♪" : p.glyph;
          ctx.strokeText(glyph, 0, 0);
          ctx.setFillStyle(p.color === "" ? "#39c5bb" : p.color);
          ctx.fillText(glyph, 0, 0);
          ctx.restore();
          break;
        }
        case "codex":
          drawCodexTerminal(ctx, p);
          break;
      }
    }
  }

  drawDebug(ctx: Draw2D): void {
    ctx.setLineWidth(2);
    for (const f of this.fighters) {
      if (f.state === "dead") continue;
      const h = f.hurtbox();
      ctx.setStrokeStyle(f.isIntangible() ? "#5af" : "#ff0");
      ctx.strokeRect(h.x, h.y, h.w, h.h);
      for (const hb of f.activeHitboxes()) {
        const w = this.hitboxWorld(f, hb);
        ctx.setFillStyle(hb.grab ? "rgba(160,0,255,.4)" : "rgba(255,0,0,.4)");
        if (w.rect) ctx.fillRect(w.x, w.y, w.w, w.h);
        else {
          ctx.beginPath();
          ctx.arc(w.x, w.y, w.r, 0, TAU, false);
          ctx.fill();
        }
      }
      ctx.setFillStyle("#fff");
      ctx.setFont("12px monospace");
      ctx.setTextAlign("center");
      const move = f.move;
      ctx.fillText(`${f.state}${move ? `:${move.id}` : ""} ${f.sf}`, f.x, f.y + 18);
    }
  }

  private drawFace(ctx: Draw2D, f: Fighter, x: number, y: number, w: number, h: number): void {
    const face = faces.get(f.charId + f.variant);
    if (face) ctx.drawImage(face, 0, 0, face.width, face.height, x, y, w, h);
  }

  drawOffscreen(ctx: Draw2D): void {
    for (const f of this.fighters) {
      if (f.state === "dead") continue;
      const sx = (f.x - this.cam.x) * this.cam.zoom + this.W / 2;
      const sy = (f.y - 55 * SZ - this.cam.y) * this.cam.zoom + this.H / 2;
      const m = 40;
      if (sx > -10 && sx < this.W + 10 && sy > -10 && sy < this.H + 10) continue;
      const cx = clamp(sx, m, this.W - m);
      const cy = clamp(sy, m, this.H - m);
      ctx.setFillStyle("rgba(0,0,0,.6)");
      ctx.setStrokeStyle(f.c.main);
      ctx.setLineWidth(4);
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, TAU, false);
      ctx.fill();
      ctx.stroke();
      this.drawFace(ctx, f, cx - 26, cy - 24, 52, 46);
      const a = Math.atan2(sy - cy, sx - cx);
      ctx.setFillStyle(f.c.main);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42);
      ctx.lineTo(cx + Math.cos(a + 0.5) * 30, cy + Math.sin(a + 0.5) * 30);
      ctx.lineTo(cx + Math.cos(a - 0.5) * 30, cy + Math.sin(a - 0.5) * 30);
      ctx.fill();
    }
  }

  drawPhoto(ctx: Draw2D): void {
    const photo = this.photo;
    if (!photo) return;
    const W = this.W;
    const H = this.H;
    const t = photo.t;
    ctx.setFillStyle("rgba(0,0,0,.25)");
    ctx.fillRect(0, 0, W, H);
    ctx.setStrokeStyle("#fff");
    ctx.setLineWidth(6);
    const m = 50;
    const L = 80;
    const corners = [m, m, 1, 1, W - m, m, -1, 1, m, H - m, 1, -1, W - m, H - m, -1, -1];
    for (let i = 0; i < corners.length; i += 4) {
      const x = corners[i];
      const y = corners[i + 1];
      const dx = corners[i + 2];
      const dy = corners[i + 3];
      ctx.beginPath();
      ctx.moveTo(x, y + dy * L);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * L, y);
      ctx.stroke();
    }
    if (t % 30 < 18) {
      ctx.setFillStyle("#ff2d2d");
      ctx.beginPath();
      ctx.arc(m + 40, m + 40, 10, 0, TAU, false);
      ctx.fill();
      ctx.setFillStyle("#fff");
      ctx.setFont("22px Bangers, Impact");
      ctx.setTextAlign("left");
      ctx.setTextBaseline("alphabetic");
      ctx.fillText("REC", m + 58, m + 48);
    }
    const n = t < 50 ? 3 : t < 80 ? 2 : t < 110 ? 1 : 0;
    if (n > 0) {
      ctx.setTextAlign("center");
      ctx.setFont(`${Math.round(H * 0.3)}px Bangers, Impact`);
      ctx.setFillStyle("rgba(255,255,255,.85)");
      ctx.fillText(`${n}`, W / 2, H * 0.55);
      ctx.setFont("28px Bangers, Impact");
      ctx.fillText("¡SONRÍAN! (o escóndanse detrás de Anthony)", W / 2, H * 0.68);
    }
  }

  drawBanners(ctx: Draw2D): void {
    const W = this.W;
    const H = this.H;
    for (const b of this.banners) {
      const k = b.t / b.dur;
      const sc = b.big ? 1 + Math.max(0, 1 - b.t / 8) * 1.5 : 1;
      ctx.save();
      ctx.setGlobalAlpha(k > 0.8 ? (1 - k) * 5 : 1);
      ctx.setTextAlign("center");
      ctx.setTextBaseline("middle");
      if (!b.big) {
        const x = W / 2 + (k < 0.15 ? (1 - k / 0.15) * W : k > 0.85 ? -((k - 0.85) / 0.15) * W : 0);
        ctx.setFillStyle("rgba(0,0,0,.6)");
        ctx.fillRect(0, H * 0.35 - 50, W, 90);
        ctx.setFillStyle(b.color);
        ctx.fillRect(0, H * 0.35 - 54, W, 4);
        ctx.fillRect(0, H * 0.35 + 40, W, 4);
        ctx.setFont(`${Math.round(Math.min(64, W / 14))}px Bangers, Impact`);
        ctx.setLineWidth(8);
        ctx.setStrokeStyle("#0d0b1a");
        ctx.strokeText(b.text, x, H * 0.35);
        ctx.setFillStyle("#fff");
        ctx.fillText(b.text, x, H * 0.35);
      } else {
        ctx.translate(W / 2, H * 0.42);
        ctx.scale(sc, sc);
        ctx.rotate(-0.05);
        ctx.setFont(`${Math.round(Math.min(180, W / 6))}px Bangers, Impact`);
        ctx.setLineWidth(16);
        ctx.setStrokeStyle("#0d0b1a");
        ctx.strokeText(b.text, 0, 0);
        ctx.setFillStyle(b.color);
        ctx.fillText(b.text, 0, 0);
      }
      ctx.restore();
    }
  }

  drawHUD(ctx: Draw2D): void {
    const W = this.W;
    const H = this.H;
    const n = this.fighters.length;
    const sc = clamp(Math.min(W / 1100, H / 700), 0.7, 1.3);
    for (let i = 0; i < n; i++) {
      const f = this.fighters[i];
      const cx = (W * (i + 1)) / (n + 1);
      const cy = H - 70 * sc;
      if (this.hudShake[i] > 0) this.hudShake[i] -= 1;
      const shake = this.hudShake[i];
      const shx = shake ? rand(-1, 1) * shake * 0.7 : 0;
      const shy = shake ? rand(-1, 1) * shake * 0.7 : 0;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      // Faded emblem.
      ctx.save();
      ctx.setGlobalAlpha(0.28);
      ctx.setFillStyle("#9aa0b8");
      ctx.setFont('bold 84px "Arial Black", Impact, sans-serif');
      ctx.setTextAlign("center");
      ctx.setTextBaseline("middle");
      ctx.fillText(EMBLEMS.get(f.charId) ?? "?", 50, -4);
      ctx.restore();
      // Portrait: the original baked a gradient tile with the face; draw the same layers directly.
      const dead = f.state === "dead";
      ctx.setFillStyle("#1a1020");
      ctx.fillRect(-122, -58, 68, 68);
      ctx.setFillStyle(f.c.main);
      ctx.fillRect(-120, -56, 64, 64);
      ctx.setFillStyle("rgba(255,255,255,.18)");
      ctx.fillRect(-120, -56, 64, 22);
      ctx.setFillStyle("rgba(0,0,0,.25)");
      ctx.fillRect(-120, -14, 64, 22);
      this.drawFace(ctx, f, -116, -50, 56, 58);
      if (dead) {
        ctx.setFillStyle("rgba(0,0,0,.55)");
        ctx.fillRect(-120, -56, 64, 64);
      }
      ctx.setStrokeStyle("#fff");
      ctx.setLineWidth(2);
      ctx.strokeRect(-121, -57, 66, 66);
      // Name ribbon.
      const tag = f.isCPU ? "#8a8a8a" : f.port === 0 ? "#d8232a" : "#2a5cd8";
      ctx.setFillStyle("#1a1020");
      ctx.beginPath();
      ctx.moveTo(-134, 30);
      ctx.lineTo(-6, 30);
      ctx.lineTo(-18, 6);
      ctx.lineTo(-124, 6);
      ctx.closePath();
      ctx.fill();
      ctx.setFillStyle(tag);
      ctx.beginPath();
      ctx.moveTo(-130, 27);
      ctx.lineTo(-11, 27);
      ctx.lineTo(-21, 9);
      ctx.lineTo(-121, 9);
      ctx.closePath();
      ctx.fill();
      ctx.setFillStyle("rgba(255,255,255,.35)");
      ctx.fillRect(-121, 9, 100, 3);
      ctx.setFont('italic 900 15px "Arial Black", Impact, sans-serif');
      ctx.setTextAlign("left");
      ctx.setTextBaseline("alphabetic");
      ctx.setLineWidth(4);
      ctx.setStrokeStyle("#1a1020");
      ctx.strokeText(f.char.name, -114, 24);
      ctx.setFillStyle("#fff");
      ctx.fillText(f.char.name, -114, 24);
      // Percent.
      const p = Math.floor(f.percent);
      const col = p < 1 ? "#fff" : `hsl(${clamp(55 - p * 0.45, 0, 55)},100%,${clamp(92 - p * 0.28, 32, 92)}%)`;
      ctx.save();
      ctx.translate(shx, shy);
      ctx.setTextAlign("right");
      const big = dead ? "" : `${p}`;
      ctx.setFont('italic 900 50px "Arial Black", Impact, sans-serif');
      ctx.setLineWidth(9);
      ctx.setStrokeStyle("#1a1020");
      ctx.strokeText(big, 70, 20);
      ctx.setFillStyle(col);
      ctx.fillText(big, 70, 20);
      ctx.setFont('italic 900 24px "Arial Black", Impact, sans-serif');
      if (!dead) {
        ctx.setLineWidth(6);
        ctx.strokeText("%", 98, 20);
        ctx.fillText("%", 98, 20);
      }
      ctx.restore();
      // Stocks (mini heads).
      if (f.stocks < 1000) {
        for (let s = 0; s < f.stocks; s++) this.drawFace(ctx, f, -44 + s * 26, -66, 26, 23);
      } else {
        ctx.setFont('bold 12px "Arial Black", sans-serif');
        ctx.setFillStyle("#fff");
        ctx.setTextAlign("left");
        ctx.fillText("∞", -40, -42);
      }
      // Super meter.
      const full = f.meter >= 100;
      ctx.setFillStyle("#1a1020");
      ctx.fillRect(-42, 30, 140, 9);
      ctx.setFillStyle(full ? (this.frame % 10 < 5 ? "#fff" : f.c.glow) : f.c.glow);
      ctx.fillRect(-40, 32, (136 * f.meter) / 100, 5);
      if (full) {
        ctx.setFont('italic 900 11px "Arial Black", sans-serif');
        ctx.setTextAlign("left");
        ctx.setFillStyle("#fff");
        ctx.setLineWidth(3);
        ctx.setStrokeStyle("#1a1020");
        ctx.strokeText("¡SÚPER! → ESPECIAL", -40, 52);
        ctx.fillText("¡SÚPER! → ESPECIAL", -40, 52);
      }
      ctx.restore();
    }
  }
}

// A projectile's damage fields as a hitbox, for resolveHit.
function projectileHitbox(p: Projectile): Hitbox {
  return H(0, 0, 0, 0, p.r, p.d, p.a, p.b, p.k, { fkb: p.fkb, fx: p.fx, noFlinch: p.noFlinch });
}
