export {EditorView, DOMEventMap, DOMEventHandlers} from "./editorview"
export {Command, ViewPlugin, PluginValue, PluginSpec, ViewUpdate, logException} from "./extension"
export {Decoration, DecorationSet, WidgetType, BlockType} from "./decoration"
export {BlockInfo} from "./heightmap"
export {MouseSelectionStyle} from "./input"
export {BidiSpan, Direction} from "./bidi"
export {KeyBinding, keymap, runScopeHandlers} from "./keymap"
export {drawSelection} from "./draw-selection"
export {dropCursor} from "./dropcursor"
export {highlightSpecialChars} from "./special-chars"
export {scrollPastEnd} from "./scrollpastend"
export {highlightActiveLine} from "./active-line"
export {placeholder} from "./placeholder"
export {Rect} from "./dom"
export {MatchDecorator} from "./matchdecorator"
export {rectangularSelection, crosshairCursor} from "./rectangular-selection"
export {Range} from "@codemirror/rangeset"
export {showTooltip, Tooltip, TooltipView, tooltips, getTooltip, hoverTooltip, hasHoverTooltips,
        closeHoverTooltips, repositionTooltips} from "./tooltip"
export {showPanel, PanelConstructor, Panel, getPanel, panels} from "./panel"
export {lineNumbers, highlightActiveLineGutter, gutter, gutters, GutterMarker,
        gutterLineClass, lineNumberMarkers} from "./gutter"

import {HeightMap, HeightOracle, MeasuredHeights, QueryType} from "./heightmap"
import {ChangedRange} from "./extension"
import {computeOrder, moveVisually} from "./bidi"
/// @internal
export const __test = {HeightMap, HeightOracle, MeasuredHeights, QueryType, ChangedRange, computeOrder, moveVisually}
