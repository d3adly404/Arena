#!/usr/bin/env python3
"""
artgen.py -- pixel art authoring tool for METRODIVINIA.

Every sprite is authored as a list of equal-width strings.  The script
  1. validates that every row has exactly the declared width,
  2. renders a contact sheet BMP so the art can be eyeballed,
  3. emits src/art_data.h containing the validated tables for the C engine.

Run:  python3 tools/artgen.py
"""
import os, sys, struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ------------------------------------------------------------------ palette
PAL = {
    '1': (0x1b, 0x15, 0x33),   # outline
    '2': (0x45, 0x4a, 0x6b),   # fur shadow
    '3': (0x77, 0x80, 0xa6),   # fur
    '4': (0xa9, 0xb4, 0xd8),   # fur light
    '5': (0xea, 0xf0, 0xff),   # muzzle white
    '6': (0xff, 0x8a, 0xa5),   # pink
    '7': (0x63, 0xe0, 0x8c),   # eye green
    '8': (0x12, 0x35, 0x24),   # eye dark
    '9': (0x2f, 0xb6, 0xa8),   # scarf teal
    'a': (0x1a, 0x7d, 0x78),   # scarf dark
    'b': (0xe6, 0xf6, 0xff),   # blade light
    'c': (0x9d, 0xc6, 0xdd),   # blade mid
    'd': (0xf0, 0xbd, 0x55),   # gold
    'e': (0x9a, 0x6a, 0x24),   # gold dark
    'f': (0xff, 0xff, 0xff),   # white
    'g': (0x3a, 0x9c, 0x5f),   # leaf green
    'h': (0x6f, 0xd1, 0x82),   # leaf light
    'i': (0x8a, 0x5a, 0x3c),   # brown
    'j': (0xc9, 0x8d, 0x5a),   # tan
    'k': (0x54, 0x32, 0x63),   # purple
    'l': (0x9b, 0x6b, 0xc4),   # purple light
    'm': (0xd9, 0x4f, 0x4f),   # red
    'n': (0xff, 0xa2, 0x3a),   # orange
    'o': (0xff, 0xe0, 0x7a),   # yellow
    'p': (0x2b, 0x6c, 0xb5),   # blue
    'q': (0x74, 0xc6, 0xf0),   # blue light
    'r': (0x2f, 0x3d, 0x52),   # dark steel
    's': (0x6a, 0x7d, 0x99),   # steel
    't': (0xb8, 0xc7, 0xd9),   # steel light
    'u': (0x14, 0x18, 0x24),   # near black
    'v': (0x7a, 0xd6, 0xc8),   # aqua
    'w': (0xd9, 0x6b, 0x2f),   # rust
    'x': (0x5c, 0x2b, 0x1e),   # dark rust
    'y': (0xf4, 0xd7, 0x9a),   # bone
    'z': (0x2a, 0x2f, 0x3d),   # charcoal
}

ERRORS = []

def chk(name, w, art):
    for i, r in enumerate(art):
        if len(r) != w:
            ERRORS.append("%s row %d width %d != %d : %r" % (name, i, len(r), w, r))
    bad = set()
    for r in art:
        for ch in r:
            if ch != '.' and ch not in PAL:
                bad.add(ch)
    if bad:
        ERRORS.append("%s unknown chars %s" % (name, sorted(bad)))
    return list(art)

SPR = {}          # name -> (w, h, rows)
NOTES = []
def add(name, w, art, pal=None):
    for ch in ''.join(art):
        if ch != '.' and ch not in PAL and ch != '\n':
            ERRORS.append("%s unknown char %r" % (name, ch))
    width = max(len(r) for r in art)
    if width != w:
        NOTES.append("%s: declared w=%d, derived w=%d" % (name, w, width))
    art = [r.ljust(width, '.') for r in art]
    SPR[name] = (width, len(art), art, pal or 'default')

# ============================================================ cat (18 x 22)
CW = 18

# Head + torso base (rows 0..16).  Legs are rows 17..21 and get swapped out.
CAT_BASE = [
    "....11.....11.....",   # 0  ear tips
    "...1221...1221....",   # 1
    "..126211112621....",   # 2
    "..13333333333331..",   # 3
    ".133333333333331..",   # 4
    ".1337733337733331.",   # 5  eyes
    ".1338733338733331.",   # 6
    ".1333355553333331.",   # 7  muzzle
    "..13355665533 31..",   # 8  (patched below)
    "...1333333331.....",   # 9
    "...1999999991.....",   # 10 scarf
    "..1999999999991...",   # 11
    "..1333999933 31...",   # 12 (patched below)
    ".1333333333331....",   # 13
    ".1334444444331....",   # 14
    ".1334444444331....",   # 15
    "..133444444331....",   # 16
]
# fix the two hand-written rows to be exactly 18 wide
CAT_BASE[8]  = "..133556655331 1.."
CAT_BASE[12] = "..13339999333 1..."

CAT_BASE[8]  = "..1335566553311..."
CAT_BASE[12] = "..1333999933311..."

# leg sets (rows 17..21) -- 5 rows of 18
LEGS = {
    'stand': [
        "..1331..1331......",
        "..1331..1331......",
        "..1331..1331......",
        ".113311.113311....",
        ".111111.111111....",
    ],
    'stand2': [
        "..1331..1331......",
        "..1331..1331......",
        "..1331..1331......",
        ".113311.113311....",
        ".111111.111111....",
    ],
    'run0': [
        "..1331...1331.....",
        "..1331....1331....",
        "..1331.....1331...",
        ".113311.....11331.",
        ".111111.....11111.",
    ],
    'run1': [
        "..1331..1331......",
        "..1331..1331......",
        "..1331..1331......",
        ".113311.113311....",
        ".111111.111111....",
    ],
    'run2': [
        "..1331..1331......",
        "..1331..1331......",
        "..1331..1331......",
        ".113311.113311....",
        ".111111.111111....",
    ],
    'run3': [
        "...1331..1331.....",
        "...1331..1331.....",
        "...1331..1331.....",
        "..113311113311....",
        "..111111111111....",
    ],
    'run4': [
        "..1331...1331.....",
        "..1331....1331....",
        "..1331.....1331...",
        ".113311.....11331.",
        ".111111.....11111.",
    ],
    'run5': [
        "..1331..1331......",
        "..1331..1331......",
        "..1331..1331......",
        ".113311.113311....",
        ".111111.111111....",
    ],
    'jump': [
        "..1331..1331......",
        "..1331..1331......",
        ".11331..1331......",
        ".11111..13311.....",
        "........111111....",
    ],
    'fall': [
        "..1331..1331......",
        "..1331..1331......",
        "..13311.1331......",
        "..13311.11331.....",
        "..11111..11111....",
    ],
    'crouch': [
        "..13311.1331......",
        ".113311.11331.....",
        ".111111.111111....",
        "..................",
        "..................",
    ],
    'hurt': [
        "..1331...1331.....",
        "..1331...1331.....",
        ".11331...13311....",
        ".11111...11111....",
        "..................",
    ],
    'dash': [
        "..1331..1331......",
        "..1331..1331......",
        "..13311.13311.....",
        ".11331111113311...",
        ".11111111111111...",
    ],
    'slide': [
        "..1331..1331......",
        "..1331..1331......",
        "..1331..1331......",
        ".113311.113311....",
        ".111111.111111....",
    ],
    'glide': [
        "..1331..1331......",
        "..1331..1331......",
        "..1331..1331......",
        ".113311.113311....",
        ".111111.111111....",
    ],
    'dead': [
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
    ],
    'divine': [
        "..1441..1441......",
        "..1441..1441......",
        "..1441..1441......",
        ".114411.114411....",
        ".111111.111111....",
    ],
}

def cat_frame(legs='stand', bob=0, arms=None, mouth=False, eyes='normal'):
    rows = [r for r in CAT_BASE]
    if mouth:
        rows[8] = "..1335566553311..."
    if eyes == 'shut':
        rows[5] = ".1331133331133331."
        rows[6] = ".1333333333333331."
    if eyes == 'angry':
        rows[5] = ".1331133331133331."
        rows[6] = ".1337733337733331."
    if eyes == 'wide':
        rows[5] = ".1337733337733331."
        rows[6] = ".1338783388733331."
    if arms:
        rows[13] = arms[0]
        rows[14] = arms[1]
    out = []
    for i in range(17):
        if bob > 0 and i < 17 - bob:
            out.append(CAT_BASE[i + bob] if False else rows[i])
        else:
            out.append(rows[i])
    # vertical bob: shift torso rows down by bob (pad top with blank)
    if bob:
        top = ['.' * CW] * bob
        out = top + rows[:17 - bob]
    lg = LEGS[legs]
    return out + lg

# --- idle ------------------------------------------------------------------
add('cat_idle0', CW, cat_frame('stand', 0))
add('cat_idle1', CW, cat_frame('stand', 0, mouth=False))
r = cat_frame('stand', 0); r[10] = "...1999999991....."; add('cat_idle2', CW, r)
r = cat_frame('stand', 0, eyes='shut'); add('cat_idle3', CW, r)

# --- run -------------------------------------------------------------------
for i in range(6):
    bob = 0 if i % 2 == 1 else 1
    add('cat_run%d' % i, CW, cat_frame('run%d' % i, bob))

add('cat_jump',  CW, cat_frame('jump', 0))
add('cat_fall',  CW, cat_frame('fall', 0))
add('cat_crouch',CW, cat_frame('crouch', 0))
add('cat_hurt',  CW, cat_frame('hurt', 0, eyes='wide'))
add('cat_dash',  CW, cat_frame('dash', 0, eyes='angry'))
add('cat_slide', CW, cat_frame('slide', 0))
add('cat_glide', CW, cat_frame('glide', 0))
add('cat_sit',   CW, cat_frame('stand', 0, eyes='shut'))
add('cat_talk',  CW, cat_frame('stand', 0, mouth=True))
add('cat_dead',  CW, [
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "....11.....11.....",
    "...1221...1221....",
    "..126211112621....",
    "..13333333333331..",
    ".1331133331133331.",
    ".1333355553333331.",
    "..1335566553311...",
    "...1333333331.....",
])

# attack poses (arms raised / lowered); sword drawn separately by the engine
ATK_ARMS_UP = [
    ".13333333333311...",
    ".13344444443311...",
]
ATK_ARMS_FWD = [
    ".13333333333311...",
    ".1334444444331 1..",
]
ATK_ARMS_DN = [
    ".1333333333331....",
    ".13344444443311...",
]
ATK_ARMS_UP[1] = ".13344444443311..."
ATK_ARMS_FWD[1] = ".13344444443311..."

add('cat_atk0', CW, cat_frame('stand', 0, arms=ATK_ARMS_FWD, eyes='angry'))
add('cat_atk1', CW, cat_frame('stand', 0, arms=ATK_ARMS_UP,   eyes='angry'))
add('cat_atk2', CW, cat_frame('stand', 1, arms=ATK_ARMS_FWD, eyes='angry'))
add('cat_atkup',CW, cat_frame('stand', 0, arms=ATK_ARMS_UP,   eyes='angry'))
add('cat_atkdn',CW, cat_frame('crouch', 0, arms=ATK_ARMS_DN,  eyes='angry'))
add('cat_cast', CW, cat_frame('stand', 0, arms=ATK_ARMS_UP,   eyes='wide'))
add('cat_divine0', CW, cat_frame('divine', 0, eyes='wide'))
add('cat_divine1', CW, cat_frame('divine', 1, eyes='wide'))

# --- tail (drawn behind body, 10 x 12) ------------------------------------
add('cat_tail', 10, [
    "..1.......",
    ".131......",
    "1331......",
    "1331......",
    "1331......",
    "13331.....",
    ".13331....",
    "..13331...",
    "...13331..",
    "....13331.",
    ".....1331.",
    "......111.",
])

# --- sword (blade up), 5 x 20 ---------------------------------------------
add('sword', 5, [
    "..b..",
    ".bbb.",
    ".bcb.",
    ".bcb.",
    ".bcb.",
    ".bcb.",
    ".bcb.",
    ".bcb.",
    ".bcb.",
    ".bcb.",
    ".bcb.",
    ".bcb.",
    ".bcb.",
    ".ccc.",
    "ddddd",
    "edddd",
    ".ede.",
    ".ede.",
    "..e..",
    "..e..",
])

# --- slash arcs (24 wide) ------------------------------------------------
def _arc(widths, h):
    rows = []
    for i, w in enumerate(widths):
        pad = (24 - w) // 2
        rows.append('.' * pad + '1' + 'f' * (w - 2) + '1' + '.' * (24 - pad - w))
    return rows
add('slash0', 24, [
    "..........1111..........",
    ".......111ffff111.......",
    ".....11ffffffffff11.....",
    "....1ffffffffffffff1....",
    "...1ffffffffffffffff1...",
    "..1ffffffffffffffffff1..",
    "..1ffffffffffffffffff1..",
    "...1ffffffffffffffff1...",
    "....1ffffffffffffff1....",
    ".....11ffffffffff11.....",
    "..........1111..........",
])
add('slash1', 24, [
    "..........11111.........",
    ".......111ffffff111.....",
    "....11fffffffffffff11...",
    "...1fffffffffffffffff1..",
    "..1fffffffffffffffffff1.",
    "..1fffffffffffffffffff1.",
    "...1fffffffffffffffff1..",
    "....11fffffffffffff11...",
    "......11fffffff111......",
    "..........1111..........",
])
add('slash2', 24, [
    "..........111111........",
    "......111ffffffff111....",
    "...11fffffffffffffff11..",
    "..1fffffffffffffffffff1.",
    ".1fffffffffffffffffffff1",
    ".1fffffffffffffffffffff1",
    "..1fffffffffffffffffff1.",
    "...11fffffffffffffff11..",
    "......111ffffffff111....",
    "..........11111.........",
])

# ================================================================ enemies ==
# --- slime (16x12)
add('slime0', 16, [
    "................",
    ".....111111.....",
    "...11pppppp11...",
    "..1pppqppppppp1.",
    ".1ppqpppppppppp1",
    ".1pppppqqpppppp1",
    "1ppppppqqpppppp1",
    "1pppppppppppppp1",
    "1pppppppppppppp1",
    "1puuppppppuuppp1",
    ".1pppppppppppp1.",
    "..111111111111..",
])
add('slime1', 16, [
    "................",
    "................",
    ".....111111.....",
    "...11pppppp11...",
    "..1ppppqpppppp1.",
    ".1ppppqqqpppppp1",
    "1pppppppppppppp1",
    "1pppppppppppppp1",
    "1puupppppppuupp1",
    "1pppppppppppppp1",
    ".1pppppppppppp1.",
    "..111111111111..",
])
# --- bat (18x12)
add('bat0', 18, [
    "1..............1..",
    "11............11..",
    "1p1..........1p1..",
    "1pp1...11...1pp1..",
    ".1pp1.1uu1.1pp1...",
    "..1pp1uouu1pp1....",
    "...1ppuuuuupp1....",
    "....1ppppppp1.....",
    ".....1111111......",
    "..................",
    "..................",
    "..................",
])
add('bat1', 18, [
    "..................",
    "..................",
    ".....11111........",
    "....1uuuuu1.......",
    "1...1uouuu1....1..",
    "11.1uuuuuuu1..11..",
    "1p11ppppppp11p1...",
    "1pp1.11111.1pp1...",
    ".1pp1.....1pp1....",
    "..1pp1...1pp1.....",
    "...11.....11......",
    "..................",
])
# --- thornling (plant, 16x18)
add('thorn0', 16, [
    "......1111......",
    "....11gggg11....",
    "...1gghhhgg1....",
    "..1gghgggghgg1..",
    "..1gghgggghgg1..",
    "..1gghgggghgg1..",
    "...1gghhhgg1....",
    "....11gggg11....",
    "......1gg1......",
    "......1gg1......",
    ".....1iggi1.....",
    "....1iiigiii1...",
    "...1ii1ggg1ii1..",
    "..1ii1.ggg.1ii1.".replace(' ', ''),
    "..11...ggg...11.",
    ".......ggg......",
    "......1ggg1.....",
    "......11111.....",
])
add('thorn1', 16, [
    "......1111......",
    "....11mmmm11....",
    "...1mmmyyyymm1..".replace(' ', ''),
    "..1mmyuuuuyymm1.".replace(' ', ''),
    "..1myuuuuuuyym1.",
    "..1myuuuuuuyym1.",
    "..1mmyuuuuyymm1.".replace(' ', ''),
    "...1mmmyyyymm1..",
    "....11mmmm11....",
    "......1gg1......",
    "......1gg1......",
    ".....1iggi1.....",
    "....1iiigiii1...",
    "...1ii1ggg1ii1..",
    "..11..1ggg1..11.",
    "......1ggg1.....",
    ".....11ggg11....",
    ".....1111111....",
])
# --- shroom (16x16)
add('shroom0', 16, [
    "................",
    "....11111111....",
    "..11nnnnnnnn11..",
    ".1nnnonnnnnonn1.",
    "1nnnonnnnnonnnn1",
    "1nnnnnnnnnnnnnn1",
    "1nnnnnnnnnnnnnn1",
    ".1nnnnnnnnnnnn1.",
    "..111111111111..",
    ".....1yy1.......",
    "....1yyyy1......",
    "....1yuuy1......",
    "....1yyyy1......",
    "....1yyyy1......",
    "...11yyyy11.....",
    "...11111111.....",
])
add('shroom1', 16, [
    "................",
    "................",
    "....11111111....",
    "..11nnnnnnnn11..",
    ".1nnnonnnnnonn1.",
    "1nnnnnonnnnonnn1",
    "1nnnnnnnnnnnnnn1",
    ".1nnnnnnnnnnnn1.",
    "..111111111111..",
    ".....1yy1.......",
    "....1yyyy1......",
    "....1yuuy1......",
    "....1yyyy1......",
    "...11yyyy11.....",
    "..11yyyyyy11....",
    "..1111111111....",
])
# --- mudlurk (20x14)
add('mud0', 20, [
    "....................",
    ".....1111111111.....",
    "...11xxxxxxxxxx11...",
    "..1xxwxxxxxxwxxxx1..",
    ".1xxwwxxxxxxwwxxxx1.",
    ".1xxxxxxxxxxxxxxxx1.",
    "1xuxxxxxxxxxxxxxxux1",
    "1xxxxxxxxxxxxxxxxxx1",
    "1xxxxxxxxxxxxxxxxxx1",
    ".1xxxxxxxxxxxxxxxx1.",
    ".1xxwxxxxxxxxxxwxx1.",
    "..1xxxxxxxxxxxxxx1..",
    "...11xxxxxxxxxx11...",
    ".....1111111111.....",
])
add('mud1', 20, [
    "....................",
    "....................",
    ".....1111111111.....",
    "...11xxxxxxxxxx11...",
    "..1xxwxxxxxxwxxxx1..",
    ".1xxwwxxxxxxwwxxxx1.",
    "1xuxxxxxxxxxxxxxxux1",
    "1xxxxxxxxxxxxxxxxxx1",
    ".1xxxxxxxxxxxxxxxx1.",
    ".1xxwxxxxxxxxxxwxx1.",
    "..1xxxxxxxxxxxxxx1..",
    "...11xxxxxxxxxx11...",
    ".....1111111111.....",
    "....................",
])
# --- jellyfish (16x18)
add('jelly0', 16, [
    "....11111111....",
    "..11qqqqqqqq11..",
    ".1qqvvqqqqvvqq1.",
    "1qqvvvvqqvvvvqq1"[:16],
    "1qqqqqqqqqqqqqq1",
    "1qqvvqqqqqqvvqq1",
    "1qqqqqqqqqqqqqq1",
    ".1qqqqqqqqqqqq1.",
    "..11qqqqqqqq11..",
    "....1q1..1q1....",
    "...1qq1..1qq1...",
    "...1q1....1q1...",
    "..1qq1....1qq1..",
    "..1q1......1q1..",
    ".1qq1......1qq1.",
    ".1q1........1q1.",
    "1qq1........1qq1",
    "1q1..........1q1",
])
add('jelly1', 16, [
    "................",
    "....11111111....",
    "..11qqqqqqqq11..",
    ".1qqvvqqqqvvqq1.",
    "1qqvvvvqqvvvvqq1",
    "1qqqqqqqqqqqqqq1",
    "1qqvvqqqqqqvvqq1",
    ".1qqqqqqqqqqqq1.",
    "..11qqqqqqqq11..",
    "....11qqqq11....",
    "...1q1....1q1...",
    "..1q1......1q1..",
    "..1q1......1q1..",
    ".1q1........1q1.",
    ".1q1........1q1.",
    "1q1..........1q1",
    "1q............q1",
    "................",
])
# --- angler fish (22x14)
add('angler0', 22, [
    "......................",
    "...........11.........",
    "..........1oo1........",
    "..........1o1.........",
    "....1111..11..........",
    "..11pppp1111111.......",
    ".1pppppppppppppp11....",
    "1ppupppppppppppppp1...",
    "1ppppppppppppppppp11..",
    ".1pppppppppppppppppp1.",
    "..1pppppppppppppppp1..",
    "...11pppppppppppp11...",
    ".....111111111111.....",
    "......................",
])
add('angler1', 22, [
    "......................",
    "...........11.........",
    "..........1oo1........",
    "..........1o1.........",
    "....1111..11..........",
    "..11pppp1111111.......",
    ".1pppppppppppppp11....",
    "1ppupppppppppppppp11..",
    "1ppppppppppppppppppp1.",
    ".1pppyyyyyyyyyyypppp1.",
    "..1pppppppppppppppp1..",
    "...11pppppppppppp11...",
    ".....111111111111.....",
    "......................",
])
# --- larva (14x10)
add('larva0', 14, [
    "..............",
    "....1111111...",
    "..11jjjjjj11..",
    ".1jjuujjjjjj1.",
    "1jjjuujjjjjjj1",
    "1jjjjjjjjjjjj1",
    ".1jjjjjjjjjj1.",
    "..1jjjjjjjj1..",
    "...11111111...",
    "..............",
])
add('larva1', 14, [
    "..............",
    "..............",
    "....1111111...",
    "..11jjjjjj11..",
    ".1jjuujjjjjj1.",
    "1jjjuujjjjjjj1",
    "1jjjjjjjjjjjj1",
    ".1jjjjjjjjjj1.",
    "..1111111111..",
    "...11111111...",
])
# --- beetle (18x14)
add('beetle0', 18, [
    "..................",
    "......111111......",
    "....11kkkkkk11....",
    "...1kklkkkklkk1...",
    "..1kkllkkkkllkk1..",
    ".1kkkkkkkkkkkkkk1.",
    "1kuxkkkkkkkkkkxuk1",
    "1kkkkkkkkkkkkkkkk1",
    ".1kkkkkkkkkkkkkk1.",
    "..1kkkkkkkkkkkk1..",
    "...1kk111111kk1...",
    "....111....111....",
    "...111......111...",
    "..................",
])
add('beetle1', 18, [
    "..................",
    "..................",
    "......111111......",
    "....11kkkkkk11....",
    "...1kklkkkklkk1...",
    "..1kkllkkkkllkk1..",
    ".1kkkkkkkkkkkkkk1.",
    "1kuxkkkkkkkkkkxuk1",
    "1kkkkkkkkkkkkkkkk1",
    ".1kkkkkkkkkkkkkk1.",
    "..1kk11111111kk1..",
    "...111......111...",
    "..................",
    "..................",
])
# --- spitter (18x18)
add('spitter0', 18, [
    "..................",
    "......111111......",
    "....11llllll11....",
    "...1llvlllllll1...",
    "..1llvvlllllll1...",
    "..1lllllllllll1...",
    ".1luullllluull1...",
    ".1lllllllllllll1..",
    ".1lllllllllllll1..",
    ".1lllmmmmmlllll1..",
    "..1llmyyyyymll1...",
    "..1llmyyyyymll1...",
    "...1llmmmmmll1....",
    "....1lllllll1.....",
    ".....1lllll1......",
    "....111111111.....",
    "...11.......11....",
    "...1.........1....",
])
add('spitter1', 18, [
    "..................",
    "......111111......",
    "....11llllll11....",
    "...1llvlllllll1...",
    "..1llvvlllllll1...",
    "..1lllllllllll1...",
    ".1luullllluull1...",
    ".1lllllllllllll1..",
    ".1lllllllllllll1..",
    ".1lllmmmmmlllll1..",
    "..1lmyyyyyyyml1...",
    "..1lmyyyyyyyml1...",
    "...1llmmmmmll1....",
    "....1lllllll1.....",
    ".....1lllll1......",
    "....111111111.....",
    "...11.......11....",
    "...1.........1....",
])
# --- emberling (14x16)
add('ember0', 14, [
    "......11......",
    ".....1nn1.....",
    "....1nooon1...",
    "...1noooooon1.",
    "..1noouuuon1..",
    ".1noouuuuuon1.",
    ".1nouuuuuuon1.",
    ".1nnouuuuonn1.",
    "..1nnoooonn1..",
    "..1nnwwwwnn1..",
    "...1wwwwww1...",
    "...1wxwwxw1...",
    "...1wwwwww1...",
    "....1wwww1....",
    ".....1111.....",
    "..............",
])
add('ember1', 14, [
    "..............",
    "......11......",
    ".....1nn1.....",
    "....1nooon1...",
    "...1noooooon1.",
    "..1noouuuuon1.",
    ".1nouuuuuuon1.",
    ".1nnouuuuonn1.",
    "..1nnoooonn1..",
    "..1nnwwwwnn1..",
    "...1wwwwww1...",
    "...1wxwwxw1...",
    "...1wwwwww1...",
    "....1wwww1....",
    ".....1111.....",
    "..............",
])
# --- forge bot (18x20)
add('forge0', 18, [
    "..................",
    ".....11111111.....",
    "....1rrrrrrrr1....",
    "....1rttttttr1....",
    "....1rtuurrttr1...",
    "....1rtuurrttr1...",
    "....1rrrrrrrr1....",
    "...11rrnnnnrr11...",
    "..1rrrrnnnnrrrr1..",
    "..1rrrrnnnnrrrr1..",
    ".11rrrrrrrrrrrr11.",
    ".1rrrrrrrrrrrrrr1.",
    ".1rr1111111111rr1.",
    ".1rr1......1.1rr1.".replace(' ', ''),
    "..111......1.111..".replace(' ', ''),
    "....111....111....",
    "...1rrr1..1rrr1...",
    "...1rrr1..1rrr1...",
    "...1ttt1..1ttt1...",
    "...11111..11111...",
])
add('forge1', 18, [
    "..................",
    ".....11111111.....",
    "....1rrrrrrrr1....",
    "....1rttttttr1....",
    "....1rtuurrttr1...",
    "....1rtuurrttr1...",
    "....1rrrrrrrr1....",
    "...11rrnnnnrr11...",
    "..1rrrrnnnnrrrr1..",
    "..1rrrrnnnnrrrr1..",
    ".11rrrrrrrrrrrr11.",
    ".1rrrrrrrrrrrrrr1.",
    ".1rr1111111111rr1.",
    ".1rr1......11rr1..",
    "..111......11111..",
    "....111....111....",
    "...1rrr1..1rrr1...",
    "...1ttt1..1ttt1...",
    "...1ttt1..1ttt1...",
    "...11111..11111...",
])
# --- magmite (16x12)
add('magmite0', 16, [
    "................",
    ".....111111.....",
    "...11nnnnnn11...",
    "..1nnnnnnnnnn1..",
    ".1nnooonnnnooon1"[:16],
    "1nnouuonnouuonn1"[:16],
    "1nnnnnnnnnnnnnn1",
    "1nnwwnnnnnnwwnn1",
    ".1nnwwnnnnwwnn1.",
    "..1nnwwnnwwnn1..",
    "...11nnnnnn11...",
    ".....111111.....",
])
add('magmite1', 16, [
    "................",
    "................",
    ".....111111.....",
    "...11nnnnnn11...",
    "..1nnnnnnnnnn1..",
    ".1nnooonnnnooo1.",
    "1nnouuonnouuonn1",
    "1nnnnnnnnnnnnnn1",
    "1nnwwnnnnnnwwnn1",
    ".1nnwwnnnnwwnn1.",
    "..11nnwwnnww11..",
    "...1111111111...",
])
# --- frostling (14x16)
add('frost0', 14, [
    "......11......",
    ".....1qq1.....",
    "....1qqqqq1...",
    "...1qqvvvqqq1."[:14],
    "..1qqvvvvvqqq1"[:14],
    "..1qvuuquuuqv1",
    "..1qqqqqqqqqq1",
    "..1qqvvvvvvqq1",
    "...1qqqqqqqq1.",
    "...1qvqqqqvq1.",
    "....1qqqqqq1..",
    "....1qqqqqq1..",
    "...11qqqqqq11.",
    "...1111111111.",
    "..............",
    "..............",
])
add('frost1', 14, [
    "..............",
    "......11......",
    ".....1qq1.....",
    "....1qqqqq1...",
    "...1qqvvvqqq1.",
    "..1qqvvvvvqqq1",
    "..1qvuuquuuqv1",
    "..1qqqqqqqqqq1",
    "..1qqvvvvvvqq1",
    "...1qqqqqqqq1.",
    "...1qvqqqqvq1.",
    "....1qqqqqq1..",
    "...11qqqqqq11.",
    "...1111111111.",
])
# --- wisp (12x12)
add('wisp0', 12, [
    "....1111....",
    "..11qqqq11..",
    ".1qqvvvvqq1.",
    "1qqvvffvvqq1"[:12],
    "1qvvffffvvq1",
    "1qvvffffvvq1",
    "1qqvvffvvqq1",
    ".1qqvvvvqq1.",
    "..11qqqq11..",
    "....1111....",
    ".....11.....",
    "......1.....",
])
add('wisp1', 12, [
    "............",
    "....1111....",
    "..11qqqq11..",
    ".1qqvvvvqq1.",
    "1qqvvffvvqq1",
    "1qvvffffvvq1",
    "1qvvffffvvq1",
    "1qqvvffvvqq1",
    ".1qqvvvvqq1.",
    "..11qqqq11..",
    "....1111....",
    ".....11.....",
])
# --- crowling (18x14)
add('crow0', 18, [
    "1................1",
    "11..............11",
    "1z1....1111....1z1",
    "1zz1..1zzzz1..1zz1",
    ".1zz11zzuzz11zz1..",
    "..1zzzzzuuzzzzz1..",
    "...1zzzzzzzzzz1...",
    "....1zzzddzzz1....",
    ".....1zzzzzz1.....",
    "......111111......",
    ".......1..1.......",
    "......11..11......",
    "..................",
    "..................",
])
add('crow1', 18, [
    "..................",
    "..................",
    "......1111........",
    ".....1zzzz1.......",
    "....1zzuzz1.......",
    "...1zzzuuzz11.....",
    "..1zzzzzzzzz11....",
    "..1zzzzzzzzzzz11..",
    "...1zzzzddzzzzz1..",
    "....1zzzzzzzz1....",
    ".....1111111......",
    "......1..1........",
    ".....11..11.......",
    "..................",
])
# --- harpy (20x18)
add('harpy0', 20, [
    "1..................1",
    "11................11",
    "1s1.....1111.....1s1",
    "1ss1...1ssss1...1ss1",
    ".1ss1.1sszss1.1ss1..",
    "..1ss1ssuuuss1ss1...",
    "...1ssssssssssss1...",
    "....1sssoooosss1....",
    ".....1ssooooss1.....",
    "......1ssssss1......",
    ".......111111.......",
    "........1..1........",
    ".......11..11.......",
    ".......1....1.......",
    "......11....11......",
    "....................",
    "....................",
    "....................",
])
add('harpy1', 20, [
    "....................",
    "....................",
    "......111111........",
    ".....1ssssss1.......",
    "....1sszssss1.......",
    "...1ssuuuusss1......",
    "..1sssssssssss11....",
    "..1sssoooosssss1....",
    "...1ssoooosssss1....",
    "....1sssssssss1.....",
    ".....11111111.......",
    "......1....1........",
    ".....11....11.......",
    ".....1......1.......",
    "....11......11......",
    "....................",
    "....................",
    "....................",
])
# --- sentinel (20x24)
add('senti0', 20, [
    "........11..........",
    ".......1ll1.........",
    "......1llll1........",
    ".....11llll11.......",
    "....1lllllllll1.....",
    "...1llvvvvvvvll1....",
    "...1lvvvffvvvvl1....",
    "...1lvvvffvvvvl1....",
    "...1llvvvvvvvll1....",
    "....1lllllllll1.....",
    ".....111111111......",
    "....1sssssssss1.....",
    "...1sssssssssss1....",
    "...1ss1111111ss1....",
    "...1ss1....11ss1....",
    "...1ss1....11ss1....",
    "....111....1111.....",
    "......11...11.......",
    ".....1ll1.1ll1......",
    ".....1ll1.1ll1......",
    "....11ll111ll11.....",
    "....1llll1llll1.....",
    "....1111111111......",
    "....................",
])
# --- voidling (14x16)
add('void0', 14, [
    "......11......",
    "....11uu11....",
    "...1uuuuuu1...",
    "..1uulululuu1.",
    "..1uuuuuuuuu1.",
    ".1uullllllluu1",
    ".1ullllllllll1"[:14],
    ".1ulllllllllu1",
    ".1uullllllluu1",
    "..1uuuuuuuuu1.",
    "..1uuluuluuu1.",
    "...1uuuuuu1...",
    "....11uu11....",
    "......11......",
    "..............",
    "..............",
])
add('void1', 14, [
    "..............",
    "......11......",
    "....11uu11....",
    "...1uuuuuu1...",
    "..1uulululuu1.",
    "..1uuuuuuuuu1.",
    ".1uullllllluu1",
    ".1ulllllllllu1",
    ".1uullllllluu1",
    "..1uuuuuuuuu1.",
    "..1uuluuluuu1.",
    "...1uuuuuu1...",
    "....11uu11....",
    "......11......",
    "..............",
    "..............",
])
# --- acolyte (16x22)
add('acolyte0', 16, [
    "......1111......",
    "....11kkkk11....",
    "...1kkkkkkkk1...",
    "...1kkvvvvkk1...",
    "...1kkvffvkk1...",
    "...1kkvvvvkk1...",
    "...1kkkkkkkk1...",
    "..11kkkkkkkk11..",
    ".1kkkkkkkkkkkk1.",
    ".1kkkllllllkkk1.",
    ".1kkllllllllkk1.",
    ".1kllllllllllk1.",
    ".1kllllllllllk1.",
    ".1kllllllllllk1.",
    ".1kllllllllllk1.",
    ".1kllllllllllk1.",
    ".1kkllllllllkk1.",
    "..1kkllllllkk1..",
    "..1kkkkkkkkkk1..",
    "...1kkkkkkkk1...",
    "....11111111....",
    "................",
])
add('acolyte1', 16, [
    "......1111......",
    "....11kkkk11....",
    "...1kkkkkkkk1...",
    "...1kkvvvvkk1...",
    "...1kkvmmvkk1...",
    "...1kkvvvvkk1...",
    "...1kkkkkkkk1...",
    "..11kkkkkkkk11..",
    ".1kkkkkkkkkkkk1.",
    ".1kkkllllllkkk1.",
    ".1kkllllllllkk1.",
    ".1kllllllllllk1.",
    ".1kllllllllllk1.",
    ".1kllllllllllk1.",
    ".1kllllllllllk1.",
    ".1kllllllllllk1.",
    ".1kkllllllkkk1..",
    "..1kkllllllkk1..",
    "..1kkkkkkkkkk1..",
    "...1kkkkkkkk1...",
    "....11111111....",
    "................",
])
# --- revenant (18x24)
add('revenant0', 18, [
    ".......111........",
    ".....11uuu11......",
    "....1uuuuuuu1.....",
    "...1uuuuuuuuu1....",
    "...1uummmmuuu1....",
    "...1uummmmuuu1....",
    "...1uuuuuuuuu1....",
    "..11uuuuuuuuu11...",
    ".1uuuuuuuuuuuuu1..",
    ".1uuullllllluuu1..",
    ".1uullllllllluu1..",
    ".1ullllllllllll1..",
    ".1ullllllllllll1..",
    ".1ulllllllllllu1..",
    ".1uullllllllluu1..",
    ".1uullllllllluu1..",
    "..1ulllllllllu1...",
    "..1uullllllluu1...",
    "...1uullllluu1....",
    "....1uullluu1.....",
    ".....1uuuuu1......",
    "......1uuu1.......",
    ".......111........",
    "..................",
])

# ================================================================ bosses ===
# Thornmaw head 40x36
add('boss_thorn_head', 40, [
    "....................1111................",
    ".................1111gg1111.............",
    "...............11gghhhhhggg111..........",
    ".............11gghhhhhhhhhgggg11........",
    "...........11gghhhggggggghhhhggg11......",
    ".........11gghhggmmmmmmmmggghhhgg11.....",
    "........1gghhggmmyyyyyyyyymmghhhgg11....",
    ".......1gghhggmmyyuuyyuuyymmghhhgg1.....",
    "......1gghhggmmyyuuyyuuyyymmghhhhgg1....",
    ".....1gghhggmmyyyyyyyyyyyyymghhhhhgg1...",
    "....1gghhgggmmmyyyyyyyyymmghhhhhhhgg1...",
    "...1gghhhgggggmmmmmmmmmggghhhhhhhhg1....",
    "..1gghhhhhggggggggggggghhhhhhhhhhhgg1...",
    "..1ghhhhhhhhhhhhhhhhhhhhhhhhhhhhhhg1....",
    ".1gghhhhhhhhhhhhhhhhhhhhhhhhhhhhhgg1....",
    ".1gghhhhhhhhhhhhhhhhhhhhhhhhhhhhhgg1....",
    ".1gghhhhhhhhhhhhhhhhhhhhhhhhhhhhhgg1....",
    ".1gghhhhhhhhhhhhhhhhhhhhhhhhhhhhhgg1....",
    ".1gghhhhhhhhhhhhhhhhhhhhhhhhhhhhhgg1....",
    ".1gghhhhhhhhhhhhhhhhhhhhhhhhhhhhhgg1....",
    "..1ghhhhhhhhhhhhhhhhhhhhhhhhhhhhhhg1....",
    "..1gghhhhhggggggggggggghhhhhhhhhgg1.....",
    "...1gghhgggmmmmmmmmmmggghhhhhhgg1.......",
    "....1gghhggmmyyyyyyyymmghhhhhgg1........",
    ".....1gghhgmmyyuuyyuuyymghhhgg1.........",
    "......1gghgmmyyuuyyuuyymghhgg1..........",
    ".......1gghgmmyyyyyyyyymghgg1...........",
    "........1gghgmmmyyyyymghhgg1............",
    ".........1gghggmmmmmmgghgg1.............",
    "..........1gghhhgggghhhgg1..............",
    "...........1gghhhhhhhhhgg1..............",
    "............11gghhhhhgg11...............",
    "..............11gghhgg11................",
    "................111111..................",
    "........................................",
    "........................................",
])
# Leviathan head 34x28
add('boss_levi_head', 34, [
    "..................1111............",
    "...............111pppp1111........",
    "............11pppppppppppp111.....",
    ".........11ppppqqppppppqqpppp11...",
    ".11111..1ppppqqqqppppppqqqqpppp1..",
    "1pppppp1ppppqqqqppppppqqqqpppppp1.",
    "1ppppppppppppqqppppppppqqppppppp1.",
    "1puuppppppppppppppppppppppuupppp1.",
    "1ppppppppppppppppppppppppppppppp1.",
    "1ppppppppppppppppppppppppppppppp1.",
    "1pyyyyyyyyyyyyyyyyyyyyyyyyyyyypp1.",
    "1pppyypppyypppyypppyypppyyppppp1..",
    ".1pppyypppyypppyypppyypppyyppp1...",
    "..1pppyypppyypppyypppyypppyypp1...",
    "...1ppppppppppppppppppppppppp1....",
    "....1ppppppppppppppppppppppp1.....",
    ".....1ppppppppppppppppppppp1......",
    "......1ppppppppppppppppppp1.......",
    ".......1ppppppppppppppppp1........",
    "........11ppppppppppppp11.........",
    "..........11ppppppppp11...........",
    "............11ppppp11.............",
    "..............11111...............",
    "..................................",
    "..................................",
    "..................................",
    "..................................",
    "..................................",
])
# Hive mother body 44x34
add('boss_hive_body', 44, [
    "....................111111111111....................",
    "...............1111kkkkkkkkkkkkkk11111..............",
    "...........111kkkkllllllllllllllkkkk111.............",
    ".........11kkkllllllllllllllllllllllkkk11...........",
    ".......11kklllllllllllllllllllllllllllllkk11........",
    "......1kllllllmmllllllllllllllmmllllllllllk1........",
    ".....1kllllllmmmmllllllllllllmmmmllllllllllk1.......",
    ".....1kllllllmmmmllllllllllllmmmmllllllllllk1.......",
    "....1kllllllllmmllllllllllllllmmllllllllllllk1......",
    "....1kllllllllllllllllllllllllllllllllllllllk1......",
    "...1kllllllllllllllllllllllllllllllllllllllllk1.....",
    "...1klllloooooolllllllllllllloooooollllllllllk1.....",
    "...1klllloooooooolllllllllloooooooollllllllllk1.....",
    "..1klllllooooooooollllllllooooooooolllllllllllk1....",
    "..1kllllllloooooooolllllooooooooolllllllllllllk1....",
    "..1kllllllllllloooooooooolllllllllllllllllllllk1....",
    "..1kllllllllllllllllllllllllllllllllllllllllllk1....",
    "..1kllllllllllllllllllllllllllllllllllllllllllk1....",
    "..1kllllllllllllllllllllllllllllllllllllllllllk1....",
    "...1kllllllllllllllllllllllllllllllllllllllllk1.....",
    "...1kllllllllllllllllllllllllllllllllllllllllk1.....",
    "...1kkllllllllllllllllllllllllllllllllllllllkk1.....",
    "....1kkllllllllllllllllllllllllllllllllllllkk1......",
    "....11kkllllllllllllllllllllllllllllllllllkk11......",
    "......11kkkllllllllllllllllllllllllllllkkk11........",
    "........111kkkkllllllllllllllllllllllkkk111.........",
    "...........1111kkkkkkkkkkkkkkkkkkkk11111............",
    "...............11111111111111111111.................",
    "....................................................",
    "....................................................",
    "....................................................",
    "....................................................",
    "....................................................",
    "....................................................",
])
# Ignis (rival cat) 26x30
add('boss_ignis', 26, [
    "....11..........11......",
    "...1ww1........1ww1.....",
    "..1wxxw1......1wxxw1....",
    "..1wxxww1....1wwxxw1....",
    "..1wwxxwwwwwwwwxxwww1...",
    ".1wwxxxxxxxxxxxxxxwww1..",
    ".1wxmmxxxxxxxxmmxxxxw1..",
    ".1wxmmxxxxxxxxmmxxxxw1..",
    ".1wxxxxxxnnnnxxxxxxxw1..",
    ".1wxxxxxnnnnnnxxxxxxw1..",
    ".1wxxxxxxnnnnxxxxxxxw1..",
    "..1wxxxxxxxxxxxxxxww1...",
    "...1wwxxxxxxxxxxxxw1....",
    "....111wwwwwwwwww11.....",
    "...1wwwwwwwwwwwwwwww1...",
    "..1wwwwnnnnnnnnnwwwww1..",
    "..1wwwnnnnnnnnnnnwwww1..",
    "..1wwwnnnnnnnnnnnwwww1..",
    "..1wwwnnnnnnnnnnnwwww1..",
    "..1wwwwnnnnnnnnwwwwww1..",
    "...1wwwwwwwwwwwwwwww1...",
    "....1wwwwwwwwwwwwww1....",
    "....1ww111111111ww1.....",
    "....1ww1....1..1ww1.....",
    ".....111....1..111......",
    "......11....1...11......",
    ".....1ww1..1ww1.........",
    ".....1ww1..1ww1.........",
    ".....1xx1..1xx1.........",
    ".....1111..1111.........",
])
# Choir of frost 30x38
add('boss_choir', 30, [
    "..............11..............",
    "............11qq11............",
    "..........11qqqqqq11..........",
    ".........1qqvvvvvvqq1.........",
    "........1qqvvvvvvvvvvq1.......",
    "........1qvvvvvvvvvvvvq1......",
    ".......1qvvvvvvvvvvvvvvq1.....",
    ".......1qvvvvvvvvvvvvvvq1.....",
    ".......1qvvvuuuvvvuuuvvq1.....",
    ".......1qvvvuuuvvvuuuvvq1.....",
    ".......1qvvvvvvvvvvvvvvq1.....",
    ".......1qqvvvvvvvvvvvvqq1.....",
    "........1qqvvvvvvvvvvqq1......",
    ".........11qqvvvvvvqq11.......",
    "...........11qqqqqq11.........",
    "..........11qqqqqqqq11........",
    "........11qqqqqqqqqqqq11......",
    ".......1qqqqqqqqqqqqqqqq1.....",
    "......1qqqqqqqqqqqqqqqqqq1....",
    "......1qqqqqqqqqqqqqqqqqq1....",
    "......1qqqqqqqqqqqqqqqqqq1....",
    "......1qqqqqqqqqqqqqqqqqq1....",
    "......1qqqqqqqqqqqqqqqqqq1....",
    "......1qqqqqqqqqqqqqqqqqq1....",
    ".......1qqqqqqqqqqqqqqqq1.....",
    ".......1qqqqqqqqqqqqqqqq1.....",
    "........1qqqqqqqqqqqqqq1......",
    "........1qqqqqqqqqqqqqq1......",
    ".........1qqqqqqqqqqqq1.......",
    ".........1qqqqqqqqqqqq1.......",
    "..........1qqqqqqqqqq1........",
    "..........1qqqqqqqqqq1........",
    "...........1qqqqqqqq1.........",
    "...........1qqqqqqqq1.........",
    "............1qqqqqq1..........",
    "............1qqqqqq1..........",
    ".............111111...........",
    "..............................",
])
# Stormcrow 46x30
add('boss_crow', 46, [
    "1............................................1",
    "11..........................................11",
    "1z1........................................1z1",
    "1zz1......................................1zz1",
    ".1zz1........11111111111................1zz1..",
    "..1zzz1.....1zzzzzzzzzzzzz1...........1zzz1...",
    "...1zzz1...1zzzzzzzzzzzzzzz1........1zzz1.....",
    "....1zzz1.1zzzzzzzzzzzzzzzzz1.....1zzz1.......",
    ".....1zzz1zzzzzzzzzzzzzzzzzzz1..1zzz1.........",
    "......1zzzzzzzzzzzzzzzzzzzzzzz1zzz1...........",
    ".......1zzzzzzzzzzzzzzzzzzzzzzzzz1............",
    "........1zzzzzzzzzzzzzzzzzzzzzzz1.............",
    ".........1zzzzzzzzzzzzzzzzzzzzz1..............",
    "..........1zzzzzzzzzzzzzzzzzzz1...............",
    "...........1zzzzzzzzzzzzzzzzz1................",
    "............1zzzzzzzzzzzzzzz1.................",
    ".............1zzzzzzzzzzzzz1..................",
    "..............1zzzzzzzzzzz1...................",
    "...............1zzzzzzzzz1....................",
    "................1zzzzzzz1.....................",
    ".................1zzzzz1......................",
    "..................1zzz1.......................",
    "...................1z1........................",
    "....................1.........................",
    "..............................................",
    "..............................................",
    "..............................................",
    "..............................................",
    "..............................................",
    "..............................................",
])
# Metrodivinia 48x44
add('boss_god', 48, [
    ".......................11111.......................",
    "....................111oooo111.....................",
    "..................11ooooooooo11....................",
    ".................1ooooooooooooo1...................",
    "................1ooooffffffooo11...................",
    "...............1ooooffffffffoooo1..................",
    "..............1oooooffffffffooooo1.................",
    ".............1oooooooffffffooooooo1................",
    "............1oooooooffffoooooooo1.................",
    "..........1oooooooooooooooooooooo1................",
    "..........1oooooooooooooooooooooooo1...............",
    ".........1oooooooooooooooooooooooooo1..............",
    "........1oooooooooooooooooooooooooooo1.............",
    "........1oooooooooffffffffffffooooooo1.............",
    ".......1oooooooffffffmmffffoooooo1................",
    ".......1ooooooofffffmmmmffffoooooo1................",
    ".......1ooooooofffffmmmmffffoooooo1................",
    ".......1oooooooffffffmmffffooooooo1................",
    "........1oooooooooffffffffffffooooooo1.............",
    "........1oooooooooooooooooooooooooooo1.............",
    ".........1oooooooooooooooooooooooooo1..............",
    "..........1oooooooooooooooooooooooo1...............",
    "...........1oooooooooooooooooooooo1................",
    "............1oooooooooooooooooooo1.................",
    ".............1oooooooooooooooooo1..................",
    "..............1oooooooooooooooo1...................",
    "...............1oooooooooooooo1....................",
    "................1oooooooooooo1.....................",
    ".................1oooooooooo1......................",
    "..................1oooooooo1.......................",
    "...................1oooooo1........................",
    "....................1oooo1.........................",
    ".....................1oo1..........................",
    "......................11...........................",
    "...................................................",
    "...................................................",
    "...................................................",
    "...................................................",
    "...................................................",
    "...................................................",
    "...................................................",
    "...................................................",
    "...................................................",
    "...................................................",
])

# ============================================================== items/UI ===
add('ico_fish', 10, [
    "....11....",
    "..11oo11..",
    ".1oooooo1.",
    "1oo1ooooo1",
    "1oooooooo1",
    "1oooooooo1",
    "1oo1ooooo1",
    ".1oooooo1.",
    "..11oo11..",
    "....11....",
])
add('ico_heart', 9, [
    ".11...11.",
    "1mm1.1mm1",
    "1mmmmmmm1",
    "1mmmmmmm1",
    ".1mmmmm1.",
    "..1mmm1..",
    "...1m1...",
    "....1....",
    ".........",
])
add('ico_heart_empty', 9, [
    ".11...11.",
    "1uu1.1uu1",
    "1uuuuuuu1",
    "1uuuuuuu1",
    ".1uuuuu1.",
    "..1uuu1..",
    "...1u1...",
    "....1....",
    ".........",
])
add('ico_shard', 9, [
    "....1....",
    "...1m1...",
    "..1mmm1..",
    ".1mmmmm1.",
    "1mmmmmmm1",
    ".1mmmmm1.",
    "..1mmm1..",
    "...1m1...",
    "....1....",
])
add('ico_yarn', 11, [
    "...11111...",
    ".11vvvvv11.",
    "1vv1vvv1vv1",
    "1v1vv1vv1v1",
    "1vvv1v1vvv1",
    "1vvvvvvvvv1",
    "1v1vv1vv1v1",
    "1vv1vvv1vv1",
    ".11vvvvv11.",
    "...11111...",
    "...........",
])
add('ico_lore', 12, [
    ".1111111111.",
    "1jjjjjjjjjj1",
    "1j11111111j1",
    "1j1uuuuuu1j1",
    "1j1uuuuuu1j1",
    "1j1uuuuuu1j1",
    "1j1uuuuuu1j1",
    "1j11111111j1",
    "1jjjjjjjjjj1",
    "1jjjjjjjjjj1",
    ".1111111111.",
    "............",
])
add('ico_key', 11, [
    "..111111...",
    ".1ddddd1...",
    ".1d111d1...",
    ".1ddddd1...",
    "..11d11....",
    "....d1.....",
    "....d1.....",
    "....dd1....",
    "....d1.....",
    "....dd1....",
    "...........".ljust(11, '.'),
])
add('ico_map', 12, [
    "............",
    ".11111111...",
    "1jjjjjjjj1..",
    "1j1jj1jjj1..",
    "1jjj1jj1j1..",
    "1j1jjj1jj1..",
    "1jj1j1jjj1..",
    "1jjjj1jjj1..",
    "1jjjjjjjj1..",
    ".11111111...",
    "............",
    "............",
])
add('ico_charm', 12, [
    ".....11.....",
    "....1ll1....",
    "...1llll1...",
    "..1llffll1..",
    ".1llffffll1.",
    "1llllffllll1",
    "1llllffllll1",
    ".1llffffll1.",
    "..1llffll1..",
    "...1llll1...",
    "....1ll1....",
    ".....11.....",
])
# shrine 20x24
add('shrine', 20, [
    ".........11.........",
    "........1vv1........",
    ".......1vvvv1.......",
    "......1vvvvvv1......",
    ".....1vvvvvvvv1.....",
    ".....1vvffffvv1.....",
    ".....1vvffffvv1.....",
    ".....1vvvvvvvv1.....",
    "......1vvvvvv1......",
    ".......1vvvv1.......",
    "........1ss1........",
    ".......1ssss1.......",
    "......1ssssss1......",
    "......1ssssss1......",
    "......1ssssss1......",
    "......1ssssss1......",
    ".....1ssssssss1.....",
    "....1ssssssssss1....",
    "...1ssssssssssss1...",
    "...1ssssssssssss1...",
    "..1ssssssssssssss1..",
    "..1ssssssssssssss1..",
    ".1ssssssssssssssss1.",
    ".1111111111111111111",
])
# chest 16x12
add('chest_closed', 16, [
    "................",
    "...1111111111...",
    "..1iiiiiiiiii1..",
    "..1ijjjjjjjjji1.",
    "..1iiiiiiiiii1..",
    "..1iiidddiiii1..",
    "..1iiideediii1..",
    "..1iiidddiiii1..",
    "..1iiiiiiiiii1..",
    "..1ijjjjjjjjji1.",
    "..1iiiiiiiiii1..",
    "..11111111111...",
])
add('chest_open', 16, [
    "..1111111111....",
    ".1iiiiiiiiii1...",
    ".1ijjjjjjjjji1..",
    ".1iiiiiiiiii1...",
    ".111111111111...",
    "...1111111111...",
    "..1iiiiiiiiii1..",
    "..1iiiiiiiiii1..",
    "..1ijjjjjjjjji1.",
    "..1iiiiiiiiii1..",
    "..1ijjjjjjjjji1.",
    "..11111111111...",
])
# NPCs
add('npc_old', 18, [
    "....11.....11.....",
    "...1221...1221....",
    "..122211112221....",
    "..122222222221....",
    ".12222222222221...",
    ".1225522225522 1..".replace(' ', ''),
    ".12255222255221...",
    ".12222255222221...",
    "..1222556652211...",
    "...1222222221.....",
    "...1aaaaaaaa1.....",
    "..1aaaaaaaaaa1....",
    "..1a22222222a1....",
    "..1a22222222a1....",
    "..1a22222222a1....",
    "..1a22222222a1....",
    "...122222221......",
    "...1221..1221.....",
    "...1221..1221.....",
    "..112211.112211...",
    "..111111.111111...",
    "..................",
])
add('npc_moth', 18, [
    "......1111........",
    "....11llll11......",
    "...1llvvvvll1.....",
    "...1lvvvvvvl1.....",
    "..1llvvvvvvll1....",
    "..1lvvuuuuvvl1....",
    "..1lvvuuuuvvl1....",
    "..1llvvvvvvll1....",
    "...1llvvvvll1.....",
    "....11llll11......",
    "...1llllllll1.....",
    "..1llllllllll1....",
    "..1llllllllll1....",
    "...1llllllll1.....",
    "....1llllll1......",
    ".....111111.......",
    "......1..1........",
    ".....11..11.......",
    "..................",
    "..................",
    "..................",
    "..................",
])
add('npc_vesper', 18, [
    ".......111........",
    ".....11qqq11......",
    "....1qqqqqqq1.....",
    "....1qqvvvqq1.....",
    "....1qqvvvqq1.....",
    "....1qqqqqqq1.....",
    "...11qqqqqqq11....",
    "..1qqqqqqqqqqq1...",
    "..1qqvvvvvvvqq1...",
    "..1qvvvvvvvvvq1...",
    "..1qvvvvvvvvvq1...",
    "..1qvvvvvvvvvq1...",
    "..1qvvvvvvvvvq1...",
    "..1qvvvvvvvvvq1...",
    "..1qqvvvvvvvqq1...",
    "...1qqvvvvvqq1....",
    "....1qqqqqqq1.....",
    ".....1111111......",
    "..................",
    "..................",
    "..................",
    "..................",
])
add('npc_carto', 18, [
    "....11.....11.....",
    "...1ss1...1ss1....",
    "..1sstt1111tts1...",
    "..1stttttttttts1..",
    ".1stttttttttttts1.",
    ".1sttuuttstuutts1.",
    ".1sttuuttstuutts1.",
    ".1stttttttttttts1.",
    "..1stttt55tttts1..",
    "...1stttttttts1...",
    "...1ii111111ii1...",
    "..1iiiiiiiiiiii1..",
    "..1iiiiiiiiiiii1..",
    "..1iiiiiiiiiiii1..",
    "..1iiiiiiiiiiii1..",
    "...1iiiiiiiii1....",
    "...1ii1...1ii1....",
    "...1ii1...1ii1....",
    "..11ii11.11ii11...",
    "..111111.111111...",
    "..................",
    "..................",
])

# ================================================================ helpers ==
def bmp_write(path, w, h, rows_rgb):
    """rows_rgb: list of h rows, each a list of w (r,g,b) tuples."""
    rowbytes = w * 3
    pad = (-rowbytes) % 4
    pixsize = (rowbytes + pad) * h
    data = bytearray()
    for y in range(h - 1, -1, -1):
        row = rows_rgb[y]
        for x in range(w):
            r, g, b = row[x]
            data += bytes((b, g, r))
        data += b'\x00' * pad
    hdr = b'BM' + struct.pack('<IHHI', 14 + 40 + pixsize, 0, 0, 14 + 40)
    dib = struct.pack('<IiiHHIIiiII', 40, w, h, 1, 24, 0, pixsize, 2835, 2835, 0, 0)
    with open(path, 'wb') as f:
        f.write(hdr + dib + bytes(data))

def contact_sheet(path, scale=3, cols=14, bg=(24, 20, 40)):
    names = list(SPR.keys())
    cellw = max(SPR[n][0] for n in names) * scale + 6
    cellh = max(SPR[n][1] for n in names) * scale + 14
    rowsn = (len(names) + cols - 1) // cols
    W, H = cols * cellw + 8, rowsn * cellh + 8
    canvas = [[bg for _ in range(W)] for _ in range(H)]
    for idx, n in enumerate(names):
        w, h, art, _ = SPR[n]
        cx = 4 + (idx % cols) * cellw + 3
        cy = 4 + (idx // cols) * cellh + 3
        for y in range(h):
            for x in range(w):
                ch = art[y][x]
                if ch == '.':
                    continue
                c = PAL[ch]
                for dy in range(scale):
                    for dx in range(scale):
                        if 0 <= cy + y * scale + dy < H and 0 <= cx + x * scale + dx < W:
                            canvas[cy + y * scale + dy][cx + x * scale + dx] = c
    bmp_write(path, W, H, canvas)

def emit_c(path):
    lines = []
    lines.append("/* GENERATED by tools/artgen.py -- do not edit by hand. */")
    lines.append("#include <stdint.h>")
    # palette: index = digit (0-9) or 10+(a-z)
    pal = [0]*36
    for ch,(r,g,b) in PAL.items():
        idx = (ord(ch)-ord('0')) if ch.isdigit() else (10+ord(ch)-ord('a'))
        pal[idx] = (r<<16)|(g<<8)|b
    lines.append("static const uint32_t ART_PAL[36] = {")
    lines.append("  " + ",".join("0x%06Xu"%v for v in pal) + "")
    lines.append("};")
    lines.append("#ifndef ART_DATA_H")
    lines.append("#define ART_DATA_H")
    lines.append("typedef struct { const char *name; int w,h; const char *art; } ArtEntry;")
    lines.append("static const ArtEntry ART_TABLE[] = {")
    for n in sorted(SPR.keys()):
        w, h, art, _ = SPR[n]
        blob = ''.join(art)
        assert len(blob) == w * h, "%s blob %d != %d" % (n, len(blob), w * h)
        lines.append('  {"%s",%d,%d,"%s"},' % (n, w, h, blob))
    lines.append("};")
    lines.append("#define ART_COUNT %d" % len(SPR))
    lines.append("#endif")
    with open(path, 'w') as f:
        f.write('\n'.join(lines) + '\n')

def main():
    ok = True
    for n in sorted(SPR.keys()):
        w, h, art, _ = SPR[n]
        if len(art) != h:
            ERRORS.append("%s declared h=%d but has %d rows" % (n, h, len(art)))
    if ERRORS:
        print("ART ERRORS:")
        for e in sorted(set(ERRORS)):
            print("  " + e)
        ok = False
    if NOTES:
        print("ART NOTES (declared width auto-corrected):")
        for n in NOTES:
            print("  " + n)
    os.makedirs(os.path.join(ROOT, 'shots'), exist_ok=True)
    contact_sheet(os.path.join(ROOT, 'shots', 'art_sheet.bmp'))
    emit_c(os.path.join(ROOT, 'src', 'art_data.h'))
    print("sprites: %d" % len(SPR))
    print("wrote shots/art_sheet.bmp and src/art_data.h")
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main())
