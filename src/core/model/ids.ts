import type { ElementId, GroupId } from './types';

export function createElementId(): ElementId {
  return crypto.randomUUID() as ElementId;
}

/** Random non-zero 32-bit unsigned seed. */
export function createSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 1;
}

export function createGroupId(): GroupId {
  return crypto.randomUUID() as GroupId;
}
