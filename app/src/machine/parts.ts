/** The parts of the Machine map. Each is also the ID of the Concept card it opens, which the build checks. */
export type PartId = 'disk' | 'ram' | 'py' | 'code' | 'heap' | 'stack' | 'cpu' | 'reg' | 'cache' | 'os' | 'screen';

export interface Part {
  name: string;
  /** Its technical name, or what it is, in small print after the name. */
  sub?: string;
  /** How big and how fast it is, next to its name when it is lit. */
  sizeAndSpeed?: string;
}

/** Every part, with the words the map shows on it, as in prototype v8. */
export const PARTS: Record<PartId, Part> = {
  disk: { name: 'Disk', sub: 'storage', sizeAndSpeed: 'huge · slow' },
  ram: { name: 'RAM', sub: 'memory', sizeAndSpeed: 'big · fast' },
  py: { name: 'Python itself', sub: 'the interpreter' },
  code: { name: 'Your steps', sub: 'bytecode' },
  heap: { name: 'Objects', sub: 'heap' },
  stack: { name: 'Plates', sub: 'stack' },
  cpu: { name: 'CPU', sub: 'processor' },
  reg: { name: 'Registers', sizeAndSpeed: 'tiny · fastest' },
  cache: { name: 'Cache', sizeAndSpeed: 'small · very fast' },
  os: { name: 'Operating system', sub: 'kernel' },
  screen: { name: 'Screen', sub: 'pixels' },
};

/** Template IDs that start with this are Machine map notes. */
export const MAP_NOTE = 'map.';
