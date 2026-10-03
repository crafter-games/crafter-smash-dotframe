// Move callbacks referenced by characters-data.ts. Each starts as a no-op and is ported from move-handlers.reference.js.
import type { Draw2D } from "../../../dotframe/src/draw2d";
import type { Fighter } from "./fighter";
import type { Game } from "./game";
import type { PoseOverride } from "./pose";

export const railly_dashattack_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const railly_usmash_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const railly_dsmash_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const railly_dsmash_drawOver = (_ctx: Draw2D, _f: Fighter, _g: Game): void => {};

export const railly_nspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const railly_sspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const railly_uspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const railly_dspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const railly_taunt_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const railly_taunt_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const railly_taunt_drawOver = (_ctx: Draw2D, _f: Fighter, _g: Game): void => {};

export const railly_final_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const railly_dashgrab_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const anthony_utilt_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const anthony_dashattack_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const anthony_dsmash_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const anthony_nair_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const anthony_dair_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const anthony_nspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const anthony_sspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const anthony_uspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const anthony_uspecial_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const anthony_dspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const anthony_counterHit_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const anthony_taunt_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const anthony_taunt_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const anthony_final_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const jibaru_nspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const jibaru_sspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const jibaru_uspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const jibaru_uspecial_drawOver = (_ctx: Draw2D, _f: Fighter, _g: Game): void => {};

export const jibaru_dspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const jibaru_final_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const jibaru_taunt_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const jibaru_taunt_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const edward_nspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const edward_sspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const edward_uspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const edward_uspecial_drawOver = (_ctx: Draw2D, _f: Fighter, _g: Game): void => {};

export const edward_dspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const edward_final_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const edward_final_drawOver = (_ctx: Draw2D, _f: Fighter, _g: Game): void => {};

export const edward_taunt_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const edward_taunt_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const edward_taunt_drawOver = (_ctx: Draw2D, _f: Fighter, _g: Game): void => {};

export const shiara_dashattack_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const shiara_nspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const shiara_sspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const shiara_uspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const shiara_uspecial_drawOver = (_ctx: Draw2D, _f: Fighter, _g: Game): void => {};

export const shiara_dspecial_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const shiara_final_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const shiara_taunt_update = (_f: Fighter, _sf: number, _g: Game): void => {};

export const shiara_taunt_anim = (_f: Fighter, _sf: number): PoseOverride | null => null;

export const shiara_taunt_drawOver = (_ctx: Draw2D, _f: Fighter, _g: Game): void => {};
