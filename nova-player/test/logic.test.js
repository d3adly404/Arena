'use strict';

/* Unit tests for the pure logic modules (run with: npm test). */
const assert = require('node:assert');
const U = require('../src/renderer/js/utils.js');
const { create } = require('../src/renderer/js/playlist.js');

// ------------------------------ utils: fmtTime -----------------------------
assert.strictEqual(U.fmtTime(0), '0:00');
assert.strictEqual(U.fmtTime(5), '0:05');
assert.strictEqual(U.fmtTime(59), '0:59');
assert.strictEqual(U.fmtTime(60), '1:00');
assert.strictEqual(U.fmtTime(3599), '59:59');
assert.strictEqual(U.fmtTime(3661), '1:01:01');
assert.strictEqual(U.fmtTime(Infinity), '0:00');
assert.strictEqual(U.fmtTime(NaN), '0:00');
assert.strictEqual(U.fmtTime(-5), '0:00');

// --------------------------- utils: extOf / kindOf -------------------------
assert.strictEqual(U.extOf('C:\\Music\\song.MP3'), '.mp3');
assert.strictEqual(U.extOf('/a/b/c.mkv'), '.mkv');
assert.strictEqual(U.extOf('noext'), '');
assert.strictEqual(U.kindOf('/a/b/c.mkv'), 'video');
assert.strictEqual(U.kindOf('d:/x/y.flac'), 'audio');
assert.strictEqual(U.kindOf('C:\\a\\b\\MOV.MOV'), 'video');
assert.strictEqual(U.kindOf('noext'), 'unknown');

// ------------------------------ utils: basename ----------------------------
assert.strictEqual(U.basename('C:\\a\\b\\file.mp4'), 'file.mp4');
assert.strictEqual(U.basename('/a/b/file.mp4'), 'file.mp4');

// ------------------------------ utils: toFileUrl ---------------------------
assert.strictEqual(
  U.toFileUrl('C:\\Users\\me\\vid - copy.MP4'),
  'file:///C:/Users/me/vid%20-%20copy.MP4'
);
assert.strictEqual(U.toFileUrl('D:/a b/c.webm'), 'file:///D:/a%20b/c.webm');
assert.strictEqual(U.toFileUrl('\\\\server\\share\\v.mp4'), 'file://server/share/v.mp4');

// ------------------------------ playlist -----------------------------------
const pl = create();
assert.strictEqual(pl.items.length, 0);
assert.strictEqual(pl.index, -1);
assert.strictEqual(pl.next(), -1);

const added = pl.add(['a.mp4', 'b.mkv']);
assert.strictEqual(added.count, 2);
assert.strictEqual(added.firstIndex, 0);
assert.strictEqual(pl.index, 0); // first add selects the first item

// sequential next / prev (next/prev compute; playIndex commits)
assert.strictEqual(pl.next(), 1);
pl.playIndex(1);
assert.strictEqual(pl.next(), -1); // at end, repeat 'none'
assert.strictEqual(pl.prev(), 0);
pl.playIndex(0);
assert.strictEqual(pl.prev(), 0); // stays at start
pl.playIndex(1);
assert.strictEqual(pl.prev(), 0);

// repeat modes
pl.playIndex(1);
pl.repeat = 'all';
assert.strictEqual(pl.next(), 0);
pl.repeat = 'one';
assert.strictEqual(pl.next(), 1);
pl.repeat = 'none';

// removal keeps the index sane
pl.removeAt(0);
assert.strictEqual(pl.items.length, 1);
assert.strictEqual(pl.items[0].path, 'b.mkv');
assert.strictEqual(pl.index, 0);
pl.removeAt(0);
assert.strictEqual(pl.index, -1);
assert.strictEqual(pl.next(), -1);

// shuffle: every other item appears before a repeat
pl.add(['x.mp3', 'y.mp3', 'z.mp3']);
pl.playIndex(0);
pl.shuffle = true;
const seen = new Set([0]);
let guard = 0;
while (guard++ < 100) {
  const cur = pl.index;
  const n = pl.next();
  assert.notStrictEqual(n, cur, 'shuffle must not immediately repeat the current item');
  seen.add(n);
  pl.advanceTo(n); // auto-advance keeps the shuffle queue
  if (seen.size === 3) break;
}
assert.strictEqual(seen.size, 3, 'shuffle should cover all items');
pl.shuffle = false;

// move
assert.deepStrictEqual(pl.items.map((e) => e.path), ['x.mp3', 'y.mp3', 'z.mp3']);
pl.move(0, 2);
assert.deepStrictEqual(pl.items.map((e) => e.path), ['y.mp3', 'z.mp3', 'x.mp3']);

// move keeps track of the current item (c.mkv is playing throughout)
const pl3 = create();
pl3.add(['a.mp4', 'b.mkv', 'c.mkv']);
pl3.playIndex(2); // [a, b, c] — c at 2
pl3.move(0, 2); // a to back: [b, c, a] — c at 1
assert.strictEqual(pl3.index, 1);
assert.strictEqual(pl3.items[pl3.index].path, 'c.mkv');
pl3.move(2, 0); // a to front: [a, b, c] — c at 2
assert.strictEqual(pl3.index, 2);
assert.strictEqual(pl3.items[pl3.index].path, 'c.mkv');
pl3.move(0, 2); // a to back: [b, c, a] — c at 1
assert.strictEqual(pl3.index, 1);
assert.strictEqual(pl3.items[pl3.index].path, 'c.mkv');
pl3.move(1, 0); // c to front: [c, b, a] — c at 0
assert.strictEqual(pl3.index, 0);
assert.strictEqual(pl3.items[pl3.index].path, 'c.mkv');
pl3.move(0, 2); // c to back: [b, a, c] — c at 2
assert.strictEqual(pl3.index, 2);
assert.strictEqual(pl3.items[pl3.index].path, 'c.mkv');

// clear
pl.clear();
assert.strictEqual(pl.items.length, 0);
assert.strictEqual(pl.index, -1);

// entry normalization
const pl2 = create();
pl2.add([{ path: 'C:\\a\\b.mp4', name: 'b.mp4' }, 'C:\\c\\d.mkv']);
assert.strictEqual(pl2.items.length, 2);
assert.strictEqual(pl2.items[1].path, 'C:\\c\\d.mkv');
assert.strictEqual(pl2.items[1].name, 'd.mkv');
const dup = pl2.add([null, '', { name: 'no path' }]);
assert.strictEqual(dup.count, 0);

console.log('All logic tests passed.');
