import type { ToolId } from '../store/app-state';
import { BoxShapeTool } from './box-shape-tool';
import { EraserTool } from './eraser-tool';
import { FreedrawTool } from './freedraw-tool';
import { HandTool } from './hand-tool';
import { LinearTool } from './linear-tool';
import { SelectTool } from './select-tool';
import { TextTool } from './text-tool';
import type { Tool } from './tool';

export type ToolRegistry = Readonly<Record<ToolId, Tool>>;

/** Fresh tool instances (tools hold per-gesture state, so one set per editor). */
export function createTools(): ToolRegistry {
  return {
    select: new SelectTool(),
    hand: new HandTool(),
    rectangle: new BoxShapeTool('rectangle'),
    diamond: new BoxShapeTool('diamond'),
    ellipse: new BoxShapeTool('ellipse'),
    line: new LinearTool('line'),
    arrow: new LinearTool('arrow'),
    freedraw: new FreedrawTool(),
    text: new TextTool(),
    eraser: new EraserTool(),
  };
}

export type { PointerInput, Tool, ToolContext } from './tool';
