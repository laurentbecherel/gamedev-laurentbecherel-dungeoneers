// Material ID constants and lookup helpers — stub for Task 2, full PBR in Task 5

export const GRID_FLOOR = 0;

export const WALL_MATERIALS = { DUNGEON_BRICK: 1, ROUGH_STONE: 2 };
export const FLOOR_MATERIALS = { STONE_SLABS: 1, COBBLESTONE: 2 };
export const CEIL_MATERIALS = { FLAT_SLABS: 1, WOODEN_BEAMS: 2 };
export const BOUNDARY_WALL_ID = 1;
export const STAIRS_MATERIAL_ID = 2; // highest available in Task 2 scope

export function isWall(cellValue) { return cellValue > 0; }
export function isFloor(cellValue) { return cellValue === GRID_FLOOR; }

// Deco bitmask constants
export const DECO_COLUMN = 1;
export const DECO_MOSS = 2;
export const DECO_VINES = 4;
export const DECO_ARCH = 8;
export const DECO_BROKEN = 16;
export const DECO_PUDDLE = 32;
export const DECO_ROOTS = 64;
export const DECO_BEAM = 128;
