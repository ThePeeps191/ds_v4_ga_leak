// ============ Block definitions ============
// tex: [top, side, bottom] atlas indices
const BLOCKS = {
  0:  { name: 'Air', solid: false },
  1:  { name: 'Grass Block', tex: [0, 1, 2], hard: 0.7, drop: { id: 'ferrite', n: 2 }, tintTop: true },
  2:  { name: 'Dirt', tex: [2, 2, 2], hard: 0.6, drop: { id: 'ferrite', n: 2 } },
  3:  { name: 'Rock', tex: [3, 3, 3], hard: 1.4, drop: { id: 'ferrite', n: 3 } },
  4:  { name: 'Magnetized Ore Vein', tex: [4, 4, 4], hard: 2.0, drop: { id: 'magferrite', n: 2 } },
  5:  { name: 'Copper Ore Vein', tex: [5, 5, 5], hard: 1.8, drop: { id: 'copper', n: 2 } },
  6:  { name: 'Carbon-Rich Trunk', tex: [7, 6, 7], hard: 1.0, drop: { id: 'carbon', n: 3 } },
  7:  { name: 'Foliage', tex: [8, 8, 8], hard: 0.25, drop: { id: 'carbon', n: 1 }, tint: true, translucent: true },
  8:  { name: 'Gravel', tex: [9, 9, 9], hard: 0.5, drop: { id: 'ferrite', n: 2 } },
  9:  { name: 'Sodium Flower', tex: [10, 10, 10], hard: 0.2, drop: { id: 'sodium', n: 8 }, cross: true, light: 0.4 },
  10: { name: 'Di-hydrogen Crystal', tex: [11, 11, 11], hard: 1.2, drop: { id: 'dihydrogen', n: 12 }, translucent: true, light: 0.5 },
  11: { name: 'Oxygen-Rich Red Flower', tex: [12, 12, 12], hard: 0.2, drop: { id: 'oxygen', n: 8 }, cross: true },
  12: { name: 'Weathered Stone', tex: [13, 13, 13], hard: 1.4, drop: { id: 'ferrite', n: 3 } },
  13: { name: 'Terrain Block', tex: [14, 14, 14], hard: 0.5, drop: { id: 'ferrite', n: 1 } },
  14: { name: 'Cobalt Crystal Cluster', tex: [15, 15, 15], hard: 1.5, drop: { id: 'cobalt', n: 4 }, translucent: true, light: 0.4 },
};
const BLOCK_AIR = 0;
