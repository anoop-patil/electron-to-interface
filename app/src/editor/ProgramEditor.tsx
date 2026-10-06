import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorState, StateEffect, StateField, type Range } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers, WidgetType, type DecorationSet } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { linesOf, stretchesOf, type CharSpan, type Mark } from '../zoom/characters';

/**
 * What the editor marks, in the Program as it was analyzed: the code the Selection comes from, and the code a syntax
 * error points at, as positions in its characters.
 */
export interface Highlight {
  program: string;
  selected: CharSpan | null;
  error: CharSpan | null;
}

/** How each mark looks, and its ↵ for a marked newline: the Selection's, then a syntax error's. */
const MARKS: Record<Mark, { classes: string; newline: string }> = {
  selected: { classes: 'rounded-[3px] bg-accent-soft [box-shadow:0_0_0_2px_var(--accent)]', newline: 'text-accent' },
  error: { classes: 'rounded-[3px] bg-warn/15 [box-shadow:0_0_0_2px_var(--warn)]', newline: 'text-warn' },
};

const markAttributes = (mark: Mark) => (mark === 'error' ? { 'data-error': '' } : undefined);

/** A marked newline, which takes no room in the text, drawn as ↵ at the end of its line. */
class Newline extends WidgetType {
  constructor(readonly mark: Mark) {
    super();
  }

  eq(other: Newline) {
    return other.mark === this.mark;
  }

  toDOM() {
    const element = document.createElement('mark');
    element.className = `${MARKS[this.mark].classes} ${MARKS[this.mark].newline}`;
    for (const [name, value] of Object.entries(markAttributes(this.mark) ?? {})) element.setAttribute(name, value);
    element.textContent = '↵';
    return element;
  }
}

/**
 * The marks for a highlight, in the editor's text, which is the Program without the newline the analyzer may have
 * added. The Highlight counts code points; the editor counts UTF-16 code units. Each line with a mark carries its
 * number, as a hook for the tests.
 */
function decorationsFor(highlight: Highlight, length: number): DecorationSet {
  const offsets = [0];
  for (const char of highlight.program) offsets.push(offsets.at(-1)! + char.length);
  const at = (index: number) => Math.min(offsets[index], length);
  const ranges: Range<Decoration>[] = [];
  for (const line of linesOf(highlight.program)) {
    let marked = false;
    for (const { mark, chars } of stretchesOf(line, highlight)) {
      if (mark === null) continue;
      marked = true;
      const newline = chars.at(-1)!.char === '\n';
      const from = at(chars[0].index);
      const to = at(chars.at(-1)!.index + (newline ? 0 : 1));
      if (to > from) ranges.push(Decoration.mark({ tagName: 'mark', class: `${MARKS[mark].classes} text-inherit`, attributes: markAttributes(mark) }).range(from, to));
      if (newline) ranges.push(Decoration.widget({ widget: new Newline(mark), side: 1 }).range(to));
    }
    if (marked) ranges.push(Decoration.line({ attributes: { 'data-line': String(line.number) } }).range(at(line.chars[0].index)));
  }
  return Decoration.set(ranges, true);
}

const setHighlight = StateEffect.define<Highlight | null>();

/** The marks the editor shows. Any edit takes them away: they belong to the code as it was analyzed. */
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setHighlight)) return effect.value ? decorationsFor(effect.value, transaction.state.doc.length) : Decoration.none;
    }
    return transaction.docChanged ? Decoration.none : marks;
  },
  // Outer, so a mark wraps the code's colors instead of being cut up by them.
  provide: (field) => EditorView.outerDecorations.from(field),
});

/** The code's colors, from the same set as the tokens at zoom level 3. */
const colors = HighlightStyle.define([
  { tag: [tags.keyword, tags.definitionKeyword, tags.controlKeyword, tags.operatorKeyword, tags.moduleKeyword], color: 'var(--tok-mark)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--tok-str)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--tok-str)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.variableName), tags.className], color: 'var(--tok-name)' },
  { tag: tags.comment, color: 'var(--ink3)', fontStyle: 'italic' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--tok-op)' },
]);

const look = EditorView.theme({
  // Up to about 13 lines show at once; a longer Program scrolls.
  '&': { color: 'var(--ink)', backgroundColor: 'transparent', fontSize: '14px', maxHeight: '330px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content, .cm-gutter': { minHeight: '150px' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--ink)', tabSize: '4' },
  '.cm-line': { padding: '0 12px 0 6px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--ink3)', border: 'none', paddingLeft: '4px' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--accent-soft)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: '1px solid var(--rule2)' },
});

/**
 * The code editor: CodeMirror 6, with Python's colors and line numbers. It marks the code the Selection comes from, and
 * the code a syntax error points at, and scrolls a new mark into sight. Tab is left to move focus on, so nobody using
 * the keyboard is trapped in the editor; Enter indents after a colon, and Ctrl+] and Ctrl+[ indent and dedent a line.
 */
export function ProgramEditor({ code, onChange, highlight, labelledBy }: { code: string; onChange(code: string): void; highlight: Highlight | null; labelledBy: string }) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  // The editor is made once; the effects below keep it in step with the page.
  useEffect(() => {
    const editor = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          history(),
          indentOnInput(),
          // Four spaces, as the Examples and most Python code indent.
          indentUnit.of('    '),
          bracketMatching(),
          python(),
          syntaxHighlighting(colors),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          highlightField,
          look,
          // tabindex as well as contenteditable, so checkers such as axe see the scrolling box holds something focusable.
          EditorView.contentAttributes.of({ 'aria-labelledby': labelledBy, tabindex: '0' }),
          EditorView.updateListener.of((update) => update.docChanged && changed.current(update.state.doc.toString())),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  // New code from outside, such as an Example's, replaces the editor's.
  useEffect(() => {
    const editor = view.current!;
    if (editor.state.doc.toString() !== code) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } });
  }, [code]);

  // A new mark out of sight, such as on line 18, scrolls the editor to it: the Selection's, if any.
  useEffect(() => {
    const editor = view.current!;
    const target = highlight && (highlight.selected ?? highlight.error);
    const effects: StateEffect<unknown>[] = [setHighlight.of(highlight)];
    if (target) {
      const position = Math.min(Array.from(highlight.program).slice(0, target.start).join('').length, editor.state.doc.length);
      effects.push(EditorView.scrollIntoView(position, { y: 'nearest', x: 'nearest', xMargin: 24 }));
    }
    editor.dispatch({ effects });
  }, [highlight?.program, highlight?.selected?.start, highlight?.selected?.end, highlight?.error?.start, highlight?.error?.end]);

  // `editor-highlight` is a hook for the tests, not a style.
  return <div ref={parent} className="editor-highlight min-w-0 rounded-[10px] border border-rule2 bg-sunk focus-within:border-accent" />;
}
