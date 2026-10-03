// Character lookup over the generated data.
import { CHARACTERS } from "./characters-data";
import type { Character } from "./types";

export const CHAR_IDS: string[] = CHARACTERS.map((c: Character): string => c.id);

export function getCharacter(id: string): Character {
  for (const c of CHARACTERS) if (c.id === id) return c;
  return CHARACTERS[0];
}
