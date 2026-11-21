import type { ToolId } from '../store/app-state';
import { BoxShapeTool } from './box-shape-tool';
import { FreedrawTool } from './freedraw-tool';
import { LinearTool } from './linear-tool';
import { SelectTool } from './select-tool';
import type { Tool } from './tool';

export type ToolRegistry = Readonly<Record<ToolId, Tool>>;

/** Fresh tool instances (tools hold per-gesture state, so one set per editor). */
export function createTools(): ToolRegistry {
  return {
    select: new SelectTool(),
    rectangle: new BoxShapeTool('rectangle'),
    diamond: new BoxShapeTool('diamond'),
    ellipse: new BoxShapeTool('ellipse'),
    line: new LinearTool('line'),
    arrow: new LinearTool('arrow'),
    freedraw: new FreedrawTool(),
  };
}

export type { PointerInput, Tool, ToolContext } from './tool';
