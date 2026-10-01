import { buttonClass } from '../button';
import { useConcepts } from './ConceptsProvider';

/** The header's button for the Concepts index. */
export function ConceptsButton() {
  const { openIndex } = useConcepts();
  return (
    <button type="button" className={buttonClass()} aria-haspopup="dialog" onClick={openIndex}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
        <path d="M4 19V5" />
        <path d="M8 7h7" />
      </svg>
      Concepts
    </button>
  );
}
