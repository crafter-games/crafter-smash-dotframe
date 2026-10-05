// Visual effects, ported from js/effects.js.
import type { Draw2D } from "../../vendor/dotframe/src/draw2d";
import type { Fighter } from "./fighter";
import { BASE_POSE, mergePose, type Pose } from "./pose";
import { drawFighterBody, drawSpriteWorld } from "./sprites";
import { clamp, lerp, rand, randi, random, TAU } from "./util";
import { dcos, dsin } from "../../vendor/dotframe/src/detmath";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  drag: number;
  kind: string;
}

interface FloatText {
  x: number;
  y: number;
  str: string;
  color: string;
  size: number;
  life: number;
  max: number;
  vy: number;
}

export interface ParticleOptions {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life?: number;
  size?: number;
  color?: string;
  grav?: number;
  drag?: number;
  kind?: string;
}

export interface TextOptions {
  vy?: number;
  life?: number;
  max?: number;
}

interface Ghost {
  x: number;
  y: number;
  facing: number;
  pose: Pose;
  f: Fighter;
  life: number;
  color: string;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  life: number;
  maxLife: number;
  color: string;
  w: number;
  hex: boolean;
}

interface Beam {
  x: number;
  y: number;
  a: number;
  len: number;
  life: number;
  maxLife: number;
  color: string;
  w: number;
}

interface StarKO {
  x: number;
  y: number;
  f: Fighter;
  t: number;
}

const pick = (values: string[]): string => values[Math.floor(random() * values.length)];

export class Effects {
  parts: Particle[] = [];
  texts: FloatText[] = [];
  ghosts: Ghost[] = [];
  rings: Ring[] = [];
  beams: Beam[] = [];
  stars: StarKO[] = [];

  clear(): void {
    this.stars = [];
    this.parts = [];
    this.texts = [];
    this.ghosts = [];
    this.rings = [];
    this.beams = [];
  }

  private particle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    kind: string,
    drag: number,
  ): void {
    this.parts.push({ x, y, vx, vy, life, max: life, size, color, grav: 0, drag, kind });
  }

  private ring(x: number, y: number, r: number, max: number, life: number, color: string, w: number, hex: boolean): void {
    this.rings.push({ x, y, r, max, life, maxLife: life, color, w, hex });
  }

  // Raw particle, as js/effects.js p(o).
  p(o: ParticleOptions): void {
    const life = o.life ?? 20;
    this.parts.push({
      x: o.x,
      y: o.y,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      life,
      max: life,
      size: o.size ?? 4,
      color: o.color ?? "#fff",
      grav: o.grav ?? 0,
      drag: o.drag ?? 0.92,
      kind: o.kind ?? "dot",
    });
  }

  spark(x: number, y: number, power: number, color: string): void {
    const n = Math.floor(6 + power * 6);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(3, 9) * (0.6 + power * 0.5);
      this.particle(x, y, dcos(a) * s, dsin(a) * s, randi(10, 18), rand(2, 4) + power, i % 2 ? "#fff" : color, "line", 0.92);
    }
    this.ring(x, y, 6, 26 + power * 26, 12, color, 4 + power * 2, false);
  }

  hitSpark(x: number, y: number, kb: number, color: string, type: string): void {
    const power = clamp(kb / 70, 0.3, 3.2);
    this.spark(x, y, power, color);
    if (type === "fire") this.fire(x, y, 6 + power * 4);
    if (type === "meteor") for (let i = 0; i < 14; i++) this.particle(x, y, rand(-3, 3), rand(4, 14), 22, 5, "#ffd23f", "line", 0.92);
    if (type === "peace") {
      for (let i = 0; i < 6; i++) this.text(x + rand(-30, 30), y + rand(-30, 30), "✌", "#b8ff3a", 22, { vy: rand(-3, -1), life: 30 });
    }
    if (type === "flash") this.ring(x, y, 10, 140, 16, "#fff", 10, false);
    if (type === "shine") this.ring(x, y, 10, 70, 10, "#7cf6ff", 6, true);
    if (power > 1.6) {
      this.ring(x, y, 20, 200 * power * 0.6, 20, "#fff", 3, false);
      for (let i = 0; i < 4; i++) {
        this.beams.push({ x, y, a: rand(0, TAU), len: rand(160, 320) * power * 0.6, life: 10, maxLife: 10, color: "#fff", w: rand(6, 14) });
      }
    }
  }

  dust(x: number, y: number, dir: number, n: number): void {
    this.dustColored(x, y, dir, n, "rgba(230,220,255,.7)");
  }

  dustColored(x: number, y: number, dir: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      this.particle(
        x + rand(-10, 10),
        y - rand(0, 6),
        dir * rand(1, 4) + rand(-1.5, 1.5),
        rand(-2.5, -0.5),
        randi(16, 28),
        rand(5, 11),
        color,
        "puff",
        0.9,
      );
    }
  }

  fire(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.particle(
        x + rand(-14, 14),
        y + rand(-14, 14),
        rand(-1.5, 1.5),
        rand(-3.5, -1),
        randi(14, 24),
        rand(6, 13),
        pick(["#ffd23f", "#ff8c1a", "#ff4d2e"]),
        "puff",
        0.95,
      );
    }
  }

  sparkle(x: number, y: number, color: string): void {
    this.particle(x + rand(-10, 10), y + rand(-10, 10), rand(-1, 1), rand(-2, 0), 16, rand(3, 6), color, "star", 0.92);
  }

  swirl(x: number, y: number, color: string): void {
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU);
      this.particle(x + dcos(a) * 36, y + dsin(a) * 36, -dsin(a) * 4, dcos(a) * 4, 14, 4, color, "line", 0.92);
    }
  }

  text(x: number, y: number, str: string, color: string, size: number, options: TextOptions): void {
    const life = options.life ?? 50;
    this.texts.push({ x, y, str, color, size, life, max: options.max ?? (options.life !== undefined ? life : 50), vy: options.vy ?? -1.2 });
  }

  afterimage(f: Fighter): void {
    this.ghosts.push({ x: f.x, y: f.y, facing: f.facing, pose: f.pose, f, life: 12, color: f.c.glow });
  }

  koBlast(x: number, y: number, ang: number, color: string): void {
    for (let i = 0; i < 7; i++) {
      this.beams.push({ x, y, a: ang + rand(-0.35, 0.35), len: rand(600, 1300), life: 40, maxLife: 40, color: i % 2 ? "#fff" : color, w: rand(20, 70) });
    }
    this.ring(x, y, 30, 500, 30, color, 18, false);
    for (let i = 0; i < 40; i++) {
      const a = ang + rand(-0.7, 0.7);
      const s = rand(6, 24);
      this.particle(x, y, dcos(a) * s, dsin(a) * s, randi(20, 50), rand(4, 10), pick([color, "#fff", "#ffd23f"]), "line", 0.96);
    }
  }

  starKO(x: number, y: number, f: Fighter): void {
    this.stars.push({ x, y, f, t: 0 });
  }

  shockwave(x: number, y: number, color: string, max: number): void {
    this.ring(x, y, 8, max, 14, color, 5, false);
  }

  update(): void {
    for (const p of this.parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.grav;
      p.life -= 1;
    }
    this.parts = this.parts.filter((p: Particle): boolean => p.life > 0);
    for (const t of this.texts) {
      t.y += t.vy;
      t.vy *= 0.96;
      t.life -= 1;
    }
    this.texts = this.texts.filter((t: FloatText): boolean => t.life > 0);
    for (const r of this.rings) {
      r.life -= 1;
      r.r = lerp(r.r, r.max, 0.25);
    }
    this.rings = this.rings.filter((r: Ring): boolean => r.life > 0);
    for (const b of this.beams) b.life -= 1;
    this.beams = this.beams.filter((b: Beam): boolean => b.life > 0);
    for (const st of this.stars) st.t += 1;
    this.stars = this.stars.filter((st: StarKO): boolean => st.t < 90);
    for (const gh of this.ghosts) gh.life -= 1;
    this.ghosts = this.ghosts.filter((gh: Ghost): boolean => gh.life > 0);
  }

  drawBack(ctx: Draw2D): void {
    for (const st of this.stars) {
      const k = st.t / 90;
      if (k < 0.7) {
        const sc = 1 - (k / 0.7) * 0.9;
        ctx.save();
        ctx.translate(st.x, st.y + k * 40);
        ctx.scale(sc, sc);
        ctx.rotate(st.t * 0.4);
        drawSpriteWorld(ctx, st.f, mergePose(BASE_POSE, { armF: [170, 0], armB: [-170, 0], legF: [30, 0], legB: [-30, 0] }), 0, 55, 1, 1, "");
        ctx.restore();
      } else {
        const a = (k - 0.7) / 0.3;
        const s2 = 40 * dsin(a * Math.PI);
        ctx.setFillStyle("#fff");
        ctx.beginPath();
        ctx.moveTo(st.x, st.y + 28 - s2);
        ctx.lineTo(st.x + s2 * 0.25, st.y + 28);
        ctx.lineTo(st.x, st.y + 28 + s2);
        ctx.lineTo(st.x - s2 * 0.25, st.y + 28);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(st.x - s2, st.y + 28);
        ctx.lineTo(st.x, st.y + 28 + s2 * 0.25);
        ctx.lineTo(st.x + s2, st.y + 28);
        ctx.lineTo(st.x, st.y + 28 - s2 * 0.25);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const gh of this.ghosts) drawFighterBody(ctx, gh.f, gh.pose, gh.x, gh.y, gh.facing, (gh.life / 12) * 0.45, gh.color);
  }

  draw(ctx: Draw2D): void {
    for (const b of this.beams) {
      const k = b.life / b.maxLife;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.setGlobalAlpha(k);
      ctx.setFillStyle(b.color);
      ctx.beginPath();
      ctx.moveTo(0, (-b.w * k) / 2);
      ctx.lineTo(b.len, 0);
      ctx.lineTo(0, (b.w * k) / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (const r of this.rings) {
      ctx.setGlobalAlpha(r.life / r.maxLife);
      ctx.setStrokeStyle(r.color);
      ctx.setLineWidth(r.w * (r.life / r.maxLife) + 1);
      ctx.beginPath();
      if (r.hex) {
        for (let i = 0; i <= 6; i++) {
          const a = (i * TAU) / 6;
          const px = r.x + dcos(a) * r.r;
          const py = r.y + dsin(a) * r.r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      } else {
        ctx.arc(r.x, r.y, r.r, 0, TAU, false);
      }
      ctx.stroke();
    }
    for (const p of this.parts) {
      const k = p.life / p.max;
      ctx.setGlobalAlpha(clamp(k * 1.4, 0, 1));
      ctx.setFillStyle(p.color);
      ctx.setStrokeStyle(p.color);
      if (p.kind === "line") {
        ctx.setLineWidth(p.size);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        ctx.stroke();
      } else if (p.kind === "puff") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + (1 - k) * 0.8), 0, TAU, false);
        ctx.fill();
      } else if (p.kind === "star") {
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s * 2);
        ctx.lineTo(p.x + s * 0.5, p.y - s * 0.5);
        ctx.lineTo(p.x + s * 2, p.y);
        ctx.lineTo(p.x + s * 0.5, p.y + s * 0.5);
        ctx.lineTo(p.x, p.y + s * 2);
        ctx.lineTo(p.x - s * 0.5, p.y + s * 0.5);
        ctx.lineTo(p.x - s * 2, p.y);
        ctx.lineTo(p.x - s * 0.5, p.y - s * 0.5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.setGlobalAlpha(1);
    ctx.setTextAlign("center");
    ctx.setTextBaseline("alphabetic");
    for (const t of this.texts) {
      const k = t.life / t.max;
      ctx.setGlobalAlpha(clamp(k * 2, 0, 1));
      const sc = 1 + Math.max(0, t.life - t.max + 6) * 0.08;
      ctx.setFont(`${Math.round(t.size * sc)}px Bangers, Impact, sans-serif`);
      ctx.setLineWidth(5);
      ctx.setStrokeStyle("#0d0b1a");
      ctx.strokeText(t.str, t.x, t.y);
      ctx.setFillStyle(t.color);
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.setGlobalAlpha(1);
  }
}
