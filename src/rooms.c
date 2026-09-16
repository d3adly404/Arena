/* ============================================================================
   rooms.c -- world layout / level data  (built in chunks)
   ========================================================================== */
#include "game.h"

static Room *BR;

static void begin(int id,const char *name,int zone,int rx,int ry){
    World *w=&G->world;
    if(id>=MAX_ROOMS)id=0;
    BR=&w->rooms[id];
    memset(BR,0,sizeof(*BR));
    BR->id=id; BR->zone=zone; BR->roomX=rx; BR->roomY=ry; BR->boss=-1;
    snprintf(BR->name,sizeof(BR->name),"%s",name);
}
static void size(int wdt,int hgt){
    BR->w=wdt; BR->h=hgt;
    BR->tiles=(uint8_t*)md_calloc((size_t)wdt*hgt);
    BR->meta =(uint8_t*)md_calloc((size_t)wdt*hgt);
}
static int tilechar(char c){
    switch(c){
        case '#': return T_SOLID;
        case '=': return T_PLATFORM;
        case '^': return T_SPIKE;
        case 'w': return T_WATER;
        case 'l': return T_LAVA;
        case 'i': return T_ICE;
        case 'c': return T_CRUMBLE;
        case 'b': return T_BREAKABLE;
        case 'v': return T_VINE;
        case 'd': return T_DARKSOLID;
        case 's': return T_SNOWSOLID;
        default:  return T_EMPTY;
    }
}
static void grid(const char *g){
    const char *p=g; int x=0,y=0;
    while(*p){
        char c=*p++;
        if(c=='\n'){ y++; x=0; continue; }
        if(x<BR->w && y<BR->h) BR->tiles[y*BR->w+x]=(uint8_t)tilechar(c);
        x++;
    }
}
static void sp(int type,int tx,int ty,int p0,int p1,int p2){
    if(BR->nSpawns>=48) return;
    BR->spawns[BR->nSpawns].type=type;
    BR->spawns[BR->nSpawns].tx=tx; BR->spawns[BR->nSpawns].ty=ty;
    BR->spawns[BR->nSpawns].p0=p0; BR->spawns[BR->nSpawns].p1=p1; BR->spawns[BR->nSpawns].p2=p2;
    BR->nSpawns++;
}
static void exitr(int target,int x,int y,int wd,int hg,int tx,int ty,int dir){
    if(BR->nExits>=8) return;
    RoomExit *e=&BR->exits[BR->nExits++];
    e->target=target; e->dir=dir;
    if(hg<=3){ /* vertical door (top/bottom) */
        if(y<=0){ e->area.x=x; e->area.y=0; e->area.w=wd; e->area.h=2; }
        else    { e->area.x=x; e->area.y=BR->h-3; e->area.w=wd; e->area.h=3; }
        e->tx=tx; e->ty=ty;
    } else {   /* side door at floor level, 2 wide x 4 tall; safe spawn inside */
        if(x<=1){ e->area.x=0; e->area.y=BR->h-7; e->area.w=2; e->area.h=4; e->tx=4;  e->ty=-7; }
        else    { e->area.x=BR->w-2; e->area.y=BR->h-7; e->area.w=2; e->area.h=4; e->tx=-5; e->ty=-7; }
    }
}
static void end(int boss,int music,int dark,int rain){
    BR->boss=boss; BR->music=music; BR->dark=dark; BR->rain=rain;
    if(BR->id+1>G->world.nRooms)G->world.nRooms=BR->id+1;
}

/* ---- feature helpers ---- */
static void set(int tx,int ty,int t){ if(BR&&tx>=0&&ty>=0&&tx<BR->w&&ty<BR->h) BR->tiles[ty*BR->w+tx]=(uint8_t)t; }
static void box(void){
    for(int x=0;x<BR->w;x++){ set(x,0,T_SOLID); set(x,BR->h-1,T_SOLID); set(x,BR->h-2,T_SOLID); set(x,BR->h-3,T_SOLID); }
    for(int y=0;y<BR->h;y++){ set(0,y,T_SOLID); set(BR->w-1,y,T_SOLID); }
}
static void plat(int x,int y,int w){ for(int i=0;i<w;i++) set(x+i,y,T_PLATFORM); }
static void sol(int x,int y,int w,int h){ for(int j=0;j<h;j++)for(int i=0;i<w;i++) set(x+i,y+j,T_SOLID); }
static void spike(int x,int y,int w){ for(int i=0;i<w;i++) set(x+i,y,T_SPIKE); }
static void water(int x,int y,int w,int h){ for(int j=0;j<h;j++)for(int i=0;i<w;i++) set(x+i,y+j,T_WATER); }
static void lava(int x,int y,int w,int h){ for(int j=0;j<h;j++)for(int i=0;i<w;i++) set(x+i,y+j,T_LAVA); }
static void iceb(int x,int y,int w,int h){ for(int j=0;j<h;j++)for(int i=0;i<w;i++) set(x+i,y+j,T_ICEBLOCK); }
static void vineb(int x,int y,int w,int h){ for(int j=0;j<h;j++)for(int i=0;i<w;i++) set(x+i,y+j,T_VINE); }
static void crum(int x,int y,int w){ for(int i=0;i<w;i++) set(x+i,y,T_CRUMBLE); }
static void clr(int x,int y,int w,int h){ for(int j=0;j<h;j++)for(int i=0;i<w;i++) set(x+i,y+j,T_EMPTY); }


void world_build_rooms(void){
    G->world.nRooms=0;

/* ================= VERDANT HOLLOW ================= */
begin(0,"Verdant Outskirts",Z_VERDANT,0,1); size(44,22); box();
  plat(8,16,3); plat(14,13,3); plat(20,10,3); plat(30,14,3); plat(36,11,3);
  sp(E_NPC,5,16,0,0,0); sp(E_SIGN,9,16,0,0,0); sp(E_SHRINE,21,15,0,0,0);
  sp(E_SLIME,28,16,0,0,0); sp(E_PICKUP,34,13,0,0,0); sp(E_SLIME,20,17,0,0,0);
  exitr(1,42,12,2,7,1,17,1); exitr(3,8,0,6,2,14,19,0);
  end(-1,MUS_VERDANT,0,5);
begin(1,"Mossy Crossing",Z_VERDANT,1,1); size(44,22); box();
  clr(17,19,8,3); spike(17,21,8); plat(18,15,2); plat(22,13,2); plat(26,15,2); plat(10,14,3); plat(32,12,3);
  sp(E_THORNLING,12,16,0,0,0); sp(E_SHROOM,31,16,0,0,0); sp(E_BAT,39,14,0,0,0);
  spike(10,18,3); spike(28,18,3);
  sp(E_PICKUP,2,16,0,0,0); sp(E_PICKUP,41,16,0,0,0); sp(E_LORE,30,14,0,0,0);
  exitr(0,0,12,2,7,41,17,-1); exitr(2,42,12,2,7,1,17,1); exitr(7,20,19,4,3,21,2,0);
  end(-1,MUS_VERDANT,0,5);
begin(2,"Shrine of the Swift Claw",Z_VERDANT,2,1); size(44,22); box();
  sol(20,14,2,5); sp(E_TRIGGER,21,10,AB_DASH,0,0); sp(E_SHRINE,10,16,0,0,0);
  sp(E_PICKUP,32,16,0,0,0); sp(E_SLIME,30,16,0,0,0);
  exitr(1,0,12,2,7,41,17,-1); exitr(6,42,12,2,7,1,17,1);
  end(-1,MUS_SHRINE,0,5);
begin(3,"Old Watchtower",Z_VERDANT,1,0); size(30,30); box();
  plat(17,5,1); plat(13,7,1); plat(9,9,1); plat(5,11,1);
  plat(25,11,1); plat(21,13,1); plat(17,15,1); plat(13,17,1); plat(9,19,1); plat(5,21,1);
  plat(24,24,2);
  sp(E_BAT,17,22,0,0,0); sp(E_THORNLING,5,25,0,0,0);
  sp(E_PICKUP,27,8,1,0,0); sp(E_PICKUP,20,12,0,0,0);
  exitr(0,12,28,6,2,9,2,0);
  end(-1,MUS_VERDANT,0,5);
begin(6,"Thornmaw's Den",Z_VERDANT,3,1); size(44,22); box();
  sp(E_SHRINE,3,16,0,0,0);
  exitr(2,0,12,2,7,41,17,-1);
  end(B_THORNMAW,MUS_BOSS,0,0);
begin(7,"Sunken Gate",Z_VERDANT,2,2); size(44,22); box();
  sol(17,16,4,3); sp(E_SHRINE,5,16,0,0,0); sp(E_BAT,30,12,0,0,0);
  exitr(1,20,0,4,3,21,16,0); exitr(8,42,12,2,7,1,15,1);
  end(-1,MUS_VERDANT,0,5);

/* ================= SUNKEN CISTERN ================= */
begin(8,"Cistern Depths",Z_CISTERN,3,2); size(44,22); box();
  water(3,16,6,3); water(18,16,6,3); water(33,16,6,3);
  sp(E_JELLY,14,14,0,0,0); sp(E_JELLY,28,14,0,0,0); sp(E_MUDLURK,10,16,0,0,0); sp(E_ANGLER,30,16,0,0,0);
  sp(E_PICKUP,20,12,0,0,0); sp(E_LORE,10,12,1,0,0);
  exitr(7,0,12,2,7,41,15,-1); exitr(9,42,12,2,7,1,15,1);
  end(-1,MUS_CISTERN,0,0);
begin(9,"Flooded Halls",Z_CISTERN,4,2); size(44,22); box();
  plat(10,10,4); plat(28,10,4); plat(4,13,2); plat(38,13,2);
  water(2,16,6,3); water(24,16,6,3);
  sp(E_ANGLER,14,14,0,0,0); sp(E_JELLY,38,14,0,0,0);
  sp(E_SHRINE,21,9,0,0,0); sp(E_PICKUP,12,8,0,0,0); sp(E_TRIGGER,32,9,AB_DJUMP,0,0);
  exitr(8,0,12,2,7,41,15,-1); exitr(10,42,12,2,7,1,15,1);
  end(-1,MUS_CISTERN,0,0);
begin(10,"Leviathan Basin",Z_CISTERN,4,3); size(44,22); box();
  sp(E_SHRINE,3,16,0,0,0);
  exitr(9,0,12,2,7,41,15,-1); exitr(11,42,12,2,7,1,15,1);
  end(B_LEVIATHAN,MUS_BOSS,0,0);
begin(11,"Drowned Passage",Z_CISTERN,5,2); size(44,22); box();
  water(8,14,10,5); water(26,14,10,5); plat(18,12,6);
  sp(E_DRIP,15,6,0,0,0); sp(E_DRIP,30,6,0,0,0); sp(E_JELLY,12,13,0,0,0);
  sp(E_PICKUP,21,10,0,0,0); sp(E_PICKUP,40,12,1,0,0);
  exitr(10,0,12,2,7,41,15,-1); exitr(12,42,12,2,7,1,15,1);
  end(-1,MUS_CISTERN,0,0);

/* ================= CHITTERING WARRENS ================= */
begin(12,"Warren Mouth",Z_WARRENS,6,2); size(44,22); box();
  sp(E_SHRINE,5,16,0,0,0); sp(E_NPC,10,16,1,0,0);
  sp(E_BEETLE,25,16,0,0,0);
  exitr(11,0,12,2,7,41,15,-1); exitr(13,42,12,2,7,1,15,1);
  end(-1,MUS_WARRENS,0,0);
begin(13,"Larva Warrens",Z_WARRENS,7,3); size(44,22); box();
  plat(10,11,2); plat(20,11,2); plat(32,13,2); plat(4,13,2);
  sp(E_LARVA,9,16,0,0,0); sp(E_LARVA,19,16,0,0,0); sp(E_LARVA,29,16,0,0,0); sp(E_SPITTER,38,14,0,0,0);
  sp(E_PICKUP,20,9,0,0,0);
  exitr(12,0,12,2,7,41,15,-1); exitr(14,42,12,2,7,1,15,1);
  end(-1,MUS_WARRENS,0,0);
begin(14,"Hive Mother Nest",Z_WARRENS,7,4); size(44,22); box();
  sp(E_SHRINE,3,16,0,0,0);
  exitr(13,0,12,2,7,41,15,-1); exitr(15,42,12,2,7,1,15,1);
  end(B_HIVEMOTHER,MUS_BOSS,0,0);
begin(15,"Silk Vaults",Z_WARRENS,8,3); size(44,22); box();
  sol(10,10,2,9); sol(20,8,2,11); sol(30,6,2,13);
  sp(E_TRIGGER,36,5,AB_WALL,0,0); sp(E_SHRINE,6,16,0,0,0);
  sp(E_SWARM,15,8,0,0,0); sp(E_SWARM,25,6,0,0,0);
  exitr(14,0,12,2,7,41,15,-1); exitr(16,42,12,2,7,1,15,1);
  end(-1,MUS_WARRENS,0,0);

/* ================= EMBERFOUNDRY ================= */
begin(16,"Foundry Gates",Z_EMBER,8,2); size(44,22); box();
  lava(2,16,6,3); lava(16,16,6,3); lava(30,16,6,3);
  sp(E_EMBERLING,10,16,0,0,0); sp(E_FORGEBOT,26,16,0,0,0); sp(E_MAGMITE,38,15,0,0,0);
  sp(E_SHRINE,5,14,0,0,0); sol(4,15,3,4);
  exitr(15,0,12,2,7,41,15,-1); exitr(17,42,12,2,7,1,15,1);
  end(-1,MUS_EMBER,0,0);
begin(17,"Molten Walks",Z_EMBER,9,2); size(44,22); box();
  lava(6,17,8,2); lava(20,17,8,2); lava(34,17,8,2);
  plat(8,14,4); plat(22,13,4); plat(36,12,4);
  sp(E_TURRET,12,15,0,0,0); sp(E_EMBERLING,26,16,0,0,0); sp(E_MAGMITE,40,11,0,0,0);
  sp(E_PICKUP,24,11,0,0,0);
  exitr(16,0,12,2,7,41,15,-1); exitr(18,42,12,2,7,1,15,1);
  end(-1,MUS_EMBER,0,0);
begin(18,"Ignis Crucible",Z_EMBER,9,3); size(44,22); box();
  sp(E_SHRINE,3,16,0,0,0);
  exitr(17,0,12,2,7,41,15,-1); exitr(19,42,12,2,7,1,15,1);
  end(B_IGNIS,MUS_BOSS,0,0);
begin(19,"Forge Sanctum",Z_EMBER,10,2); size(44,22); box();
  iceb(18,12,4,7); sp(E_TRIGGER,26,10,AB_FIRE,0,0); sp(E_SHRINE,8,16,0,0,0);
  sp(E_FORGEBOT,32,16,0,0,0);
  exitr(18,0,12,2,7,41,15,-1); exitr(20,42,12,2,7,1,15,1);
  end(-1,MUS_EMBER,0,0);

/* ================= FROSTSPIRE ================= */
begin(20,"Glacial Approach",Z_FROST,10,1); size(44,22); box();
  sp(E_SHRINE,5,16,0,0,0); sp(E_NPC,10,16,2,0,0);
  sp(E_FROSTLING,25,16,0,0,0); sp(E_WISP,32,10,0,0,0);
  exitr(19,0,12,2,7,41,15,-1); exitr(21,42,12,2,7,1,15,1);
  end(-1,MUS_FROST,0,6);
begin(21,"Choir Sanctum",Z_FROST,11,2); size(44,22); box();
  sp(E_SHRINE,3,16,0,0,0);
  exitr(20,0,12,2,7,41,15,-1); exitr(22,42,12,2,7,1,15,1);
  end(B_CHOIR,MUS_BOSS,0,6);
begin(22,"Spire Summit",Z_FROST,12,1); size(44,22); box();
  sol(20,12,2,7); sp(E_TRIGGER,30,8,AB_GLIDE,0,0); sp(E_SHRINE,8,16,0,0,0);
  sp(E_YETI,36,15,0,0,0); sp(E_ICICLE,16,6,0,0,0);
  exitr(21,0,12,2,7,41,15,-1); exitr(23,42,12,2,7,1,15,1);
  end(-1,MUS_FROST,0,6);

/* ================= CLOUDREACH AVIARY ================= */
begin(23,"Cloudreach Landing",Z_SKY,13,0); size(44,22); box();
  sp(E_SHRINE,5,16,0,0,0); sp(E_NPC,10,16,3,0,0);
  sp(E_CROWLING,25,14,0,0,0); sp(E_HARPY,32,10,0,0,0);
  exitr(22,0,12,2,7,41,15,-1); exitr(24,42,12,2,7,1,15,1);
  end(-1,MUS_SKY,0,0);
begin(24,"Stormcrow Aerie",Z_SKY,13,1); size(44,22); box();
  sp(E_SHRINE,3,16,0,0,0);
  exitr(23,0,12,2,7,41,15,-1); exitr(25,42,12,2,7,1,15,1);
  end(B_STORMCROW,MUS_BOSS,0,0);
begin(25,"Windsong Altar",Z_SKY,14,0); size(44,22); box();
  sol(20,10,2,9); sp(E_TRIGGER,28,6,AB_AIRDASH,0,0); sp(E_SHRINE,8,16,0,0,0);
  sp(E_SENTINEL,36,14,0,0,0); sp(E_GUST,16,8,0,0,0);
  exitr(24,0,12,2,7,41,15,-1); exitr(26,42,12,2,7,1,15,1);
  end(-1,MUS_SKY,0,0);

/* ================= METRODIVINIA CORE ================= */
begin(26,"The Divine Stair",Z_CORE,14,1); size(44,22); box();
  sp(E_VOIDLING,20,15,0,0,0); sp(E_ACOLYTE,30,14,0,0,0);
  sp(E_PICKUP,25,12,0,0,0);
  exitr(25,0,12,2,7,41,15,-1); exitr(27,42,12,2,7,1,15,1);
  end(-1,MUS_CORE,0,0);
begin(27,"Heart of Metrodivinia",Z_CORE,15,1); size(44,22); box();
  sp(E_REVENANT,22,14,0,0,0); sp(E_VOIDLING,32,14,0,0,0);
  sp(E_SHRINE,5,16,0,0,0);
  exitr(26,0,12,2,7,41,15,-1); exitr(28,42,12,2,7,1,15,1);
  end(-1,MUS_CORE,0,0);
begin(28,"Throne of the Ninth",Z_CORE,15,2); size(44,22); box();
  sp(E_SHRINE,3,16,0,0,0);
  exitr(27,0,12,2,7,41,15,-1); exitr(29,20,0,4,3,21,20,0);
  end(B_METRODIVINIA,MUS_FINAL,0,0);
begin(29,"The Ninth Life",Z_CORE,15,0); size(44,22); box();
  sp(E_SHRINE,3,16,0,0,0);
  exitr(28,20,19,4,3,21,2,0);
  end(B_NINTHLIFE,MUS_SECRET,0,0);
}
