import type { Analysis, ByteFact } from '../generated/analysis';
import { charLabel, describeChar } from './characters';

const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, '0');

/** Zoom level 2: the Program's bytes, line by line, each linked to the character it encodes. */
export function BytesZoomLevel({
  analysis,
  selectedByte,
  onSelect,
}: {
  analysis: Analysis;
  selectedByte: ByteFact | null;
  onSelect(byte: ByteFact): void;
}) {
  const chars = Array.from(analysis.program);
  const lines = new Map<number, { byte: ByteFact; position: number }[]>();
  analysis.bytes.forEach((byte, position) => {
    if (!lines.has(byte.line)) lines.set(byte.line, []);
    lines.get(byte.line)!.push({ byte, position });
  });

  return (
    <section className="zoom-level" aria-labelledby="zoom-level-2">
      <h2 id="zoom-level-2">Zoom level 2: Bytes</h2>
      <p className="caption">
        Your program as a file: {analysis.bytes.length} bytes, numbers from 0 to 255, shown line by line. Each
        box shows the byte in hexadecimal, then as an ordinary number. Select one to see its character.
      </p>
      <div className="byte-lines">
        {[...lines].map(([line, bytes]) => (
          <div className="byte-line" key={line}>
            <span className="line-label" aria-hidden="true">line {line}</span>
            <ol className="bytes" aria-label={`Line ${line}`}>
              {bytes.map(({ byte, position }) => {
                const char = chars[byte.charIndex];
                const isSelected = byte.id === selectedByte?.id;
                const sharesChar = !isSelected && byte.charIndex === selectedByte?.charIndex;
                return (
                  <li key={byte.id}>
                    <button
                      type="button"
                      className={`byte${isSelected ? ' selected' : sharesChar ? ' related' : ''}`}
                      data-fact-id={byte.id}
                      aria-pressed={isSelected}
                      aria-label={`Byte ${position + 1}: ${byte.value}, 0x${hex(byte.value)}, ${describeChar(char)}`}
                      onClick={() => onSelect(byte)}
                    >
                      <span className="byte-hex">{hex(byte.value)}</span>
                      <span className="byte-number">{byte.value}</span>
                      <span className="byte-char">{charLabel(char)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
