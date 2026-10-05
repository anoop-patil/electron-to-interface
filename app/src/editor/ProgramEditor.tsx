import { useLayoutEffect, useRef } from 'react';
import { linesOf, splitLine, type CharSpan, type Line } from '../zoom/characters';

const TEXT_CLASSES = 'rounded-[10px] border px-3 py-2.5 font-mono text-[14px] leading-[1.6] [tab-size:4]';

/** The code the Selection comes from: its characters, in the Program as it was analyzed. */
export type Highlight = CharSpan & { program: string };

/** Characters as text, without the newline, which takes no room. */
const text = (chars: Line['chars']) => chars.map(({ char }) => (char === '\n' ? '' : char)).join('');

/**
 * The editor: a textarea, with the code the Selection comes from highlighted behind it. A textarea can't mark its own
 * text, so a copy of the code with the mark sits underneath, in the same place and font, and scrolls with it.
 */
export function ProgramEditor({ code, onChange, highlight }: { code: string; onChange(code: string): void; highlight: Highlight | null }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const underneath = useRef<HTMLDivElement>(null);
  const scrollUnderneath = () => {
    if (area.current && underneath.current) underneath.current.style.transform = `translate(${-area.current.scrollLeft}px, ${-area.current.scrollTop}px)`;
  };

  // A new highlight out of sight, such as on line 18 of a short editor, scrolls the editor to it.
  useLayoutEffect(() => {
    const textarea = area.current;
    const mark = underneath.current?.querySelector('mark');
    if (textarea && mark) {
      const { offsetTop: top, offsetLeft: left, offsetHeight: height, offsetWidth: width } = mark;
      if (top < textarea.scrollTop || top + height > textarea.scrollTop + textarea.clientHeight) textarea.scrollTop = top - textarea.clientHeight / 2;
      if (left < textarea.scrollLeft || left + width > textarea.scrollLeft + textarea.clientWidth) textarea.scrollLeft = left - 24;
    }
    scrollUnderneath();
  }, [highlight?.program, highlight?.start, highlight?.end]);

  return (
    <div className="relative rounded-[10px] bg-sunk">
      {/* `editor-highlight` is a hook for the tests, not a style. */}
      <div className={`editor-highlight pointer-events-none absolute inset-0 overflow-hidden border-transparent text-transparent ${TEXT_CLASSES}`} aria-hidden="true">
        {highlight && (
          <div ref={underneath} className="whitespace-pre">
            {linesOf(highlight.program).map((line) => {
              const { before, marked, after } = splitLine(line, highlight);
              return (
                <div key={line.number} className="min-h-[1.6em]" data-line={line.number}>
                  {text(before)}
                  {marked.length > 0 && (
                    <mark className="rounded-[3px] bg-accent-soft text-transparent [box-shadow:0_0_0_2px_var(--accent)]">
                      {text(marked)}
                      {/* The newline is invisible, so it shows as ↵ when it is highlighted. */}
                      {marked.at(-1)!.char === '\n' && <span className="text-accent">↵</span>}
                    </mark>
                  )}
                  {text(after)}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <textarea
        ref={area}
        id="program"
        className={`relative block min-h-[150px] w-full resize-y border-rule2 bg-transparent text-ink focus:border-accent ${TEXT_CLASSES}`}
        value={code}
        onChange={(e) => onChange(e.target.value)}
        onScroll={scrollUnderneath}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        wrap="off"
      />
    </div>
  );
}
