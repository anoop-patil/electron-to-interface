import type { Analysis, AstFact, NodeSlot } from '../generated/analysis';
import { counted, fill, fillString, hasTemplate, programFacts, template, type Explanation, type Span, type TemplateId } from './explain';

/** The fields that hold a list of statements, which the tree shows one under another. */
export const STATEMENT_FIELDS = new Set(['body', 'orelse', 'finalbody', 'handlers', 'cases']);

/** The fields that hold a node's own name: a Name's id, a FunctionDef's name, an arg's arg, an Attribute's attr. */
const NAME_FIELDS = ['id', 'name', 'arg', 'attr'];

/** The fields of arguments that hold its inputs, rather than their default values. */
const INPUT_FIELDS = new Set(['posonlyargs', 'args', 'vararg', 'kwonlyargs', 'kwarg']);

/** A BinOp's operator, by the name ast gives it, as you write it. */
const OPERATORS: Record<string, string> = {
  Add: '+', Sub: '-', Mult: '*', MatMult: '@', Div: '/', Mod: '%', Pow: '**',
  LShift: '<<', RShift: '>>', BitOr: '|', BitXor: '^', BitAnd: '&', FloorDiv: '//',
};

/** The Templates for kinds of node that need nothing more than their type to pick one. */
const NODE_TEMPLATES: Record<string, TemplateId> = {
  Module: 'node.module',
  FunctionDef: 'node.functionDef',
  arguments: 'node.arguments',
  Expr: 'node.expr',
  Call: 'node.call',
  For: 'node.for',
  List: 'node.list',
  Assign: 'node.assign',
  BinOp: 'node.binOp',
  If: 'node.if',
  Return: 'node.return',
  Attribute: 'node.attribute',
};

/** The node with this Fact ID. ast-N is the Nth node of the Analysis's list, counting from 0, so it is found without a search. */
export const nodeById = (analysis: Analysis, id: string) => analysis.ast[Number(id.slice('ast-'.length))];

/** A field's value, as `python -m ast` writes it, if the node has that field and it holds no nodes. */
export function valueOf(node: AstFact, name: string) {
  const field = node.fields.find((other) => other.name === name);
  return field && 'value' in field ? field.value : undefined;
}

/** The nodes a field holds, in order: none if the node has no such field. */
export function nodesIn(analysis: Analysis, node: AstFact, name: string) {
  const field = node.fields.find((other) => other.name === name);
  return field && 'nodes' in field ? field.nodes.map((id) => nodeById(analysis, id)) : [];
}

const hasNodes = (node: AstFact) => node.fields.some((field) => 'nodes' in field);

/** A piece of text, such as a name, written as Python writes it, 'print', without its quote marks. */
const unquoted = (value: string) => value.slice(1, -1);

/** Python writes a piece of text, and nothing else, starting with a quote mark: 'Hi' or "it's". */
export const isText = (value: string) => /^['"]/.test(value);

/** The node's code, as it is in the Program. Empty for a node with no place in the code. */
export function codeOf(analysis: Analysis, node: AstFact) {
  if (!node.span) return '';
  const bytes = analysis.bytes.slice(node.span.start, node.span.end).map((byte) => byte.value);
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** The node's own name, without quote marks, or empty if it has none. */
function nameOf(node: AstFact) {
  const value = NAME_FIELDS.map((name) => valueOf(node, name)).find((found) => found !== undefined);
  return value && isText(value) ? unquoted(value) : '';
}

/** The function an arguments or arg box belongs to: its name, or the lambda. */
function functionOf(analysis: Analysis, node: AstFact) {
  for (let parent = node.parent; parent; parent = nodeById(analysis, parent).parent) {
    const found = nodeById(analysis, parent);
    if (found.type === 'Lambda') return 'the lambda';
    if (found.type === 'FunctionDef' || found.type === 'AsyncFunctionDef') return nameOf(found);
  }
  return '';
}

/** A Constant's value, as its box shows it: a piece of text without its quote marks, anything else as Python writes it. */
function constantOf(node: AstFact) {
  const value = valueOf(node, 'value') ?? '';
  return isText(value) ? unquoted(value) : value;
}

const codeIn = (analysis: Analysis, node: AstFact, field: string) =>
  nodesIn(analysis, node, field)
    .map((other) => codeOf(analysis, other))
    .join(' and ');

export function nodeFacts(analysis: Analysis, node: AstFact): Record<NodeSlot, string> {
  const op = valueOf(node, 'op')?.replace(/\(\)$/, '') ?? '';
  return {
    type: node.type,
    name: nameOf(node),
    value: node.type === 'Constant' ? constantOf(node) : '',
    code: codeOf(analysis, node),
    statements: counted(nodesIn(analysis, node, 'body').length, 'statement', 'statements'),
    items: counted(nodesIn(analysis, node, 'elts').length, 'item', 'items'),
    func: codeIn(analysis, node, 'func'),
    // Only arguments and arg belong to a function. Walking up from every node would take too long in a deep tree.
    function: node.type === 'arguments' || node.type === 'arg' ? functionOf(analysis, node) : '',
    target: codeIn(analysis, node, node.type === 'Assign' ? 'targets' : 'target'),
    iter: codeIn(analysis, node, 'iter'),
    test: codeIn(analysis, node, 'test'),
    operator: OPERATORS[op] ?? '',
    op,
    owner: node.type === 'Attribute' ? codeIn(analysis, node, 'value') : '',
    // Counting every box inside every box would take too long in a deep tree; explainNotDrawn fills it in where it is needed.
    inside: '',
  };
}

/** How many inputs a function takes, from the arguments box that holds its inputs. */
const inputsOf = (box: AstFact) =>
  box.fields.filter((field) => INPUT_FIELDS.has(field.name)).reduce((count, field) => count + ('nodes' in field ? field.nodes.length : 0), 0);

/** Which kind of node this is, which picks its Template. A kind with no Template of its own gets a general one. */
export function nodeKind(analysis: Analysis, node: AstFact): TemplateId {
  const parent = node.parent ? nodeById(analysis, node.parent) : null;
  switch (node.type) {
    case 'arg':
      return parent?.type === 'arguments' && inputsOf(parent) === 1 ? 'node.argOnly' : 'node.arg';
    case 'Name': {
      const ctx = valueOf(node, 'ctx');
      if (ctx === 'Load()') return 'node.name';
      if (ctx === 'Store()') return parent?.type === 'For' && node.field === 'target' ? 'node.nameStoreLoop' : 'node.nameStore';
      break;
    }
    case 'Constant':
      return isText(valueOf(node, 'value') ?? '') ? 'node.constantText' : 'node.constant';
  }
  return NODE_TEMPLATES[node.type] ?? (node.span ? 'node.other' : 'node.otherNoPlace');
}

const lowerFirst = (word: string) => word[0].toLowerCase() + word.slice(1);

/** A name, a fixed value or an input, which the tree shows as its text, with its plain name under it. Null for any other node. */
export function leafText(node: AstFact) {
  if (hasNodes(node)) return null;
  if (node.type === 'Name' || node.type === 'arg') return nameOf(node);
  if (node.type === 'Constant') return constantOf(node);
  return null;
}

/**
 * A box's plain name, from its Template. A leaf, such as a name or a fixed value, is named by the role it plays in the
 * box that holds it, if that role has words of its own: What to call, What to give it.
 */
export function boxLabel(analysis: Analysis, node: AstFact): Span[] {
  const parent = node.parent ? nodeById(analysis, node.parent) : null;
  const role = parent && `role.${lowerFirst(parent.type)}.${node.field}`;
  if (leafText(node) !== null && role && hasTemplate(role)) return fillString(template(role, 'node').text);
  return fill(template(nodeKind(analysis, node), 'node'), nodeFacts(analysis, node)).title!;
}

/** In the tree, a box with a name of its own, such as a function, shows it after its plain name: Define a function: greet. */
export function treeLabel(analysis: Analysis, node: AstFact): Span[] {
  const name = leafText(node) === null && nameOf(node);
  return name ? [...boxLabel(analysis, node), { text: `: ${name}` }] : boxLabel(analysis, node);
}

/** How many boxes a box holds, at any depth. */
function boxesInside(analysis: Analysis, node: AstFact) {
  let count = 0;
  const stack = [node];
  for (let box = stack.pop(); box; box = stack.pop()) {
    const inside = box.fields.flatMap((field) => ('nodes' in field ? field.nodes : [])).map((id) => nodeById(analysis, id));
    count += inside.length;
    stack.push(...inside);
  }
  return count;
}

/** In place of the boxes inside a box too deep in the tree to draw them: how many there are. */
export const explainNotDrawn = (analysis: Analysis, node: AstFact) =>
  fillString(template('level4.notDrawn', 'node').text, { ...nodeFacts(analysis, node), inside: counted(boxesInside(analysis, node), 'box', 'boxes') });

/** The tokens that group pieces together. */
const BRACKETS = new Set(['LPAR', 'RPAR', 'LSQB', 'RSQB', 'LBRACE', 'RBRACE', 'COMMA']);

/**
 * Level 4's panel on the signposts the boxes replace: brackets, and the colons and indentation of indented blocks.
 * It names only those the Program has, and is null for a Program with neither.
 */
export function explainSignposts(analysis: Analysis): Explanation | null {
  const brackets = analysis.tokens.some((token) => BRACKETS.has(token.exactType));
  const blocks = analysis.tokens.some((token) => token.type === 'INDENT');
  const id = brackets && blocks ? 'level4.signposts' : brackets ? 'level4.signpostsBrackets' : blocks ? 'level4.signpostsBlocks' : null;
  return id && fill(template(id, 'program'), programFacts(analysis));
}

/** What a field of a box holds, in plain words, such as what to give it; or the field's own name, if it has no words of its own. */
export function fieldLabel(node: AstFact, field: string): Span[] {
  const id = [`field.${lowerFirst(node.type)}.${field}`, `field.${field}`].find(hasTemplate);
  return id ? fillString(template(id, 'node').text) : [{ text: field }];
}

/** The Explanation of one box: its plain name, then what it is, from the Template for its kind. */
export function explainNode(analysis: Analysis, node: AstFact): Explanation {
  return { ...fill(template(nodeKind(analysis, node), 'node'), nodeFacts(analysis, node)), title: boxLabel(analysis, node) };
}
