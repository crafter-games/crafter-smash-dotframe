// Procedural skeleton poses, ported from js/util.js.
// Angles in degrees. Limbs: 0 hangs down, 90 points forward, 180 points up. The second value bends the elbow or knee.
import { lerp } from "./util";

export interface Pose {
  lean: number;
  crouch: number;
  rot: number;
  yOff: number;
  headTilt: number;
  scale: number;
  armF: number[];
  armB: number[];
  legF: number[];
  legB: number[];
  prop: string;
  // Sprite frame chosen for this pose, and its extra rotation in degrees.
  sprAnim: string;
  sprIndex: number;
  sprRot: number;
}

// Partial pose used by move definitions; absent fields keep the base value.
export interface PoseOverride {
  lean?: number;
  crouch?: number;
  rot?: number;
  yOff?: number;
  headTilt?: number;
  scale?: number;
  armF?: number[];
  armB?: number[];
  legF?: number[];
  legB?: number[];
  prop?: string;
}

export const BASE_POSE: Pose = {
  lean: 4,
  crouch: 0,
  rot: 0,
  yOff: 0,
  headTilt: 0,
  scale: 1,
  armF: [22, 40],
  armB: [-18, 30],
  legF: [10, -12],
  legB: [-8, -6],
  prop: "",
  sprAnim: "",
  sprIndex: 0,
  sprRot: 0,
};

const copy = (limb: number[]): number[] => [limb[0], limb[1]];

export function mergePose(base: Pose, over: PoseOverride | null): Pose {
  if (!over) {
    return {
      lean: base.lean,
      crouch: base.crouch,
      rot: base.rot,
      yOff: base.yOff,
      headTilt: base.headTilt,
      scale: base.scale,
      armF: copy(base.armF),
      armB: copy(base.armB),
      legF: copy(base.legF),
      legB: copy(base.legB),
      prop: base.prop,
      sprAnim: base.sprAnim,
      sprIndex: base.sprIndex,
      sprRot: base.sprRot,
    };
  }
  const armF = over.armF;
  const armB = over.armB;
  const legF = over.legF;
  const legB = over.legB;
  return {
    lean: over.lean ?? base.lean,
    crouch: over.crouch ?? base.crouch,
    rot: over.rot ?? base.rot,
    yOff: over.yOff ?? base.yOff,
    headTilt: over.headTilt ?? base.headTilt,
    scale: over.scale ?? base.scale,
    armF: armF ? copy(armF) : copy(base.armF),
    armB: armB ? copy(armB) : copy(base.armB),
    legF: legF ? copy(legF) : copy(base.legF),
    legB: legB ? copy(legB) : copy(base.legB),
    prop: over.prop ?? base.prop,
    sprAnim: base.sprAnim,
    sprIndex: base.sprIndex,
    sprRot: base.sprRot,
  };
}

const lerpLimb = (a: number[], b: number[], t: number): number[] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    lean: lerp(a.lean, b.lean, t),
    crouch: lerp(a.crouch, b.crouch, t),
    rot: lerp(a.rot, b.rot, t),
    yOff: lerp(a.yOff, b.yOff, t),
    headTilt: lerp(a.headTilt, b.headTilt, t),
    scale: lerp(a.scale, b.scale, t),
    armF: lerpLimb(a.armF, b.armF, t),
    armB: lerpLimb(a.armB, b.armB, t),
    legF: lerpLimb(a.legF, b.legF, t),
    legB: lerpLimb(a.legB, b.legB, t),
    prop: t < 0.5 ? a.prop : b.prop,
    sprAnim: t < 0.5 ? a.sprAnim : b.sprAnim,
    sprIndex: t < 0.5 ? a.sprIndex : b.sprIndex,
    sprRot: t < 0.5 ? a.sprRot : b.sprRot,
  };
}
