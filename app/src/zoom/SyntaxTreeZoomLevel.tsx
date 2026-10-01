import { explainProgram, type Span } from '../explain/explain';
import { ExplanationText } from '../explain/ExplanationText';
import { explainNotDrawn, explainSignposts, fieldLabel, isText, leafText, nodeById, STATEMENT_FIELDS, treeLabel, valueOf } from '../explain/syntaxTree';
import type { Analysis, AstFact } from '../generated/analysis';

/** What the tree needs to draw a box: the Analysis, the selected box, and what to do when the learner picks one. */
interface TreeProps {
  analysis: Analysis;
  selectedNode: AstFact | null;
  onSelect(node: AstFact): void;
}

const plain = (spans: Span[]) => spans.map((span) => span.text).join('');

/** The fields of a node that hold other nodes, with those nodes. */
const boxFields = (analysis: Analysis, node: AstFact) =>
  node.fields.flatMap((field) => ('nodes' in field ? [{ name: field.name, nodes: field.nodes.map((id) => nodeById(analysis, id)) }] : []));

/** A leaf's border: names in the token colors' name color, pieces of text in their text color, anything else plain. */
function leafBorder(node: AstFact) {
  if (node.type !== 'Constant') return 'border-tok-name';
  return isText(valueOf(node, 'value') ?? '') ? 'border-tok-str' : 'border-rule2';
}

/** How a box is read out, as the tree shows it: Call: Call a function, or for a leaf, Name: print (What to call). */
function spoken(analysis: Analysis, node: AstFact) {
  const text = leafText(node);
  const label = plain(treeLabel(analysis, node));
  return text === null ? `${node.type}: ${label}` : `${node.type}: ${text} (${label})`;
}

/** The kind of node, as ast names it, in small print. */
const TypeTag = ({ type, selected }: { type: string; selected?: boolean }) => (
  <span
    className={`ml-1.5 whitespace-nowrap rounded-[5px] border px-[5px] align-[1px] font-mono text-[11px] font-medium leading-[normal] ${selected ? 'border-current text-on-accent' : 'border-rule text-ink3'}`}
  >
    {type}
  </span>
);

const SELECTED_LEAF = 'border-accent bg-accent-soft [box-shadow:0_0_0_3px_var(--accent-soft)]';

/**
 * The most levels of boxes the page draws, counting the Module as 0. Chrome stops the page when boxes nest much
 * deeper, as they can in one long line such as 1+1+...+1, so a box this deep holds a note instead of its boxes.
 */
export const DEEPEST_DRAWN = 24;

/** Where a box sits: how deep, counting the Module as 0. */
type BoxProps = TreeProps & { node: AstFact; depth: number };

/** In place of the boxes too deep to draw: how many there are. */
const NotDrawn = ({ analysis, node }: { analysis: Analysis; node: AstFact }) => (
  <p className="max-w-[40ch] text-[13px] text-ink2">
    <ExplanationText spans={explainNotDrawn(analysis, node)} />
  </p>
);

/** One box of the tree diagram, with the boxes inside it, field by field. A name or a fixed value is drawn as its text. */
function Box({ node, depth, ...props }: BoxProps) {
  const { analysis, selectedNode, onSelect } = props;
  const isSelected = node.id === selectedNode?.id;
  const text = leafText(node);
  const label = <ExplanationText spans={treeLabel(analysis, node)} />;
  if (text !== null) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <button
          type="button"
          className={`min-h-[44px] cursor-pointer whitespace-pre rounded-lg border-[1.5px] px-3 py-1.5 text-left font-mono text-[17px] text-ink ${isSelected ? SELECTED_LEAF : `${leafBorder(node)} bg-transparent hover:bg-sunk`}`}
          data-fact-id={node.id}
          aria-pressed={isSelected}
          aria-label={spoken(analysis, node)}
          onClick={() => onSelect(node)}
        >
          {text}
        </button>
        <span className="whitespace-nowrap text-[13px] text-ink2" aria-hidden="true">
          {label}
          <TypeTag type={node.type} />
        </span>
      </div>
    );
  }
  const fields = boxFields(analysis, node);
  // A box with statements in it, such as a function or a loop, lists its fields one under another, as its code does.
  const stacked = fields.some((field) => STATEMENT_FIELDS.has(field.name));
  // Flex, not grid: Chrome lays a grid's contents out more than once, and nested grids take time that doubles at every level.
  return (
    <div className={`flex w-max flex-col items-start gap-2 rounded-xl border-[1.5px] px-2.5 pb-2.5 pt-2 ${isSelected ? 'border-accent bg-accent-soft' : 'border-rule2'}`}>
      <button
        type="button"
        className={`cursor-pointer whitespace-nowrap rounded-md px-2 py-1 text-left text-[14px] font-semibold ${isSelected ? 'bg-accent text-on-accent' : 'bg-sunk text-ink hover:bg-rule'}`}
        data-fact-id={node.id}
        aria-pressed={isSelected}
        aria-label={spoken(analysis, node)}
        onClick={() => onSelect(node)}
      >
        {label}
        <TypeTag type={node.type} selected={isSelected} />
      </button>
      {fields.length > 0 && depth >= DEEPEST_DRAWN && <NotDrawn analysis={analysis} node={node} />}
      {fields.length > 0 && depth < DEEPEST_DRAWN && (
        <div className={`flex gap-x-3 gap-y-2.5 ${stacked ? 'flex-col' : 'flex-wrap items-start'}`}>
          {fields.map((field) => (
            <div className="flex flex-col gap-1" key={field.name}>
              <span className="whitespace-nowrap font-mono text-[11px] leading-[normal] text-ink3">
                <ExplanationText spans={fieldLabel(node, field.name)} />
              </span>
              <ul
                className={`flex gap-x-3 gap-y-2.5 ${STATEMENT_FIELDS.has(field.name) ? 'flex-col items-start' : 'flex-wrap items-start'}`}
                aria-label={plain(fieldLabel(node, field.name))}
              >
                {field.nodes.map((child) => (
                  <li key={child.id}>
                    <Box node={child} depth={depth + 1} {...props} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One line of the phone outline, with the boxes inside it indented under it, field by field. */
function OutlineItem({ node, depth, ...props }: BoxProps) {
  const { analysis, selectedNode, onSelect } = props;
  const isSelected = node.id === selectedNode?.id;
  const text = leafText(node);
  const fields = boxFields(analysis, node);
  return (
    <li className="flex flex-col items-start gap-1">
      <button
        type="button"
        className={`min-h-[36px] cursor-pointer rounded-md border-[1.5px] px-2 py-1 text-left text-[14px] [overflow-wrap:anywhere] ${isSelected ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-sunk'}`}
        data-fact-id={node.id}
        aria-pressed={isSelected}
        aria-label={spoken(analysis, node)}
        onClick={() => onSelect(node)}
      >
        {text !== null && <code className="mr-2 whitespace-pre-wrap font-mono text-[15px] text-ink">{text}</code>}
        <span className={text === null ? 'font-semibold text-ink' : 'text-ink2'}>
          <ExplanationText spans={treeLabel(analysis, node)} />
        </span>
        <TypeTag type={node.type} />
      </button>
      {fields.length > 0 && depth >= DEEPEST_DRAWN && (
        <div className="ml-2 border-l border-rule pl-3">
          <NotDrawn analysis={analysis} node={node} />
        </div>
      )}
      {depth < DEEPEST_DRAWN &&
        fields.map((field) => (
          <div className="ml-2 flex flex-col gap-1 self-stretch border-l border-rule pl-3" key={field.name}>
            <span className="font-mono text-[11px] leading-[normal] text-ink3">
              <ExplanationText spans={fieldLabel(node, field.name)} />
            </span>
            <ul className="flex flex-col gap-1" aria-label={plain(fieldLabel(node, field.name))}>
              {field.nodes.map((child) => (
                <OutlineItem key={child.id} node={child} depth={depth + 1} {...props} />
              ))}
            </ul>
          </div>
        ))}
    </li>
  );
}

/** Zoom level 4: the Program's syntax tree, as boxes inside boxes on a wide screen, and as an indented outline on a phone. */
export function SyntaxTreeZoomLevel(props: TreeProps) {
  const { analysis } = props;
  const [module] = analysis.ast;
  if (!module) {
    return (
      <p className="text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level4.noTree', analysis).text} />
      </p>
    );
  }
  const signposts = explainSignposts(analysis);
  return (
    <>
      <p className="mb-3.5 text-[14px] text-ink2">
        <ExplanationText spans={explainProgram('level4.caption', analysis).text} />
      </p>
      <div className="overflow-x-auto p-0.5 narrow:hidden">
        <Box node={module} depth={0} {...props} />
      </div>
      <ul className="hidden narrow:block" aria-label="Your program’s structure">
        <OutlineItem node={module} depth={0} {...props} />
      </ul>
      {signposts && (
        <section className="mt-4 grid max-w-[780px] gap-1.5 rounded-xl border border-rule bg-sunk px-4 py-3.5" aria-labelledby="signposts-title">
          <h3 id="signposts-title" className="text-[13px] font-semibold text-ink2">
            <ExplanationText spans={signposts.title!} />
          </h3>
          <p className="text-[14px] leading-[1.6] text-ink2">
            <ExplanationText spans={signposts.text} />
          </p>
        </section>
      )}
    </>
  );
}
