import { Fragment, type ReactNode } from 'react';
import { useConcepts } from '../concepts/ConceptsProvider';
import type { Span } from './explain';

const TERM_CLASSES = 'inline cursor-pointer rounded-md bg-accent-soft px-[5px] text-accent [box-decoration-break:clone] hover:bg-accent hover:text-on-accent';

/** Highlighted words that open their Concept card. */
function ConceptTerm({ card, children }: { card: string; children: ReactNode }) {
  const { openCard } = useConcepts();
  return (
    <button type="button" className={TERM_CLASSES} aria-haspopup="dialog" onClick={() => openCard(card)}>
      {children}
    </button>
  );
}

/** Explanation text, with its bold values and its highlighted words, which open Concept cards. */
export function ExplanationText({ spans }: { spans: Span[] }) {
  return spans.map((span, index) => {
    const text = span.concept ? <ConceptTerm card={span.concept}>{span.text}</ConceptTerm> : span.text;
    return span.strong ? <b key={index} className="font-semibold text-ink">{text}</b> : <Fragment key={index}>{text}</Fragment>;
  });
}
