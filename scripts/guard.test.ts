// The guard's patterns, tested on made-up values built at run time, so no literal in this file could itself trip the
// guard. The real refusals (a staged key, an email, a phone number, a home path) were proven with real commits when
// the guard was built; these tests keep the patterns honest.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanDiff, ownNames } from './guard.ts';

const at = '@';
const diffWith = (line: string) => `+++ b/some/file.ts\n+${line}\n`;
const kinds = (line: string, names: string[] = []) => scanDiff(diffWith(line), names).map((f) => f.kind.split(' (')[0]);

test('an email address, a phone shape and a home path are each found, with the file named', () => {
  assert.deepEqual(kinds(`write to made-up${at}not-example-mail.com please`), ['an email address']);
  assert.deepEqual(kinds(`call ${['555', '123', '4567'].join('-')} today`), ['a phone-number shape']);
  assert.deepEqual(kinds(`${'/Use' + 'rs/'}madeupname/tools`), ['a home path with a user name']);
  assert.equal(scanDiff(diffWith('nothing personal here'), []).length, 0);
  assert.equal(scanDiff(`+++ b/a.ts\n context line, not added\n-removed${at}line.com\n`, []).length, 0);
});

test("the computer's own names are matched from the list, which is never printed", () => {
  const findings = scanDiff(diffWith('deployed from madeuphost last week'), ['madeuphost']);
  assert.deepEqual(findings, [{ file: 'some/file.ts', kind: "this computer's user, host or account name" }]);
  for (const f of findings) assert.ok(!f.kind.includes('madeuphost'));
});

test('one file reports each kind once, not per line', () => {
  const diff = `+++ b/a.md\n+one made-up${at}mail-one.net\n+two made-up${at}mail-two.net\n`;
  assert.equal(scanDiff(diff, []).length, 1);
});

test('ownNames answers lowercase whole-word pieces of four characters or more', () => {
  for (const n of ownNames()) {
    assert.equal(n, n.toLowerCase());
    assert.ok(n.length >= 4);
  }
});

test('a name matches as a whole word, never inside another word', () => {
  assert.equal(scanDiff(diffWith('the project and its prototype'), ['pro']).length, 0);
  assert.equal(scanDiff(diffWith('a approve comment'), ['appro']).length, 0);
  assert.equal(scanDiff(diffWith('shipped by madeupname-2 today'), ['madeupname-2']).length, 1);
});
