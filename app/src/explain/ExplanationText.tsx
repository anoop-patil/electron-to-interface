import type { Span } from './explain';

/** Explanation text, with its bold values. Words with a Concept card are plain text until the cards exist (ticket 04). */
export function ExplanationText({ spans }: { spans: Span[] }) {
  return spans.map((span, index) =>
    span.strong ? <b key={index} className="font-semibold text-ink">{span.text}</b> : span.text,
  );
}
