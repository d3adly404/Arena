'use strict';

/**
 * NovaPlaylist — playlist state machine (pure, no DOM).
 * Works in the browser (window.NovaPlaylist) and under Node (module.exports).
 *
 * repeat: 'none' | 'all' | 'one'
 * shuffle: uses a queue of remaining indices so items are not repeated
 *          until every other item has played.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NovaPlaylist = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function normalize(entry) {
    if (entry == null) return null;
    if (typeof entry === 'string') {
      const p = entry;
      if (!p) return null;
      const s = entry.replace(/\\/g, '/');
      const i = s.lastIndexOf('/');
      const name = i >= 0 ? s.slice(i + 1) : s;
      return { path: p, name: name || p };
    }
    const p = String((entry && entry.path) || '');
    if (!p) return null;
    return { path: p, name: String((entry && entry.name) || p) };
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function create() {
    const st = {
      items: [],
      index: -1,
      shuffle: false,
      repeat: 'none',
      queue: []
    };

    function rebuildQueue(excludeIndex) {
      const idxs = st.items.map((_, i) => i).filter((i) => i !== excludeIndex);
      st.queue = shuffled(idxs);
    }

    const api = {
      get items() { return st.items; },
      get index() { return st.index; },
      set index(i) { st.index = i; },
      get shuffle() { return st.shuffle; },
      set shuffle(v) {
        st.shuffle = !!v;
        st.queue = [];
      },
      get repeat() { return st.repeat; },
      set repeat(v) {
        if (v === 'all' || v === 'one') st.repeat = v;
        else st.repeat = 'none';
      },

      /**
       * Append entries (strings or {path, name}).
       * Returns { count, firstIndex } — firstIndex is the index of the
       * first appended item, or -1 when nothing was added.
       */
      add(entries) {
        const list = (entries || [])
          .map(normalize)
          .filter(Boolean);
        if (!list.length) return { count: 0, firstIndex: -1 };
        const first = st.items.length;
        st.items.push(...list);
        if (st.index === -1) st.index = first;
        st.queue = [];
        return { count: list.length, firstIndex: first };
      },

      /**
       * Index of the next item:
       *  -1        -> stop (end of list, repeat 'none')
       * same index -> repeat 'one'
       */
      next() {
        const n = st.items.length;
        if (!n) return -1;
        if (st.repeat === 'one') return st.index;
        if (st.shuffle) {
          if (!st.queue.length) rebuildQueue(st.index);
          if (!st.queue.length) return st.index; // single item
          return st.queue.pop();
        }
        if (st.index === n - 1) return st.repeat === 'all' ? 0 : -1;
        return st.index + 1;
      },

      /** Index of the previous item (never -1 when the list is non-empty). */
      prev() {
        const n = st.items.length;
        if (!n) return -1;
        if (st.repeat === 'one') return st.index;
        if (st.shuffle) return (st.index - 1 + n) % n;
        if (st.index === 0) return st.repeat === 'all' ? n - 1 : 0;
        return st.index - 1;
      },

      /** Manual selection: play this item (resets the shuffle queue). */
      playIndex(i) {
        if (!Number.isInteger(i) || i < 0 || i >= st.items.length) return false;
        st.index = i;
        st.queue = [];
        return true;
      },

      /** Auto-advance: set the current item, keep the shuffle queue. */
      advanceTo(i) {
        if (!Number.isInteger(i) || i < 0 || i >= st.items.length) return false;
        st.index = i;
        return true;
      },

      removeAt(i) {
        if (!Number.isInteger(i) || i < 0 || i >= st.items.length) return;
        st.items.splice(i, 1);
        if (i < st.index) st.index -= 1;
        else if (i === st.index) st.index = st.items.length ? Math.min(i, st.items.length - 1) : -1;
        st.queue = [];
      },

      clear() {
        st.items = [];
        st.index = -1;
        st.queue = [];
      },

      /** Move an item from one position to another (tracks the current item). */
      move(from, to) {
        const n = st.items.length;
        if (!Number.isInteger(from) || !Number.isInteger(to)) return;
        if (from === to || from < 0 || from >= n || to < 0 || to >= n) return;
        const i = st.index;
        const moved = st.items.splice(from, 1)[0];
        st.items.splice(to, 0, moved);
        // Two-phase: remove from `from`, then insert at `to`.
        if (i === from) st.index = to;
        else if (i < from) st.index = i >= to ? i + 1 : i;
        else {
          const shifted = i - 1;
          st.index = shifted >= to ? shifted + 1 : shifted;
        }
        st.queue = [];
      }
    };

    return api;
  }

  return { create };
});
