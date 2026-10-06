import { expect, test } from 'vitest';
import { analysisOf, astOf, greetAnalysis, helloWorld, tokensOf } from '../testAnalysis';
import { explainProgram, type Explanation, type Span } from './explain';
import { boxLabel, explainNode, explainNotDrawn, explainSignposts, fieldLabel, leafText, nodeById as node, treeLabel } from './syntaxTree';

const plain = (spans: Span[] | undefined) => spans?.map((span) => span.text).join('');
const docsOf = ({ docs }: Explanation) => docs && { text: plain(docs.text), href: docs.href };

const greet = greetAnalysis();
const hello = helloWorld();

/** The Explanation of one node of greet.py, as plain text. */
const explainGreet = (id: string) => {
  const explanation = explainNode(greet, node(greet, id));
  return { title: plain(explanation.title), text: plain(explanation.text) };
};

test('level 4’s introduction, caption and panel', () => {
  expect(plain(explainProgram('level4.intro', hello).text)).toBe(
    'Words alone don’t say what goes with what. So Python works out the structure: which pieces belong together, which lines belong inside which block, and what each line does, recorded as boxes inside boxes.',
  );
  expect(explainProgram('level4.intro', hello).text).toContainEqual({ text: 'structure', concept: 'structure' });
  expect(plain(explainProgram('level4.caption', hello).text)).toBe('Your program as the 5 boxes Python made, each inside the box that holds it. Select one to see its role.');
});

test('the panel names only the signposts the Program has: brackets, indentation, or both', () => {
  expect(plain(explainSignposts(greet)!.title)).toBe('Where did the brackets, colons and indentation go?');
  expect(plain(explainSignposts(hello)!.title)).toBe('Where did the brackets go?');
  expect(plain(explainSignposts(hello)!.text)).toBe(
    'They were signposts, showing which pieces go together. The boxes now show that directly, by sitting inside each other, so the signposts are no longer needed.',
  );

  const loop = 'while x:\n    pass\n';
  const blocks = analysisOf(loop, [], {
    tokens: tokensOf(loop, [
      ['NAME', 'while', [1, 0], [1, 5]],
      ['NAME', 'x', [1, 6], [1, 7]],
      ['OP', ':', [1, 7], [1, 8], 'COLON'],
      ['NEWLINE', '\n', [1, 8], [1, 9]],
      ['INDENT', '    ', [2, 0], [2, 4]],
      ['NAME', 'pass', [2, 4], [2, 8]],
      ['NEWLINE', '\n', [2, 8], [2, 9]],
      ['DEDENT', '', [3, 0], [3, 0]],
      ['ENDMARKER', '', [3, 0], [3, 0]],
    ]),
  });
  expect(plain(explainSignposts(blocks)!.title)).toBe('Where did the colons and indentation go?');
  // x = 1 has no brackets and no indented block, so it has no signposts to explain.
  const assignment = 'x = 1\n';
  const plainAssignment = analysisOf(assignment, [], {
    tokens: tokensOf(assignment, [
      ['NAME', 'x', [1, 0], [1, 1]],
      ['OP', '=', [1, 2], [1, 3], 'EQUAL'],
      ['NUMBER', '1', [1, 4], [1, 5]],
    ]),
  });
  expect(explainSignposts(plainAssignment)).toBeNull();
});

test('hello world: the Module holds one statement, a call to print with a fixed value', () => {
  expect(plain(explainNode(hello, node(hello, 'ast-0')).text)).toBe(
    'The biggest box is the whole program. It holds a list of your program’s statements, 1 statement in all. Python calls this box a Module.',
  );
  expect(plain(explainNode(hello, node(hello, 'ast-2')).text)).toBe('A call has two parts: what to call, and what to give it. This one calls print. Python calls this box a Call.');
  expect(plain(explainNode(hello, node(hello, 'ast-4')).title)).toBe('What to give it');
  expect(plain(explainNode(hello, node(hello, 'ast-4')).text)).toBe(
    'A fixed value typed straight into your code: Hello World!. The quote marks are gone; they only marked where the text starts and ends. Python calls this a Constant.',
  );
});

test('each box of greet.py is explained in prototype v8’s words, made true for any Program', () => {
  expect(explainGreet('ast-1')).toEqual({
    title: 'Define a function',
    text: 'Everything from def to the end of its indented block. It has a name, greet, a list of what it takes, and its own list of statements, 1 statement in all. Defining it doesn’t run it. Python calls this box a FunctionDef.',
  });
  expect(explainGreet('ast-2')).toEqual({ title: 'What it takes', text: 'The list of what greet takes. Python calls this box arguments. It doesn’t match any single piece of your code.' });
  expect(explainGreet('ast-3')).toEqual({
    title: 'One input',
    text: 'The one input greet takes: name. When greet is called, whatever it is given gets this name, inside greet only. Python calls this an arg.',
  });
  expect(explainGreet('ast-4')).toEqual({ title: 'One statement', text: 'A statement that does something and doesn’t keep the answer, which is fine: nobody needs it. Python calls it an Expr statement.' });
  expect(explainGreet('ast-6')).toEqual({
    title: 'What to call',
    text: 'Just a name for now: print. Python doesn’t know yet what it points to. It looks the name up when the program runs. Python calls this a Name.',
  });
  expect(explainGreet('ast-9')).toEqual({
    title: 'A loop',
    text: 'Everything from for to the end of its indented block. It has a name each item gets (person), something to go through (["Ada", "Grace"]) and what to do each time (1 statement). Python calls this box a For.',
  });
  expect(explainGreet('ast-10')).toEqual({
    title: 'The name each item gets',
    text: 'The name person is given a value each trip round the loop. Python calls this a Name being stored.',
  });
  expect(explainGreet('ast-11')).toEqual({ title: 'A list', text: 'The list ["Ada", "Grace"], with its 2 items. Python calls this box a List.' });
  expect(explainGreet('ast-12').title).toBe('An item');
  expect(explainGreet('ast-15').text).toBe('A call has two parts: what to call, and what to give it. This one calls greet. Python calls this box a Call.');
});

test('a box and a leaf show their plain names, and a field its role', () => {
  expect(plain(boxLabel(greet, node(greet, 'ast-0')))).toBe('Your program');
  expect(plain(boxLabel(greet, node(greet, 'ast-5')))).toBe('Call a function');
  // In the tree, a box with a name of its own shows it, as v8 did for the function.
  expect(plain(treeLabel(greet, node(greet, 'ast-1')))).toBe('Define a function: greet');
  expect(plain(treeLabel(greet, node(greet, 'ast-5')))).toBe('Call a function');
  expect(plain(treeLabel(greet, node(greet, 'ast-6')))).toBe('What to call');
  expect(leafText(node(greet, 'ast-6'))).toBe('print');
  expect(leafText(node(greet, 'ast-7'))).toBe('Hello,');
  expect(leafText(node(greet, 'ast-3'))).toBe('name');
  expect(leafText(node(greet, 'ast-5'))).toBeNull();

  expect(plain(fieldLabel(node(greet, 'ast-0'), 'body'))).toBe('its statements');
  expect(plain(fieldLabel(node(greet, 'ast-1'), 'args'))).toBe('what it takes');
  expect(plain(fieldLabel(node(greet, 'ast-5'), 'args'))).toBe('what to give it');
  expect(plain(fieldLabel(node(greet, 'ast-9'), 'iter'))).toBe('what to go through');
  // A field with no words of its own keeps the name Python gives it.
  expect(plain(fieldLabel(node(greet, 'ast-1'), 'decorator_list'))).toBe('decorator_list');
});

test('a function of two inputs, a number, and a name that is only stored', () => {
  const program = 'def add(a, b):\n    total = a + 1\n    return total\n';
  const analysis = analysisOf(program, [], {
    ast: astOf([
      { type: 'Module', parent: null, field: null, kids: [['body', 1]] },
      { type: 'FunctionDef', parent: 0, field: 'body', kids: [['args', 2], ['body', 5], ['body', 10]], span: [0, 49], name: 'add' },
      { type: 'arguments', parent: 1, field: 'args', kids: [['args', 3], ['args', 4]] },
      { type: 'arg', parent: 2, field: 'args', kids: [], span: [8, 9], arg: 'a' },
      { type: 'arg', parent: 2, field: 'args', kids: [], span: [11, 12], arg: 'b' },
      { type: 'Assign', parent: 1, field: 'body', kids: [['targets', 6], ['value', 7]], span: [19, 32] },
      { type: 'Name', parent: 5, field: 'targets', kids: [], span: [19, 24], id: 'total', ctx: 'Store' },
      { type: 'BinOp', parent: 5, field: 'value', kids: [['left', 8], ['right', 9]], span: [27, 32] },
      { type: 'Name', parent: 7, field: 'left', kids: [], span: [27, 28], id: 'a', ctx: 'Load' },
      { type: 'Constant', parent: 7, field: 'right', kids: [], span: [31, 32], value: '1' },
      { type: 'Return', parent: 1, field: 'body', kids: [['value', 11]], span: [37, 49] },
      { type: 'Name', parent: 10, field: 'value', kids: [], span: [44, 49], id: 'total', ctx: 'Load' },
    ]),
  });
  // A BinOp's operator sits between its left and right, as Python lists its fields.
  analysis.ast[7].fields.splice(1, 0, { name: 'op', value: 'Add()' });
  const text = (id: string) => plain(explainNode(analysis, node(analysis, id)).text);

  expect(text('ast-3')).toBe('One of the inputs add takes: a. When add is called, what it is given for this input gets this name, inside add only. Python calls this an arg.');
  expect(text('ast-5')).toBe('Python works out the value on the right of the =, then stores it in total, on the left. Python calls this box an Assign.');
  expect(text('ast-6')).toBe('The name total is given a value here. Python calls this a Name being stored.');
  expect(text('ast-7')).toBe(
    'Two values with an operator between them, +. Python works out the answer when the program runs. Python calls this box a BinOp, short for “binary operation”: an operation on two values. It calls the operator Add.',
  );
  expect(text('ast-9')).toBe('A fixed value typed straight into your code: 1. Python calls this a Constant.');
  expect(leafText(node(analysis, 'ast-9'))).toBe('1');
  expect(plain(explainNode(analysis, node(analysis, 'ast-10')).title)).toBe('Hand back an answer');
});

test('a kind of box with no Template of its own gets a general one, which still names it and its code', () => {
  const program = 'while x:\n    pass\n';
  const analysis = analysisOf(program, [], {
    ast: astOf([
      { type: 'Module', parent: null, field: null, kids: [['body', 1]] },
      { type: 'While', parent: 0, field: 'body', kids: [['test', 2], ['body', 3]], span: [0, 17] },
      { type: 'Name', parent: 1, field: 'test', kids: [], span: [6, 7], id: 'x', ctx: 'Load' },
      { type: 'Pass', parent: 1, field: 'body', kids: [], span: [13, 17] },
    ]),
  });

  expect(plain(explainNode(analysis, node(analysis, 'ast-3')).title)).toBe('Part of your program');
  expect(plain(explainNode(analysis, node(analysis, 'ast-3')).text)).toBe('Python calls this box a Pass. It stands for this part of your code: pass.');
  expect(docsOf(explainNode(analysis, node(analysis, 'ast-3')))).toEqual({
    text: 'Read about Pass in Python’s documentation',
    href: 'https://docs.python.org/3.14/library/ast.html#ast.Pass',
  });
  expect(explainNode(analysis, node(analysis, 'ast-2')).docs).toBeUndefined();
  expect(leafText(node(analysis, 'ast-3'))).toBeNull();
});

test('a box too deep to draw the boxes inside it says how many there are', () => {
  expect(plain(explainNotDrawn(greet, node(greet, 'ast-9')))).toBe('Not drawn: the 8 boxes inside this one. Your program’s tree is too deep to draw in full.');
  expect(plain(explainNotDrawn(greet, node(greet, 'ast-2')))).toBe('Not drawn: the 1 box inside this one. Your program’s tree is too deep to draw in full.');
});
