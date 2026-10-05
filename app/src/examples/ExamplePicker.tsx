import { SELECTED_CLASSES } from '../zoom/LinePicker';
import { EXAMPLES } from './examples';

/** A row of buttons, one per Example. The one on show, unedited, is pressed. */
export function ExamplePicker({ shown, onPick }: { shown: string | null; onPick(id: string): void }) {
  return (
    <div className="grid gap-1.5" role="group" aria-labelledby="examples-title">
      <h2 id="examples-title" className="text-[13px] font-semibold text-ink2">Examples</h2>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`min-h-9 cursor-pointer rounded-full border-[1.5px] px-3 text-[13px] leading-[normal] ${id === shown ? `${SELECTED_CLASSES} text-ink` : 'border-rule2 bg-surface text-ink2 hover:bg-sunk'}`}
            aria-pressed={id === shown}
            onClick={() => onPick(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
