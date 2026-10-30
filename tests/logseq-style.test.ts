import {
  maskProgressFractions,
  setProgressFractions,
} from '../src/logseq-style/progress-fraction';
import { NaturalDateParser } from '../src/parser/natural-date-parser';
import {
  applyTodosParent,
  isTodosChild,
  setTodosParentBlock,
  withTodo,
} from '../src/logseq-style/todos-parent';
import { expandShorthand, setPriority } from '../src/logseq-style/priority';
import { cleanKeywords, nextKeyword } from '../src/logseq-style/cycle-groups';

const KEYWORDS = [
  'TODO',
  'DOING',
  'DONE',
  'LATER',
  'NOW',
  'WAITING',
  'CANCELLED',
];

describe('progress fractions', () => {
  afterEach(() => setProgressFractions(true));

  it('blanks a small fraction and keeps the length', () => {
    const text = 'TODO read chapters 2/3';
    const masked = maskProgressFractions(text);
    expect(masked).toBe('TODO read chapters    ');
    expect(masked).toHaveLength(text.length);
  });

  it('leaves fractions that look like dates', () => {
    expect(maskProgressFractions('TODO call 12/25')).toBe('TODO call 12/25');
    expect(maskProgressFractions('TODO call 5/3')).toBe('TODO call 5/3');
  });

  it('keeps "2/3" from being parsed as a date', () => {
    expect(NaturalDateParser.parse('TODO read chapters 2/3')).toBeNull();
  });

  it('still finds another date on the same line', () => {
    const parsed = NaturalDateParser.parse('TODO read chapters 2/3 tomorrow');
    expect(parsed?.matchedText).toBe('tomorrow');
  });

  it('can be turned off', () => {
    setProgressFractions(false);
    expect(maskProgressFractions('TODO read 2/3')).toBe('TODO read 2/3');
  });
});

describe('todos: parent block', () => {
  afterEach(() => setTodosParentBlock(true));

  const lines = [
    '- todos:',
    '  - write the report',
    '  - DOING review the PR',
    '  - [ ] checkbox item',
    '    - grandchild',
    '  - **07:37** stamped item',
    '- not a child',
  ];

  it('adds TODO to plain direct children only', () => {
    expect(applyTodosParent(lines, KEYWORDS)).toEqual([
      '- todos:',
      '  - TODO write the report',
      '  - DOING review the PR',
      '  - [ ] checkbox item',
      '    - grandchild',
      '  - **07:37** TODO stamped item',
      '- not a child',
    ]);
  });

  it('accepts a full-width colon and bold heading', () => {
    expect(applyTodosParent(['- **todos**：', '  - item'], KEYWORDS)[1]).toBe(
      '  - TODO item',
    );
  });

  it('ignores lines inside code fences', () => {
    const fenced = ['- todos:', '```', '  - item', '```'];
    expect(applyTodosParent(fenced, KEYWORDS)).toEqual(fenced);
  });

  it('checks a single line against its parent', () => {
    const get = (n: number) => lines[n];
    expect(isTodosChild(get, 1, KEYWORDS)).toBe(true);
    expect(isTodosChild(get, 2, KEYWORDS)).toBe(false);
    expect(isTodosChild(get, 4, KEYWORDS)).toBe(false);
    expect(isTodosChild(get, 6, KEYWORDS)).toBe(false);
  });

  it('can be turned off', () => {
    setTodosParentBlock(false);
    expect(applyTodosParent(lines, KEYWORDS)).toEqual(lines);
    expect(isTodosChild((n) => lines[n], 1, KEYWORDS)).toBe(false);
  });

  it('inserts the keyword after the marker', () => {
    expect(withTodo('  1. item')).toBe('  1. TODO item');
  });
});

describe('priority shorthand', () => {
  it.each([
    ['- todoa write', '- TODO [#A] write'],
    ['- todo a 写稿', '- TODO [#A] 写稿'],
    ['- doing b 写周报', '- DOING [#B] 写周报'],
    ['- todo c', '- TODO [#C]'],
    ['- doing b 14:05 report', '- DOING 14:05 [#B] report'],
  ])('expands %s', (line, expected) => {
    expect(expandShorthand(line, KEYWORDS)).toBe(expected);
  });

  it('leaves English sentences alone', () => {
    expect(expandShorthand('- todo a book', KEYWORDS)).toBeNull();
    expect(expandShorthand('- todo a write', KEYWORDS)).toBeNull();
    expect(expandShorthand('- no a 办法', [...KEYWORDS, 'NO'])).toBeNull();
    expect(expandShorthand('- TODO write', KEYWORDS)).toBeNull();
  });

  it('uppercases listed keywords', () => {
    expect(expandShorthand('- todo4ai draft', KEYWORDS, ['TODO4AI'])).toBe(
      '- TODO4AI draft',
    );
    expect(
      expandShorthand('- TODO4AI draft', KEYWORDS, ['TODO4AI']),
    ).toBeNull();
  });

  it('sets the priority after keyword and time', () => {
    expect(setPriority('- DOING 14:05 report', 'A', KEYWORDS)).toBe(
      '- DOING 14:05 [#A] report',
    );
    expect(setPriority('- TODO [#B] report', 'C', KEYWORDS)).toBe(
      '- TODO [#C] report',
    );
    expect(setPriority('- TODO [#B] report', '', KEYWORDS)).toBe(
      '- TODO report',
    );
  });
});

describe('cycle groups', () => {
  const group = { id: 'g', name: 'Decide', keywords: ['maybe', 'YES', ' no '] };

  it('cleans keywords', () => {
    expect(cleanKeywords(['maybe', 'MAYBE', ' ', 'yes'])).toEqual([
      'MAYBE',
      'YES',
    ]);
  });

  it('moves to the next keyword and wraps', () => {
    expect(nextKeyword(group, 'MAYBE')).toBe('YES');
    expect(nextKeyword(group, 'NO')).toBe('MAYBE');
  });

  it('starts at the first keyword outside the group', () => {
    expect(nextKeyword(group, '')).toBe('MAYBE');
    expect(nextKeyword(group, 'TODO')).toBe('MAYBE');
  });
});
