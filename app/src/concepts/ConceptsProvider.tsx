import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { buttonClass } from '../button';
import { textSpans } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import { CARDS, INDEX } from './concepts';
import { ConceptVisualView } from './visuals';

interface Concepts {
  /** Opens a Concept card; from inside an open card, Back returns to that card. */
  openCard(id: string): void;
  /** Opens the Concepts index. */
  openIndex(): void;
}

const ConceptsContext = createContext<Concepts | null>(null);

export function useConcepts() {
  const concepts = useContext(ConceptsContext);
  if (!concepts) throw new Error('useConcepts needs a ConceptsProvider');
  return concepts;
}

/** What the dialog has shown since it opened, latest last: a card's ID, or null for the Concepts index. */
type Page = string | null;

const CHIP_CLASSES = 'inline-flex min-h-[34px] cursor-pointer items-center whitespace-nowrap rounded-full border border-rule bg-surface px-3 text-[13px] text-ink hover:border-accent hover:text-accent';
const KICKER_CLASSES = 'text-[12px] font-semibold text-ink3';
// The heading takes focus so screen readers announce each card; it isn't a control, so it has no focus ring.
const HEADING_CLASSES = 'text-[24px] font-semibold leading-[1.2] outline-none';

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

/**
 * Concept cards and the Concepts index, in one modal dialog inside the app: nothing links out for explanations.
 * Words with a Concept card, Honesty label chips and the header's Concepts button open it. Escape closes it,
 * and focus goes back to whatever opened it.
 */
export function ConceptsProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<Page[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [concepts] = useState<Concepts>(() => ({
    openCard: (id) => setPages((shown) => [...shown, id]),
    openIndex: () => setPages([null]),
  }));

  // Opens the dialog when there is something to show, and puts focus on the heading of each new page.
  useEffect(() => {
    const element = dialog.current;
    if (!element || pages.length === 0) return;
    if (!element.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    }
    element.scrollTop = 0;
    heading.current?.focus();
  }, [pages]);

  const close = () => dialog.current?.close();
  const onClose = () => {
    setPages([]);
    if (opener.current?.isConnected) opener.current.focus();
    opener.current = null;
  };

  const page = pages.at(-1);
  const bar = (left: ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      {left}
      <button type="button" className={buttonClass({ size: 'icon' })} aria-label="Close" onClick={close}>
        <CloseIcon />
      </button>
    </div>
  );
  const chip = (id: string) => (
    <button type="button" key={id} className={CHIP_CLASSES} onClick={() => concepts.openCard(id)}>
      {CARDS[id].name}
    </button>
  );
  let content = null;
  if (page === null) {
    content = (
      <>
        {bar(<span className={KICKER_CLASSES}>Explained inside the app, no internet needed</span>)}
        <h2 id="concept-title" ref={heading} tabIndex={-1} className={HEADING_CLASSES}>Concepts</h2>
        {INDEX.map((group, at) => (
          <div className="grid gap-2" role="group" aria-labelledby={`concept-group-${at}`} key={group.name}>
            <h3 id={`concept-group-${at}`} className="text-[13px] font-semibold text-ink3">{group.name}</h3>
            <div className="flex flex-wrap gap-1.5">{group.cards.map(chip)}</div>
          </div>
        ))}
      </>
    );
  } else if (page !== undefined) {
    const card = CARDS[page];
    content = (
      <>
        {bar(
          pages.length > 1 ? (
            <button type="button" className={buttonClass({ size: 'sm' })} onClick={() => setPages((shown) => shown.slice(0, -1))}>
              <BackIcon />
              Back
            </button>
          ) : (
            <button type="button" className={buttonClass({ size: 'sm' })} onClick={concepts.openIndex}>
              All concepts
            </button>
          ),
        )}
        <div>
          <p className={KICKER_CLASSES}>Concept</p>
          <h2 id="concept-title" ref={heading} tabIndex={-1} className={HEADING_CLASSES}>
            {card.name}
          </h2>
          <p className="mt-1.5 text-[16px] italic text-ink2">{card.like}</p>
        </div>
        <p className="text-[15px] leading-[1.65] text-ink2">
          <ExplanationText spans={textSpans(card.text)} />
        </p>
        {card.visual && <ConceptVisualView visual={card.visual} />}
        {card.related.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink3" role="group" aria-labelledby="concept-related">
            <span id="concept-related">Related:</span>
            {card.related.map(chip)}
          </div>
        )}
      </>
    );
  }

  return (
    <ConceptsContext value={concepts}>
      {children}
      {/* A click on the backdrop, outside the card, closes it. */}
      <dialog
        ref={dialog}
        aria-labelledby="concept-title"
        className="m-auto max-h-[calc(100dvh-48px)] w-full max-w-[min(600px,calc(100vw-32px))] rounded-2xl border border-rule bg-surface p-0 text-ink backdrop:bg-[rgba(15,15,14,0.45)]"
        onClose={onClose}
        onClick={(event) => event.target === event.currentTarget && close()}
      >
        <div className="grid gap-3.5 px-[22px] pb-[22px] pt-5 narrow:px-4 narrow:pb-4">{content}</div>
      </dialog>
    </ConceptsContext>
  );
}
