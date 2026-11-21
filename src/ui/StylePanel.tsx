import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyStyle,
  getStyleView,
  type StylePatch,
  type StyleView,
} from '../core/actions/style-actions';
import { FILL_PALETTE, normalizeHex, STROKE_PALETTE } from '../core/model/palette';
import type {
  Arrowhead,
  Corners,
  FillStyle,
  FontFamily,
  LinearCurve,
  Roughness,
  StrokePattern,
  StrokeWidth,
  TextAlign,
  VerticalAlign,
} from '../core/model/types';
import { selectedIds } from '../core/store/app-state';
import { boundTextOf } from '../core/text/bound';
import { clampFontSize, FONT_STACKS } from '../core/text/fonts';
import type { I18nKey } from '../i18n/en';
import { t } from '../i18n/t';
import { useApp } from './app-context';
import { ArrangeSection } from './ArrangeSection';
import { useEditorState } from './hooks/useEditorState';
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  VAlignBottomIcon,
  VAlignMiddleIcon,
  VAlignTopIcon,
  CornersRoundedIcon,
  CornersSharpIcon,
  EyedropperIcon,
  FillCrossHatchIcon,
  FillHatchIcon,
  FillNoneIcon,
  FillSolidIcon,
  PathCurvedIcon,
  PathStraightIcon,
  PatternDashedIcon,
  PatternDottedIcon,
  PatternSolidIcon,
  RoughCleanIcon,
  RoughLooseIcon,
  RoughSketchyIcon,
  WidthIcon,
} from './style-icons';

// --- Native EyeDropper (Chromium only), typed locally -----------------
interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}
type EyeDropperCtor = new () => EyeDropperLike;
const EyeDropperImpl: EyeDropperCtor | undefined = (
  globalThis as unknown as { EyeDropper?: EyeDropperCtor }
).EyeDropper;

interface Option<V> {
  readonly value: V;
  readonly labelKey: I18nKey;
  readonly icon: ReactNode;
}

const FILL_OPTIONS: readonly Option<FillStyle>[] = [
  { value: 'none', labelKey: 'style.fill.none', icon: <FillNoneIcon /> },
  { value: 'solid', labelKey: 'style.fill.solid', icon: <FillSolidIcon /> },
  { value: 'hatch', labelKey: 'style.fill.hatch', icon: <FillHatchIcon /> },
  { value: 'cross-hatch', labelKey: 'style.fill.crossHatch', icon: <FillCrossHatchIcon /> },
];

const WIDTH_OPTIONS: readonly Option<StrokeWidth>[] = [
  { value: 'thin', labelKey: 'style.width.thin', icon: <WidthIcon weight={1} /> },
  { value: 'medium', labelKey: 'style.width.medium', icon: <WidthIcon weight={2} /> },
  { value: 'bold', labelKey: 'style.width.bold', icon: <WidthIcon weight={3.5} /> },
  { value: 'extra', labelKey: 'style.width.extra', icon: <WidthIcon weight={5} /> },
];

const PATTERN_OPTIONS: readonly Option<StrokePattern>[] = [
  { value: 'solid', labelKey: 'style.pattern.solid', icon: <PatternSolidIcon /> },
  { value: 'dashed', labelKey: 'style.pattern.dashed', icon: <PatternDashedIcon /> },
  { value: 'dotted', labelKey: 'style.pattern.dotted', icon: <PatternDottedIcon /> },
];

const ROUGHNESS_OPTIONS: readonly Option<Roughness>[] = [
  { value: 0, labelKey: 'style.roughness.clean', icon: <RoughCleanIcon /> },
  { value: 1, labelKey: 'style.roughness.sketchy', icon: <RoughSketchyIcon /> },
  { value: 2, labelKey: 'style.roughness.loose', icon: <RoughLooseIcon /> },
];

const CORNER_OPTIONS: readonly Option<Corners>[] = [
  { value: 'sharp', labelKey: 'style.corners.sharp', icon: <CornersSharpIcon /> },
  { value: 'rounded', labelKey: 'style.corners.rounded', icon: <CornersRoundedIcon /> },
];

const PATH_OPTIONS: readonly Option<LinearCurve>[] = [
  { value: 'straight', labelKey: 'style.path.straight', icon: <PathStraightIcon /> },
  { value: 'curved', labelKey: 'style.path.curved', icon: <PathCurvedIcon /> },
];

const HEADS: readonly { value: Arrowhead; labelKey: I18nKey }[] = [
  { value: 'none', labelKey: 'style.head.none' },
  { value: 'arrow', labelKey: 'style.head.arrow' },
  { value: 'triangle', labelKey: 'style.head.triangle' },
  { value: 'bar', labelKey: 'style.head.bar' },
  { value: 'dot', labelKey: 'style.head.dot' },
  { value: 'diamond', labelKey: 'style.head.diamond' },
];

const fontGlyph = (family: FontFamily) => (
  <span className="font-glyph" style={{ fontFamily: FONT_STACKS[family] }} aria-hidden="true">
    Aa
  </span>
);

const FONT_OPTIONS: readonly Option<FontFamily>[] = [
  { value: 'hand', labelKey: 'style.font.hand', icon: fontGlyph('hand') },
  { value: 'sans', labelKey: 'style.font.sans', icon: fontGlyph('sans') },
  { value: 'mono', labelKey: 'style.font.mono', icon: fontGlyph('mono') },
];

const sizeGlyph = (text: string) => (
  <span className="size-glyph" aria-hidden="true">
    {text}
  </span>
);

const SIZE_OPTIONS: readonly Option<number>[] = [
  { value: 16, labelKey: 'style.fontSize.s', icon: sizeGlyph('S') },
  { value: 20, labelKey: 'style.fontSize.m', icon: sizeGlyph('M') },
  { value: 28, labelKey: 'style.fontSize.l', icon: sizeGlyph('L') },
  { value: 36, labelKey: 'style.fontSize.xl', icon: sizeGlyph('XL') },
];

const ALIGN_OPTIONS: readonly Option<TextAlign>[] = [
  { value: 'left', labelKey: 'style.textAlign.left', icon: <AlignLeftIcon /> },
  { value: 'center', labelKey: 'style.textAlign.center', icon: <AlignCenterIcon /> },
  { value: 'right', labelKey: 'style.textAlign.right', icon: <AlignRightIcon /> },
];

const VALIGN_OPTIONS: readonly Option<VerticalAlign>[] = [
  { value: 'top', labelKey: 'style.verticalAlign.top', icon: <VAlignTopIcon /> },
  { value: 'middle', labelKey: 'style.verticalAlign.middle', icon: <VAlignMiddleIcon /> },
  { value: 'bottom', labelKey: 'style.verticalAlign.bottom', icon: <VAlignBottomIcon /> },
];

function FontSizeInput({
  value,
  onCommit,
}: {
  value: number | 'mixed';
  onCommit: (v: number) => void;
}) {
  const shown = value === 'mixed' ? '' : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => {
    setText(shown);
  }, [shown]);
  const commit = (): void => {
    const n = Number(text);
    if (text.trim() !== '' && Number.isFinite(n)) onCommit(clampFontSize(n));
    else setText(shown);
  };
  return (
    <input
      className="size-input"
      type="number"
      min={4}
      max={400}
      aria-label={t('style.fontSize.custom')}
      placeholder={value === 'mixed' ? t('style.mixed') : ''}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

const MIXED_VALUE = '__mixed';

function Section({
  labelId,
  title,
  children,
}: {
  labelId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="style-section" role="group" aria-labelledby={labelId}>
      <div className="style-section-title" id={labelId}>
        {title}
      </div>
      {children}
    </div>
  );
}

function OptionRow<V extends string | number>({
  options,
  value,
  onPick,
}: {
  options: readonly Option<V>[];
  value: V | 'mixed' | undefined;
  onPick: (v: V) => void;
}) {
  return (
    <div className="style-options">
      {options.map((o) => {
        const label = t(o.labelKey);
        return (
          <button
            key={String(o.value)}
            type="button"
            className="style-option"
            aria-label={label}
            title={label}
            aria-pressed={value === o.value}
            onClick={() => {
              onPick(o.value);
            }}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

function HexInput({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const shown = value === 'mixed' ? '' : value.replace(/^#/, '');
  const [text, setText] = useState(shown);
  useEffect(() => {
    setText(shown);
  }, [shown]);
  const commit = (): void => {
    const hex = normalizeHex(text);
    if (hex) onCommit(hex);
    else setText(shown);
  };
  return (
    <label className="hex-input">
      <span aria-hidden="true">#</span>
      <input
        type="text"
        inputMode="text"
        spellCheck={false}
        autoComplete="off"
        maxLength={7}
        aria-label={t('style.hex')}
        placeholder={value === 'mixed' ? t('style.mixed') : ''}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') {
            setText(shown);
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function ColorPicker({
  palette,
  value,
  recent,
  onPick,
}: {
  palette: readonly string[];
  value: string;
  recent: readonly string[];
  onPick: (hex: string) => void;
}) {
  const swatch = (color: string, key: string) => (
    <button
      key={key}
      type="button"
      className="swatch"
      style={{ background: color }}
      aria-label={t('style.swatch', { value: color })}
      title={color}
      aria-pressed={value === color}
      onClick={() => {
        onPick(color);
      }}
    />
  );
  return (
    <>
      <div className="swatches">{palette.map((c) => swatch(c, c))}</div>
      {recent.length > 0 && (
        <div className="swatches" role="group" aria-label={t('style.recent')}>
          {recent.map((c) => swatch(c, `recent-${c}`))}
        </div>
      )}
      <div className="color-row">
        <span
          className={value === 'mixed' ? 'swatch-current mixed' : 'swatch-current'}
          style={value === 'mixed' ? undefined : { background: value }}
          aria-hidden="true"
        />
        <HexInput value={value} onCommit={onPick} />
        {EyeDropperImpl && (
          <button
            type="button"
            className="style-option"
            aria-label={t('style.eyedropper')}
            title={t('style.eyedropper')}
            onClick={() => {
              new EyeDropperImpl()
                .open()
                .then((r) => {
                  const hex = normalizeHex(r.sRGBHex);
                  if (hex) onPick(hex);
                })
                .catch(() => {
                  // Dismissed with Escape; nothing to do.
                });
            }}
          >
            <EyedropperIcon />
          </button>
        )}
      </div>
    </>
  );
}

function HeadSelect({
  label,
  value,
  onPick,
}: {
  label: string;
  value: Arrowhead | 'mixed';
  onPick: (v: Arrowhead) => void;
}) {
  return (
    <label className="head-select">
      <span>{label}</span>
      <select
        value={value === 'mixed' ? MIXED_VALUE : value}
        onChange={(e) => {
          const v = HEADS.find((h) => h.value === e.target.value);
          if (v) onPick(v.value);
        }}
      >
        {value === 'mixed' && (
          <option value={MIXED_VALUE} disabled>
            {t('style.mixed')}
          </option>
        )}
        {HEADS.map((h) => (
          <option key={h.value} value={h.value}>
            {t(h.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}

function OpacitySlider({
  value,
  onPick,
}: {
  value: number | 'mixed';
  onPick: (v: number) => void;
}) {
  return (
    <div className="opacity-row">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label={t('style.opacity')}
        value={value === 'mixed' ? 100 : value}
        onChange={(e) => {
          onPick(Number(e.target.value));
        }}
      />
      <output>{value === 'mixed' ? t('style.mixed') : t('style.percent', { value })}</output>
    </div>
  );
}

function PanelBody({
  view,
  recent,
  apply,
  showVertical,
}: {
  view: StyleView;
  recent: readonly string[];
  apply: (p: StylePatch) => void;
  showVertical: boolean;
}) {
  return (
    <>
      {view.strokeColor !== undefined && (
        <Section labelId="style-stroke" title={t('style.stroke')}>
          <ColorPicker
            palette={STROKE_PALETTE}
            value={view.strokeColor}
            recent={recent}
            onPick={(strokeColor) => {
              apply({ strokeColor });
            }}
          />
        </Section>
      )}
      {view.fillColor !== undefined && (
        <Section labelId="style-fill-color" title={t('style.fillColor')}>
          <ColorPicker
            palette={FILL_PALETTE}
            value={view.fillColor}
            recent={recent}
            onPick={(fillColor) => {
              apply({ fillColor });
            }}
          />
        </Section>
      )}
      {view.fillStyle !== undefined && (
        <Section labelId="style-fill" title={t('style.fill')}>
          <OptionRow
            options={FILL_OPTIONS}
            value={view.fillStyle}
            onPick={(fillStyle) => {
              apply({ fillStyle });
            }}
          />
        </Section>
      )}
      {view.strokeWidth !== undefined && (
        <Section labelId="style-width" title={t('style.width')}>
          <OptionRow
            options={WIDTH_OPTIONS}
            value={view.strokeWidth}
            onPick={(strokeWidth) => {
              apply({ strokeWidth });
            }}
          />
        </Section>
      )}
      {view.strokePattern !== undefined && (
        <Section labelId="style-pattern" title={t('style.pattern')}>
          <OptionRow
            options={PATTERN_OPTIONS}
            value={view.strokePattern}
            onPick={(strokePattern) => {
              apply({ strokePattern });
            }}
          />
        </Section>
      )}
      {view.roughness !== undefined && (
        <Section labelId="style-roughness" title={t('style.roughness')}>
          <OptionRow
            options={ROUGHNESS_OPTIONS}
            value={view.roughness}
            onPick={(roughness) => {
              apply({ roughness });
            }}
          />
        </Section>
      )}
      {view.corners !== undefined && (
        <Section labelId="style-corners" title={t('style.corners')}>
          <OptionRow
            options={CORNER_OPTIONS}
            value={view.corners}
            onPick={(corners) => {
              apply({ corners });
            }}
          />
        </Section>
      )}
      {view.curve !== undefined && (
        <Section labelId="style-path" title={t('style.path')}>
          <OptionRow
            options={PATH_OPTIONS}
            value={view.curve}
            onPick={(curve) => {
              apply({ curve });
            }}
          />
        </Section>
      )}
      {view.startHead !== undefined && view.endHead !== undefined && (
        <Section labelId="style-heads" title={t('style.arrowheads')}>
          <div className="head-row">
            <HeadSelect
              label={t('style.startHead')}
              value={view.startHead}
              onPick={(startHead) => {
                apply({ startHead });
              }}
            />
            <HeadSelect
              label={t('style.endHead')}
              value={view.endHead}
              onPick={(endHead) => {
                apply({ endHead });
              }}
            />
          </div>
        </Section>
      )}
      {view.fontFamily !== undefined && (
        <Section labelId="style-font" title={t('style.font')}>
          <OptionRow
            options={FONT_OPTIONS}
            value={view.fontFamily}
            onPick={(fontFamily) => {
              apply({ fontFamily });
            }}
          />
        </Section>
      )}
      {view.fontSize !== undefined && (
        <Section labelId="style-font-size" title={t('style.fontSize')}>
          <div className="size-row">
            <OptionRow
              options={SIZE_OPTIONS}
              value={view.fontSize}
              onPick={(fontSize) => {
                apply({ fontSize });
              }}
            />
            <FontSizeInput
              value={view.fontSize}
              onCommit={(fontSize) => {
                apply({ fontSize });
              }}
            />
          </div>
        </Section>
      )}
      {view.textAlign !== undefined && (
        <Section labelId="style-text-align" title={t('style.textAlign')}>
          <OptionRow
            options={ALIGN_OPTIONS}
            value={view.textAlign}
            onPick={(textAlign) => {
              apply({ textAlign });
            }}
          />
        </Section>
      )}
      {showVertical && view.verticalAlign !== undefined && (
        <Section labelId="style-vertical-align" title={t('style.verticalAlign')}>
          <OptionRow
            options={VALIGN_OPTIONS}
            value={view.verticalAlign}
            onPick={(verticalAlign) => {
              apply({ verticalAlign });
            }}
          />
        </Section>
      )}
      {view.opacity !== undefined && (
        <Section labelId="style-opacity" title={t('style.opacity')}>
          <OpacitySlider
            value={view.opacity}
            onPick={(opacity) => {
              apply({ opacity });
            }}
          />
        </Section>
      )}
    </>
  );
}

/** Style inspector: shown for a selection, or for the active drawing tool's next element. */
export function StylePanel() {
  const { editor } = useApp();
  const scene = useEditorState((s) => s.scene);
  const selection = useEditorState((s) => s.selection);
  const activeTool = useEditorState((s) => s.activeTool);
  const styleMemory = useEditorState((s) => s.styleMemory);
  const recent = useEditorState((s) => s.recentColors);
  // Narrow screens show the panel as a bottom sheet that can be collapsed.
  const [collapsed, setCollapsed] = useState(false);

  const view = useMemo(
    () => getStyleView({ ...editor.getState(), scene, selection, activeTool, styleMemory }),
    [editor, scene, selection, activeTool, styleMemory],
  );
  if (!view) return null;

  const apply = (patch: StylePatch): void => {
    // Slider drags coalesce into one undo step; other edits are separate steps.
    const history = patch.opacity === undefined ? {} : { history: 'style:opacity' };
    editor.update((s) => applyStyle(s, patch), history);
  };
  const hasSelection = Object.keys(selection).length > 0;
  const state = editor.getState();
  const showVertical = selectedIds(state).some((id) => boundTextOf(state.scene, id) !== undefined);

  return (
    <aside
      className={collapsed ? 'style-panel collapsed' : 'style-panel'}
      aria-label={t('style.label')}
    >
      <button
        type="button"
        className="style-panel-toggle"
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed((c) => !c);
        }}
      >
        {t('styles.toggle')}
      </button>
      <div className="style-panel-body">
        <PanelBody view={view} recent={recent} apply={apply} showVertical={showVertical} />
        {hasSelection && <ArrangeSection />}
      </div>
    </aside>
  );
}
