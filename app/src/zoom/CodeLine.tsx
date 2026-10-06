import { charLabel, stretchesOf, type CharSpan, type Line, type Mark } from './characters';

const MARK_CLASSES: Record<Mark, string> = {
  selected: 'rounded-[3px] bg-accent-soft text-accent [box-shadow:0_0_0_2px_var(--accent)]',
  error: 'rounded-[3px] bg-warn/15 text-warn [box-shadow:0_0_0_2px_var(--warn)]',
};

/** Characters, as the page shows them. The newline is invisible, so it only appears where it is marked. */
const shown = (chars: Line['chars'], marked: boolean) => chars.map(({ char }) => (char !== '\n' ? char : marked ? charLabel(char) : '')).join('');

/** One line of the Program, with its number, and the code the Selection comes from and the code a syntax error points at marked. */
export function CodeLine({ line, selected, error }: { line: Line; selected: CharSpan | null; error: CharSpan | null }) {
  return (
    <li className="flex min-h-[26px] items-baseline gap-3.5">
      <span className="w-6 flex-none text-right font-mono text-[13px] leading-[normal] text-ink3" aria-hidden="true">{line.number}</span>
      <code className="whitespace-pre text-[16px]">
        {stretchesOf(line, { selected, error }).map(({ mark, chars }) => {
          if (mark === null) return shown(chars, false);
          return (
            <mark key={chars[0].index} className={MARK_CLASSES[mark]} {...(mark === 'error' && { 'data-error': true })}>
              {shown(chars, true)}
            </mark>
          );
        })}
      </code>
    </li>
  );
}
