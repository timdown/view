import {EditorView} from "./editorview"
import {Command} from "./extension"
import {modifierCodes} from "./input"
import {base, shift, keyName} from "w3c-keyname"
import {Facet, Prec, EditorState, codePointSize, codePointAt} from "@codemirror/state"

import browser from "./browser"

/// Key bindings associate key names with
/// [command](#view.Command)-style functions.
///
/// Key names may be strings like `"Shift-Ctrl-Enter"`—a key identifier
/// prefixed with zero or more modifiers. Key identifiers are based on
/// the strings that can appear in
/// [`KeyEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key).
/// Use lowercase letters to refer to letter keys (or uppercase letters
/// if you want shift to be held). You may use `"Space"` as an alias
/// for the `" "` name.
///
/// Modifiers can be given in any order. `Shift-` (or `s-`), `Alt-` (or
/// `a-`), `Ctrl-` (or `c-` or `Control-`) and `Cmd-` (or `m-` or
/// `Meta-`) are recognized.
///
/// When a key binding contains multiple key names separated by
/// spaces, it represents a multi-stroke binding, which will fire when
/// the user presses the given keys after each other.
///
/// You can use `Mod-` as a shorthand for `Cmd-` on Mac and `Ctrl-` on
/// other platforms. So `Mod-b` is `Ctrl-b` on Linux but `Cmd-b` on
/// macOS.
export interface KeyBinding {
  /// The key name to use for this binding. If the platform-specific
  /// property (`mac`, `win`, or `linux`) for the current platform is
  /// used as well in the binding, that one takes precedence. If `key`
  /// isn't defined and the platform-specific binding isn't either,
  /// a binding is ignored.
  key?: string,
  /// Key to use specifically on macOS.
  mac?: string,
  /// Key to use specifically on Windows.
  win?: string,
  /// Key to use specifically on Linux.
  linux?: string,
  /// The command to execute when this binding is triggered. When the
  /// command function returns `false`, further bindings will be tried
  /// for the key.
  run: Command,
  /// When given, this defines a second binding, using the (possibly
  /// platform-specific) key name prefixed with `Shift-` to activate
  /// this command.
  shift?: Command
  /// By default, key bindings apply when focus is on the editor
  /// content (the `"editor"` scope). Some extensions, mostly those
  /// that define their own panels, might want to allow you to
  /// register bindings local to that panel. Such bindings should use
  /// a custom scope name. You may also assign multiple scope names to
  /// a binding, separating them by spaces.
  scope?: string
  /// When set to true (the default is false), this will always
  /// prevent the further handling for the bound key, even if the
  /// command(s) return false. This can be useful for cases where the
  /// native behavior of the key is annoying or irrelevant but the
  /// command doesn't always apply (such as, Mod-u for undo selection,
  /// which would cause the browser to view source instead when no
  /// selection can be undone).
  preventDefault?: boolean
}

type PlatformName = "mac" | "win" | "linux" | "key"

const currentPlatform: PlatformName = browser.mac ? "mac" : browser.windows ? "win" : browser.linux ? "linux" : "key"

function normalizeKeyName(name: string, platform: PlatformName): string {
  const parts = name.split(/-(?!$)/)
  let result = parts[parts.length - 1]
  if (result == "Space") result = " "
  let alt, ctrl, shift, meta
  for (let i = 0; i < parts.length - 1; ++i) {
    const mod = parts[i]
    if (/^(cmd|meta|m)$/i.test(mod)) meta = true
    else if (/^a(lt)?$/i.test(mod)) alt = true
    else if (/^(c|ctrl|control)$/i.test(mod)) ctrl = true
    else if (/^s(hift)?$/i.test(mod)) shift = true
    else if (/^mod$/i.test(mod)) { if (platform == "mac") meta = true; else ctrl = true }
    else throw new Error("Unrecognized modifier name: " + mod)
  }
  if (alt) result = "Alt-" + result
  if (ctrl) result = "Ctrl-" + result
  if (meta) result = "Meta-" + result
  if (shift) result = "Shift-" + result
  return result
}

function modifiers(name: string, event: KeyboardEvent, shift: boolean) {
  if (event.altKey) name = "Alt-" + name
  if (event.ctrlKey) name = "Ctrl-" + name
  if (event.metaKey) name = "Meta-" + name
  if (shift !== false && event.shiftKey) name = "Shift-" + name
  return name
}

type Binding = {preventDefault: boolean, commands: Command[]}

type Keymap = {[scope: string]: {[key: string]: Binding}}

const handleKeyEvents = Prec.default(EditorView.domEventHandlers({
  keydown(event, view) {
    return runHandlers(getKeymap(view.state), event, view, "editor")
  }
}))

/// Facet used for registering keymaps.
///
/// You can add multiple keymaps to an editor. Their priorities
/// determine their precedence (the ones specified early or with high
/// priority get checked first). When a handler has returned `true`
/// for a given key, no further handlers are called.
export const keymap = Facet.define<readonly KeyBinding[]>({enables: handleKeyEvents})

const Keymaps = new WeakMap<readonly (readonly KeyBinding[])[], Keymap>()

// This is hidden behind an indirection, rather than directly computed
// by the facet, to keep internal types out of the facet's type.
function getKeymap(state: EditorState) {
  let bindings = state.facet(keymap)
  let map = Keymaps.get(bindings)
  if (!map) Keymaps.set(bindings, map = buildKeymap(bindings.reduce((a, b) => a.concat(b), [])))
  return map
}

/// Run the key handlers registered for a given scope. The event
/// object should be a `"keydown"` event. Returns true if any of the
/// handlers handled it.
export function runScopeHandlers(view: EditorView, event: KeyboardEvent, scope: string) {
  return runHandlers(getKeymap(view.state), event, view, scope)
}

let storedPrefix: {view: EditorView, prefix: string, scope: string} | null = null

const PrefixTimeout = 4000

function buildKeymap(bindings: readonly KeyBinding[], platform = currentPlatform) {
  let bound: Keymap = Object.create(null)
  let isPrefix: {[prefix: string]: boolean} = Object.create(null)

  let checkPrefix = (name: string, is: boolean) => {
    let current = isPrefix[name]
    if (current == null)
      isPrefix[name] = is
    else if (current != is)
      throw new Error("Key binding " + name + " is used both as a regular binding and as a multi-stroke prefix")
  }

  let add = (scope: string, key: string, command: Command, preventDefault?: boolean) => {
    let scopeObj = bound[scope] || (bound[scope] = Object.create(null))
    let parts = key.split(/ (?!$)/).map(k => normalizeKeyName(k, platform))
    for (let i = 1; i < parts.length; i++) {
      let prefix = parts.slice(0, i).join(" ")
      checkPrefix(prefix, true)
      if (!scopeObj[prefix]) scopeObj[prefix] = {
        preventDefault: true,
        commands: [(view: EditorView) => {
          let ourObj = storedPrefix = {view, prefix, scope}
          setTimeout(() => { if (storedPrefix == ourObj) storedPrefix = null }, PrefixTimeout)
          return true
        }]
      }
    }
    let full = parts.join(" ")
    checkPrefix(full, false)
    let binding = scopeObj[full] || (scopeObj[full] = {preventDefault: false, commands: []})
    binding.commands.push(command)
    if (preventDefault) binding.preventDefault = true
  }

  for (let b of bindings) {
    let name = b[platform] || b.key
    if (!name) continue
    for (let scope of b.scope ? b.scope.split(" ") : ["editor"]) {
      add(scope, name, b.run, b.preventDefault)
      if (b.shift) add(scope, "Shift-" + name, b.shift, b.preventDefault)
    }
  }
  return bound
}

function runHandlers(map: Keymap, event: KeyboardEvent, view: EditorView, scope: string): boolean {
  let name = keyName(event)
  let charCode = codePointAt(name, 0), isChar = codePointSize(charCode) == name.length && name != " "
  let prefix = "", fallthrough = false
  if (storedPrefix && storedPrefix.view == view && storedPrefix.scope == scope) {
    prefix = storedPrefix.prefix + " "
    if (fallthrough = modifierCodes.indexOf(event.keyCode) < 0)
      storedPrefix = null
  }

  let runFor = (binding: Binding | undefined) => {
    if (binding) {
      for (let cmd of binding.commands) if (cmd(view)) return true
      if (binding.preventDefault) fallthrough = true
    }
    return false
  }

  let scopeObj = map[scope], baseName
  if (scopeObj) {
    if (runFor(scopeObj[prefix + modifiers(name, event, !isChar)])) return true
    if (isChar && (event.shiftKey || event.altKey || event.metaKey || charCode > 127) &&
        (baseName = base[event.keyCode]) && baseName != name) {
      if (runFor(scopeObj[prefix + modifiers(baseName, event, true)])) return true
      else if (event.shiftKey && shift[event.keyCode] != baseName &&
               runFor(scopeObj[prefix + modifiers(shift[event.keyCode], event, false)])) return true
    } else if (isChar && event.shiftKey) {
      if (runFor(scopeObj[prefix + modifiers(name, event, true)])) return true
    }
  }
  return fallthrough
}
