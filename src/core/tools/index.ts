import type { ToolId } from '../store/app-state';
import { RectangleTool } from './rectangle-tool';
import { SelectTool } from './select-tool';
import type { Tool } from './tool';

export type ToolRegistry = Readonly<Record<ToolId, Tool>>;

/** Fresh tool instances (tools hold per-gesture state, so one set per editor). */
export function createTools(): ToolRegistry {
  return { select: new SelectTool(), rectangle: new RectangleTool() };
}

export type { PointerInput, Tool, ToolContext } from './tool';
