/* ============================================================================
   METRODIVINIA  --  a 2D metroidvania about a cat with a sword.
   Core, platform-independent header.
   ========================================================================== */
#ifndef METRODIVINIA_GAME_H
#define METRODIVINIA_GAME_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

/* ---------------------------------------------------------------- config -- */
#define MD_VERSION      "1.0"
#define MD_TITLE        "METRODIVINIA"

#define VIEW_W          640
#define VIEW_H          360
#define TILE            16

#define DT              (1.0f/60.0f)
#define MAX_ROOMS       96
#define MAX_ENTITIES    220
#define MAX_PARTICLES   900
#define MAX_PROJ        120
#define MAX_TEXT_LEN    512

#define SAVE_MAGIC      0x4D445631u  /* "MDV1" */

/* ------------------------------------------------------------- utilities -- */
#define ARRLEN(a)       ((int)(sizeof(a)/sizeof((a)[0])))
#define CLAMP(v,a,b)    ((v)<(a)?(a):((v)>(b)?(b):(v)))
#define MIN(a,b)        ((a)<(b)?(a):(b))
#define MAX(a,b)        ((a)>(b)?(a):(b))
#define ABS(a)          ((a)<0?-(a):(a))
#define SIGN(a)         ((a)<0?-1:((a)>0?1:0))

#ifdef RGB
#undef RGB   /* windows.h defines a BGR COLORREF RGB; we use our own */
#endif
#define RGB(r,g,b)      (0xFF000000u | (((uint32_t)(r)<<16)|((uint32_t)(g)<<8)|(uint32_t)(b)))
#define RGBA(r,g,b,a)   ((((uint32_t)(a)&255)<<24)|(((uint32_t)(r)&255)<<16)|(((uint32_t)(g)&255)<<8)|((uint32_t)(b)&255))
#define GETA(c)         (((c)>>24)&255u)
#define GETR(c)         (((c)>>16)&255u)
#define GETG(c)         (((c)>>8)&255u)
#define GETB(c)         ((c)&255u)

typedef struct { int x,y,w,h; } IRect;
typedef struct { float x,y,w,h; } FRect;

static inline int   aabb(int ax,int ay,int aw,int ah,int bx,int by,int bw,int bh){
    return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}
static inline int faabb(float ax,float ay,float aw,float ah,float bx,float by,float bw,float bh){
    return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}
float md_lerp(float a,float b,float t);
float md_randf(void);
float md_randrange(float lo,float hi);
int   md_randint(int lo,int hi);      /* inclusive */
void  md_srand(uint32_t seed);
uint32_t md_rand32(void);
float md_approach(float cur,float tgt,float step);
float md_ease(float t);
void *md_alloc(size_t n);
void *md_calloc(size_t n);
char *md_strdup(const char *s);
void  md_fatal(const char *fmt, ...);

/* -------------------------------------------------------------- graphics -- */
typedef struct {
    int w,h;
    uint32_t *px;   /* 0x00RRGGBB with 0 alpha meaning transparent */
} Sprite;

Sprite *spr_new(int w,int h);
void    spr_free(Sprite *s);
Sprite *spr_from_ascii(int w, int h, const char *art, const uint32_t *pal, int palCount);
Sprite *spr_clone_flip(Sprite *src, int flipX);
Sprite *spr_copy_region(Sprite *src,int x,int y,int w,int h);
Sprite *spr_recolor(Sprite *src, uint32_t from, uint32_t to);

/* the render target(s) */
extern uint32_t *g_screen;          /* VIEW_W*VIEW_H, 0x00RRGGBB (alpha ignored) */
extern uint32_t *g_scratch;         /* secondary buffer */
extern uint32_t *g_light;           /* light accumulation buffer, 8-bit-ish */
extern uint32_t *g_lightSrc;        /* light source buffer */

void gfx_init(void);
void gfx_free(void);
void gfx_clear(uint32_t c);
void gfx_fill_screen(uint32_t c);
void gfx_rect(uint32_t *buf,int bw,int bh,int x,int y,int w,int h,uint32_t c);
void gfx_hline(uint32_t *buf,int bw,int bh,int x,int y,int w,uint32_t c);
void gfx_vline(uint32_t *buf,int bw,int bh,int x,int y,int h,uint32_t c);
void gfx_frame(uint32_t *buf,int bw,int bh,int x,int y,int w,int h,uint32_t c);
void gfx_px(uint32_t *buf,int bw,int bh,int x,int y,uint32_t c);
void gfx_blend(uint32_t *buf,int bw,int bh,int x,int y,uint32_t c);   /* alpha blend */
void gfx_rect_blend(uint32_t *buf,int bw,int bh,int x,int y,int w,int h,uint32_t c);
void gfx_rect_add(uint32_t *buf,int bw,int bh,int x,int y,int w,int h,uint32_t c);
void gfx_sprite(uint32_t *buf,int bw,int bh,const Sprite *s,int x,int y);
void gfx_sprite_buf(const Sprite *s,uint32_t *dst,int dw,int dh,int x,int y);
void gfx_sprite_tint(uint32_t *buf,int bw,int bh,const Sprite *s,int x,int y,uint32_t tint,int mode);
/* tint modes */
#define TINT_MUL    0
#define TINT_ADD    1
#define TINT_SILHOUETTE 2
void gfx_sprite_ex(uint32_t *buf,int bw,int bh,const Sprite *s,int x,int y,int flipX,int flipY,uint32_t tint,int mode,float alpha);
void gfx_sprite_scaled(uint32_t *buf,int bw,int bh,const Sprite *s,int x,int y,int scale,uint32_t tint,int mode);
void gfx_circle_fill(uint32_t *buf,int bw,int bh,int cx,int cy,int r,uint32_t c);
void gfx_circle_blend(uint32_t *buf,int bw,int bh,int cx,int cy,int r,uint32_t c);
void gfx_ellipse_fill(uint32_t *buf,int bw,int bh,int cx,int cy,int rx,int ry,uint32_t c);
void gfx_line(uint32_t *buf,int bw,int bh,int x0,int y0,int x1,int y1,uint32_t c);
void gfx_line_thick(uint32_t *buf,int bw,int bh,int x0,int y0,int x1,int y1,int t,uint32_t c);
void gfx_tri(uint32_t *buf,int bw,int bh,int x0,int y0,int x1,int y1,int x2,int y2,uint32_t c);
void gfx_poly(uint32_t *buf,int bw,int bh,const int *pts,int n,uint32_t c);
void gfx_blit_buf(uint32_t *dst,int dw,int dh,const uint32_t *src,int sw,int sh,int x,int y);
void gfx_blit_buf_scaled(uint32_t *dst,int dw,int dh,const uint32_t *src,int sw,int sh,int x,int y,int scale,int flipX);
void gfx_blit_buf_alpha(uint32_t *dst,int dw,int dh,const uint32_t *src,int sw,int sh,int x,int y,float alpha);

/* font */
void font_init(void);
void font_text(uint32_t *buf,int bw,int bh,int x,int y,const char *s,uint32_t c);
void font_text_shadow(uint32_t *buf,int bw,int bh,int x,int y,const char *s,uint32_t c,uint32_t sh);
void font_text_center(uint32_t *buf,int bw,int bh,int cx,int y,const char *s,uint32_t c,uint32_t sh);
int  font_width(const char *s);
void font_glyph(uint32_t *buf,int bw,int bh,int x,int y,char ch,uint32_t c);

/* noise / texture generation */
float noise2(int x,int y,uint32_t seed);
uint32_t hash2(int x,int y,uint32_t seed);
float fnoise2(float x,float y,uint32_t seed);
float fbm2(float x,float y,int oct,uint32_t seed);
void  make_tile_textures(void);
void  make_parallax_layers(void);

/* ---------------------------------------------------------------- tiles --- */
enum {
    T_EMPTY=0, T_SOLID, T_PLATFORM, T_SPIKE, T_WATER, T_LAVA, T_ICE,
    T_CRUMBLE, T_ICEBLOCK, T_VINE, T_SWITCH, T_SAVE, T_CHEST, T_HIDDEN,
    T_BREAKABLE, T_CONVEYOR_L, T_CONVEYOR_R, T_LADDER, T_DARKSOLID, T_SNOWSOLID,
    T_COUNT
};

/* ------------------------------------------------------------ abilities --- */
enum {
    AB_DASH=0, AB_DJUMP, AB_WALL, AB_FIRE, AB_GLIDE, AB_AIRDASH, AB_DIVINE, AB_COUNT
};
extern const char *ABILITY_NAMES[AB_COUNT];
extern const char *ABILITY_DESCS[AB_COUNT];

/* ---------------------------------------------------------------- charms -- */
enum {
    CH_NONE=-1,
    CH_SWIFT=0, CH_IRON, CH_THORN, CH_VAMP, CH_NINE, CH_LUCK, CH_ECHO, CH_FURY,
    CH_COUNT
};
extern const char *CHARM_NAMES[CH_COUNT];
extern const char *CHARM_DESCS[CH_COUNT];
extern const int   CHARM_COST[CH_COUNT];

/* ---------------------------------------------------------------- zones --- */
enum {
    Z_VERDANT=0, Z_CISTERN, Z_WARRENS, Z_EMBER, Z_FROST, Z_SKY, Z_CORE, Z_COUNT
};
extern const char *ZONE_NAMES[Z_COUNT];

/* -------------------------------------------------------------- input ----- */
enum {
    BTN_LEFT=0, BTN_RIGHT, BTN_UP, BTN_DOWN,
    BTN_JUMP, BTN_ATTACK, BTN_DASH, BTN_SPECIAL,
    BTN_MAP, BTN_PAUSE, BTN_CONFIRM, BTN_CANCEL, BTN_COUNT
};
typedef struct {
    uint32_t held, pressed, released;
    float    ax, ay;               /* analog-ish axis (from keys) */
} InputState;

/* ------------------------------------------------------------- entities --- */
enum {
    E_NONE=0,
    E_SLIME, E_BAT, E_THORNLING, E_SHROOM,
    E_MUDLURK, E_JELLY, E_ANGLER, E_DRIP,
    E_LARVA, E_BEETLE, E_SPITTER, E_SWARM,
    E_EMBERLING, E_FORGEBOT, E_MAGMITE, E_TURRET,
    E_FROSTLING, E_WISP, E_YETI, E_ICICLE,
    E_CROWLING, E_HARPY, E_GUST, E_SENTINEL,
    E_VOIDLING, E_ACOLYTE, E_REVENANT,
    E_NPC, E_SHOPKEEP, E_LORE, E_CHEST, E_SHRINE, E_SIGN,
    E_PROJECTILE, E_PICKUP, E_HAZARD, E_TRIGGER,
    E_TYPE_COUNT
};

/* enemy archetype flags */
#define EF_FLY      (1<<0)
#define EF_NOGRAV   (1<<1)
#define EF_HOSTILE  (1<<2)
#define EF_SOLID    (1<<3)
#define EF_UNIQ     (1<<4)

typedef struct Entity Entity;
struct Entity {
    int      alive;
    int      type;
    int      id;                   /* unique per-room instance id */
    float    x,y,w,h;
    float    vx,vy;
    int      dir;
    int      hp, maxhp;
    int      onground;
    float    t;                    /* generic timer / anim clock */
    float    animT;
    int      frame;
    int      state;                /* ai state */
    float    stateT;
    int      facing;
    int      flags;
    int      hurtT;                /* flash timer */
    int      invulnT;
    int      damage;
    float    homeX, homeY;
    float    rangeX, rangeY;
    int      patrol;
    int      patrolDir;
    int      cooldown;
    int      param[6];
    float    fparam[6];
    int      dead;                 /* died this frame */
    int      boss;                 /* boss index or -1 */
    char     text[128];            /* dialogue / label */
    int      knockX, knockY;
    int      spawnTick;
};

/* ---------------------------------------------------------- projectiles --- */
typedef struct {
    int   alive;
    float x,y,w,h,vx,vy;
    int   damage;
    int   fromPlayer;
    int   life;
    int   kind;                    /* 0 basic,1 fire,2 ice,3 seed,4 orb,5 spark,6 bone */
    int   pierce;
    int   homing;
    int   gravity;
    int   bounce;
    int   animT;
    int   targetX, targetY;
} Projectile;

/* ----------------------------------------------------------- particles ---- */
typedef struct {
    int   alive;
    float x,y,vx,vy;
    float life, maxlife;
    float size;
    uint32_t col;
    uint32_t col2;
    int   kind;      /* 0 square,1 circle,2 spark,3 smoke,4 snow,5 leaf,6 ring,7 shard,8 text */
    int   gravity;
    int   fade;
    float rot, vrot;
    char  ch;        /* for kind==8 */
    int   shrink;
} Particle;

/* ------------------------------------------------------------- bosses ----- */
enum {
    B_NONE=-1,
    B_THORNMAW=0, B_LEVIATHAN, B_HIVEMOTHER, B_IGNIS, B_CHOIR, B_STORMCROW,
    B_METRODIVINIA, B_NINTHLIFE,
    B_COUNT
};
extern const char *BOSS_NAMES[B_COUNT];

typedef struct {
    int    active;
    int    kind;
    float  x,y,w,h;
    float  vx,vy;
    int    hp, maxhp;
    int    phase;
    float  t, stateT;
    int    state;
    int    hurtT, invulnT;
    int    dir;
    int    defeated;
    int    intro;                 /* intro timer, boss invulnerable */
    float  parts[16][4];          /* generic animated part transforms */
    float  ang[16];
    int    param[8];
    char   name[40];
    float  shake;
    int    hitstop;
} Boss;

/* --------------------------------------------------------------- world ---- */
#define ROOM_NAMELEN 40

typedef struct {
    int   target;
    IRect area;
    int   tx, ty;                 /* spawn tile in target room */
    int   dir;
} RoomExit;

typedef struct {
    char  name[ROOM_NAMELEN];
    int   zone;
    int   w, h;                   /* in tiles */
    uint8_t *tiles;
    uint8_t *meta;                /* per-tile extra (variant etc.) */
    int   nExits;
    RoomExit exits[8];
    int   roomX, roomY;           /* world map grid position */
    int   boss;                   /* boss kind or -1 */
    int   music;
    int   dark;                   /* darkness level 0..255 */
    int   rain;                   /* ambient particle mode */
    char  subtitle[ROOM_NAMELEN];
    int   id;
    /* parsed entity spawns */
    int   nSpawns;
    struct { int type,tx,ty,p0,p1,p2; } spawns[48];
} Room;

typedef struct {
    int   room;
    float x,y;
    int   dir;
    int   discovered;
    int   visited;
    int   cleared;
    int   shrineUsed;
    int   chestsOpened;
} RoomState;

typedef struct {
    Room      rooms[MAX_ROOMS];
    int       nRooms;
    int       cur;
    RoomState st[MAX_ROOMS];
} World;

/* --------------------------------------------------------------- player --- */
typedef struct {
    float x,y,w,h,vx,vy;
    int   onground, onwall, walldir, onceil;
    int   dir;
    int   hp, maxhp;
    int   energy, maxenergy;
    int   jumpHeld;
    float coyote, jumpBuf, jumpHoldT;
    int   jumpsUsed;
    float dashT, dashCd, dashDirX, dashDirY;
    int   dashAvail;             /* air dashes left */
    int   invulnT, hurtT, deadT;
    int   attackT, attackKind, attackCombo, attackCd;
    int   specialT;
    int   animState, animFrame; float animT;
    int   abilities[AB_COUNT];
    int   charms[CH_COUNT];
    int   charmSlots[3];
    int   swordLevel;
    int   fish;
    int   shards, shardsTotal;
    int   yarn, yarnTotal;
    int   lore[32]; int nLore;
    int   heartsFound;
    int   kills, deaths, plays;
    float playtime;
    int   gliding;
    int   crouch;
    int   wallSlideT;
    int   pogoT;
    int   respawnT;
    int   talkT;
    int   transform;             /* 0 cat, 1 divine form */
    float lastSafeX, lastSafeY;
    int   lastSafeRoom;
    int   hitStop;
    int   comboCount; float comboT;
} Player;

/* -------------------------------------------------------------- dialogue -- */
typedef struct {
    int  active;
    char lines[12][160];
    int  nLines, line;
    int  chr;                    /* chars revealed */
    float chrT;
    char speaker[32];
    int  portrait;
    int  done;
    int  advanceT;
} Dialogue;

/* ----------------------------------------------------------------- save --- */
typedef struct {
    uint32_t magic;
    uint32_t version;
    int      room; float x,y;
    int      hp, maxhp, energy, maxenergy, fish;
    int      abilities[AB_COUNT];
    int      charms[CH_COUNT];
    int      charmSlots[3];
    int      swordLevel;
    int      shards, yarn, heartsFound;
    int      lore[32]; int nLore;
    int      kills, deaths;
    float    playtime;
    uint8_t  roomVisited[MAX_ROOMS];
    uint8_t  roomCleared[MAX_ROOMS];
    uint8_t  roomShrine[MAX_ROOMS];
    uint16_t chests[MAX_ROOMS];
    int      bossesDown[B_COUNT];
    int      flags[32];
    uint32_t checksum;
    int      slotsUsed;
} SaveData;

/* ------------------------------------------------------------ shop items -- */
typedef struct { const char *name; const char *desc; int price; int kind; int val; } ShopItem;

/* ---------------------------------------------------------------- game ---- */
enum {
    ST_BOOT=0, ST_TITLE, ST_MENU, ST_PLAY, ST_PAUSE, ST_MAP, ST_DIALOG,
    ST_GAMEOVER, ST_CREDITS, ST_TRANSITION, ST_ITEMGET, ST_SHOP, ST_OPTIONS,
    ST_LORE, ST_ENDING, ST_COUNT
};

typedef struct {
    int      state, prevState;
    int      quit;
    World    world;
    Player   p;
    Entity   ents[MAX_ENTITIES];
    int      nEnts;
    Projectile projs[MAX_PROJ];
    Particle parts[MAX_PARTICLES];
    Boss     boss;
    Dialogue dlg;
    InputState in;
    /* camera */
    float    camX, camY, camTX, camTY;
    float    shakeX, shakeY, shakeMag;
    int      hitstop;
    /* transition */
    int      transT, transDir, transTarget;
    float    transX, transY;
    int      transDirVec;
    /* ui */
    int      menuSel, menuPage;
    int      mapZoom, mapSel;
    float    mapX, mapY;
    int      itemGetT; int itemGetKind; int itemGetVal;
    char     itemName[48]; char itemDesc[96];
    int      roomTitleT;
    int      fadeT, fadeDir;
    int      paused;
    int      msgT; char msg[96];
    int      shopSel; int shopId;
    int      loreSel;
    int      optSel;
    int      titleT;
    int      endingPhase;
    int      deathCount;
    /* settings */
    int      masterVol, musicVol, sfxVol;
    int      fullscreen;
    int      shakeOn;
    int      difficulty;          /* 0 normal, 1 hard */
    /* stats */
    int      frame;
    float    fps;
    int      showFps;
    int      bossBarT;
    int      firstLoad;
    int      newGamePlus;
    int      creditsT;
    int      menuOpenT;
    int      tutorialT;
    int      secretFound;
} Game;

extern Game *G;

/* game.c */
void game_init(void);
void game_update(void);
void check_transitions(void);
void game_render(void);
void game_new(void);
void game_load_room(int idx, float px, float py, int dir);
void game_room_transition(int target, float tx, float ty, int dirVec);
void game_spawn_room_entities(void);
void game_clear_entities(void);
Entity *game_spawn(int type, float x, float y);
Entity *game_find_entity(int id);
void game_kill_entity(Entity *e);
void game_msg(const char *fmt, ...);
void game_shake(float mag);
void game_hitstop(int frames);
int  game_completion(void);
void game_trigger_boss(int kind);
void game_open_dialog(const char *speaker,int portrait,const char **lines,int n);
void game_save(void);
int  game_load_slot(int slot);
int  game_has_save(void);
void game_do_save_shrine(void);
int  game_flag(int i);
void game_set_flag(int i,int v);
void game_give_item(int kind,int val,const char *name,const char *desc);
int  game_player_has_ability(int a);
void game_grant_ability(int a);

/* player.c */
void player_init(void);
void player_update(void);
void player_hurt(int dmg, float fromX);
void player_heal(int amt);
void player_render(void);
void player_reset_state(void);
int  player_attack_box(float *x,float *y,float *w,float *h);
void player_apply_charms(void);

/* entities.c */
void ent_update_all(void);
void ent_render_all(void);
void ent_init(Entity *e,int type,float x,float y);
void ent_hurt(Entity *e,int dmg,float fromX,float fromY);
void ent_spawn_particles(Entity *e,int n,uint32_t c);
Entity *ent_nearest_hostile(float x,float y,float maxd);
const char **lore_text(int id);

/* bosses.c */
void boss_start(int kind, float x, float y);
void boss_update(void);
void boss_render(void);
void boss_hurt(int dmg, float fromX, float fromY);
int  boss_active(void);

/* projectiles */
Projectile *proj_spawn(float x,float y,float vx,float vy,int dmg,int fromPlayer,int kind);
void proj_update(void);
void proj_render(void);
void proj_clear(void);

/* particles */
void part_spawn(float x,float y,float vx,float vy,float life,uint32_t c,int kind,float size);
void part_spawn_ex(Particle *tpl);
void part_update(void);
void part_render(uint32_t *buf,int bw,int bh,int ox,int oy);
void part_clear(void);
void part_burst(float x,float y,int n,uint32_t c,float spd,int kind,float size);
void part_text(float x,float y,const char *s,uint32_t c);
void part_ring(float x,float y,uint32_t c,float r);

/* art.c */
void art_init(void);
struct Sprite;
Sprite *art(const char *name);
Sprite *tile_spr(int tile,int zone);
void ensure_parallax(int zone);
uint32_t *parallax_layer(int zone,int layer);
void world_trigger_crumble(int tx,int ty);

/* world.c */
void world_init(void);
void world_build_rooms(void);
int  world_tile(int tx,int ty);
int  world_tile_at(float wx,float wy);
void world_set_tile(int tx,int ty,int v);
int  world_solid_at(float wx,float wy);
int  world_hazard_at(float wx,float wy);
void world_move_x(float *x,float *y,float w,float h,float *vx,float vy,int *hit);
void world_move_y(float *x,float *y,float w,float h,float vx,float *vy,int *hit);
int  world_line_clear(float x0,float y0,float x1,float y1);
void world_render_back(void);
void world_render_front(void);
void world_render_tiles(void);
int  world_rect_solid(float x,float y,float w,float h);
int  world_on_platform(float x,float y,float w);
void world_update_dynamic(void);
int  world_zone(void);

/* ui.c */
void ui_init(void);
void ui_render_hud(void);
void ui_render_title(void);
void ui_render_menu(void);
void ui_render_pause(void);
void ui_render_map(void);
void ui_render_dialog(void);
void ui_render_itemget(void);
void ui_render_shop(void);
void ui_render_options(void);
void ui_render_lore(void);
void ui_render_ending(void);
void ui_render_credits(void);
void ui_render_bossbar(void);
void ui_render_msg(void);
void ui_update_menu(void);
void ui_update_pause(void);
void ui_update_map(void);
void ui_update_dialog(void);
void ui_update_shop(void);
void ui_update_options(void);
void ui_update_lore(void);
void ui_draw_panel(int x,int y,int w,int h,int style);
void ui_draw_heart(int x,int y,int fill,uint32_t col);
void ui_draw_portrait(int x,int y,int kind,int frame);
void ui_draw_icon(int x,int y,int kind,int size);
const ShopItem *ui_shop_items(int shopId,int *count);

/* audio.c */
void audio_init(int sampleRate);
void audio_shutdown(void);
void audio_update(void);
int  audio_mix(int16_t *out, int frames);
void audio_sfx(int id);
void audio_music(int track);
void audio_set_volume(int master,int music,int sfx);
void audio_stop_music(void);
enum {
    SFX_NONE=0, SFX_JUMP, SFX_LAND, SFX_SWING, SFX_HIT, SFX_HURT, SFX_DASH,
    SFX_PICKUP, SFX_COIN, SFX_SHRINE, SFX_DOOR, SFX_MENU, SFX_CANCEL, SFX_SELECT,
    SFX_EXPLODE, SFX_BOSSROAR, SFX_DEATH, SFX_HEAL, SFX_BLOCK, SFX_FIRE, SFX_ICE,
    SFX_DOUBLEJUMP, SFX_WALLJUMP, SFX_GLIDE, SFX_CHEST, SFX_TALK, SFX_BOSSHIT,
    SFX_BOSSDIE, SFX_SPECIAL, SFX_SHATTER, SFX_SPLASH, SFX_BUZZ, SFX_ROAR2,
    SFX_SAVEWRITE, SFX_1UP, SFX_COMBO, SFX_PARRY,
    SFX_COUNT
};
enum {
    MUS_NONE=0, MUS_TITLE, MUS_VERDANT, MUS_CISTERN, MUS_WARRENS, MUS_EMBER,
    MUS_FROST, MUS_SKY, MUS_CORE, MUS_BOSS, MUS_FINAL, MUS_SHRINE, MUS_ENDING,
    MUS_GAMEOVER, MUS_SECRET, MUS_COUNT
};

/* platform hooks (implemented per platform) */
void platform_get_input(InputState *in);
void platform_present(const uint32_t *framebuffer);
void platform_audio_pump(void);
uint64_t platform_ticks_ms(void);
void platform_delay_ms(int ms);
int  platform_write_file(const char *path,const void *data,int len);
int  platform_read_file(const char *path,void *data,int maxlen);
void platform_save_path(char *out,int maxlen,const char *name);

#endif /* METRODIVINIA_GAME_H */
