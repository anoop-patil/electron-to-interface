import cardsFile from '../../concepts/cards.json';
import labelsFile from '../../concepts/honesty-labels.json';
import type { ConceptCards, HonestyLabel, HonestyLabels } from '../generated/analysis';

/**
 * The Concept cards and the Concepts index. The build checks the file against the schema and every link
 * between cards (see checkContent.ts); `unknown` is needed only because JSON's arrays don't type as the
 * schema's non-empty lists.
 */
const { cards: CARDS, index: INDEX } = cardsFile as unknown as ConceptCards;
export { CARDS, INDEX };

/** The card every Honesty label chip opens: the one that lists the labels. */
export const HONESTY_CARD = Object.keys(CARDS).find((id) => CARDS[id].visual?.kind === 'honestyLabels')!;

const LABELS = labelsFile as HonestyLabels;

/** Every Honesty label, in the order the How we know card lists them. The set is data, so changing it is a data edit. */
export const HONESTY_LABELS: HonestyLabel[] = Object.values(LABELS.labels);

/** The label a zoom level carries, or null for a level that isn't built yet. */
export const levelLabel = (level: number): HonestyLabel | null => {
  const id = LABELS.levels[level];
  return id ? LABELS.labels[id] : null;
};

/** The label of a panel whose provenance differs from its level. */
export const panelLabel = (panel: keyof HonestyLabels['panels']) => LABELS.labels[LABELS.panels[panel]];
