import type { ReactNode } from 'react';
import { COMMANDS, type CommandId } from '../core/actions/commands';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { useEditorState } from './hooks/useEditorState';
import {
  AlignIcon,
  BackwardIcon,
  DistributeIcon,
  DuplicateIcon,
  FlipIcon,
  ForwardIcon,
  GroupIcon,
  LockIcon,
  ToBackIcon,
  ToFrontIcon,
  TrashIcon,
  UngroupIcon,
} from './icons';

interface ArrangeButton {
  readonly id: CommandId;
  readonly icon: ReactNode;
}

const LAYERS: readonly ArrangeButton[] = [
  { id: 'z.back', icon: <ToBackIcon /> },
  { id: 'z.backward', icon: <BackwardIcon /> },
  { id: 'z.forward', icon: <ForwardIcon /> },
  { id: 'z.front', icon: <ToFrontIcon /> },
];

const ALIGN: readonly ArrangeButton[] = [
  { id: 'align.left', icon: <AlignIcon kind="left" /> },
  { id: 'align.centerX', icon: <AlignIcon kind="centerX" /> },
  { id: 'align.right', icon: <AlignIcon kind="right" /> },
  { id: 'distribute.x', icon: <DistributeIcon axis="x" /> },
  { id: 'align.top', icon: <AlignIcon kind="top" /> },
  { id: 'align.centerY', icon: <AlignIcon kind="centerY" /> },
  { id: 'align.bottom', icon: <AlignIcon kind="bottom" /> },
  { id: 'distribute.y', icon: <DistributeIcon axis="y" /> },
];

const ACTIONS: readonly ArrangeButton[] = [
  { id: 'edit.duplicate', icon: <DuplicateIcon /> },
  { id: 'edit.delete', icon: <TrashIcon /> },
  { id: 'edit.group', icon: <GroupIcon /> },
  { id: 'edit.ungroup', icon: <UngroupIcon /> },
  { id: 'edit.flipH', icon: <FlipIcon axis="horizontal" /> },
  { id: 'edit.flipV', icon: <FlipIcon axis="vertical" /> },
  { id: 'edit.lock', icon: <LockIcon /> },
];

function ButtonGrid({ buttons }: { buttons: readonly ArrangeButton[] }) {
  const app = useApp();
  // Re-render on any state change so enabled flags stay current.
  const state = useEditorState((s) => s);
  return (
    <div className="arrange-grid">
      {buttons.map((b) => {
        const cmd = COMMANDS[b.id];
        const label = t(cmd.labelKey);
        const key = app.keymap.shortcutFor(b.id);
        const title = key === undefined ? label : t('shortcut.withKey', { label, key });
        return (
          <button
            key={b.id}
            type="button"
            className="style-option"
            aria-label={title}
            title={title}
            disabled={cmd.enabled ? !cmd.enabled(state) : false}
            onClick={() => {
              app.runCommand(b.id);
            }}
          >
            {b.icon}
          </button>
        );
      })}
    </div>
  );
}

/** Layer order, alignment and element actions for the current selection. */
export function ArrangeSection() {
  return (
    <>
      <div className="style-section" role="group" aria-labelledby="arrange-layers">
        <div className="style-section-title" id="arrange-layers">
          {t('arrange.layers')}
        </div>
        <ButtonGrid buttons={LAYERS} />
      </div>
      <div className="style-section" role="group" aria-labelledby="arrange-align">
        <div className="style-section-title" id="arrange-align">
          {t('arrange.align')}
        </div>
        <ButtonGrid buttons={ALIGN} />
      </div>
      <div className="style-section" role="group" aria-labelledby="arrange-actions">
        <div className="style-section-title" id="arrange-actions">
          {t('arrange.actions')}
        </div>
        <ButtonGrid buttons={ACTIONS} />
      </div>
    </>
  );
}
