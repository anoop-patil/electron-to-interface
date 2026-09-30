import { charLabel, linesOf } from './characters';

/** Zoom level 1: the whole Program, every line, as the learner wrote it. */
export function CodeZoomLevel({ program, selectedChar }: { program: string; selectedChar: number | null }) {
  const lines = linesOf(program);
  return (
    <section className="zoom-level" aria-labelledby="zoom-level-1">
      <h2 id="zoom-level-1">Zoom level 1: Your code</h2>
      <p className="caption">
        Your whole program: {lines.length} {lines.length === 1 ? 'line' : 'lines'}.
      </p>
      <ol className="code-lines">
        {lines.map((line) => (
          <li key={line.number}>
            <span className="line-number" aria-hidden="true">{line.number}</span>
            <code>
              {line.chars.map(({ index, char }) => {
                // The newline is invisible, so it only appears when its byte is selected.
                if (index === selectedChar) return <mark key={index}>{char === '\n' ? charLabel(char) : char}</mark>;
                return char === '\n' ? null : char;
              })}
            </code>
          </li>
        ))}
      </ol>
    </section>
  );
}
