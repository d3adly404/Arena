/* ============================================================================
   game.c -- state machine, save/load, transitions, orchestration
   ========================================================================== */
#include "game.h"
#include <math.h>
#include <stdarg.h>

Game *G=NULL;

const char *ABILITY_NAMES[AB_COUNT]={"CLAW DASH","NINE-LIVES LEAP","WALLCLAWS","SUNFIRE FANG","FEATHERFALL","STORMSTEP","DIVINITY"};
const char *ABILITY_DESCS[AB_COUNT]={
 "Dash through danger with a burst of speed.",
 "Jump again in mid-air. A cat always lands.",
 "Slide and leap from walls.",
 "Your blade burns vines and shatters ice.",
 "Hold JUMP while falling to glide on your scarf.",
 "Dash again in mid-air.",
 "You are the Metrodivinia now."};
const char *CHARM_NAMES[CH_COUNT]={"SWIFT PAW","IRON FUR","THORN CLAW","VAMPIRE WHISKER","NINE RINGS","LUCKY FISH","ECHO CHARM","FURY HEART"};
const char *CHARM_DESCS[CH_COUNT]={
 "+18% move speed.","Take 1 less damage.","+1 attack damage.","Heal on kill.","+1 mid-air jump.","Better drops.","Special costs less energy.","Dash goes farther."};
const int CHARM_COST[CH_COUNT]={120,150,180,200,220,100,160,190};
const char *ZONE_NAMES[Z_COUNT]={"VERDANT HOLLOW","SUNKEN CISTERN","CHITTERING WARRENS","EMBERFOUNDRY","FROSTSPIRE","CLOUDREACH AVIARY","METRODIVINIA CORE"};

void game_init(void){
    if(!G) G=(Game*)md_calloc(sizeof(Game));
    memset(G,0,sizeof(Game));
    G->state=ST_TITLE;
    G->masterVol=80; G->musicVol=70; G->sfxVol=80;
    G->shakeOn=1; G->showFps=0;
    world_build_rooms();
    player_init();
}

void game_new(void){
    World w=G->world; int volm[3]={G->masterVol,G->musicVol,G->sfxVol};
    int shake=G->shakeOn, diff=G->difficulty;
    memset(G,0,sizeof(Game));
    G->masterVol=volm[0];G->musicVol=volm[1];G->sfxVol=volm[2];
    G->shakeOn=shake; G->difficulty=diff;
    G->world=w;
    for(int i=0;i<MAX_ROOMS;i++){G->world.st[i].discovered=0;G->world.st[i].visited=0;G->world.st[i].cleared=0;G->world.st[i].shrineUsed=0;}
    player_init();
    game_load_room(0, 4*TILE, 16*TILE, 1);
    G->state=ST_PLAY;
    G->firstLoad=1;
    audio_music(MUS_VERDANT);
    game_open_dialog("Old Tom",0,(const char*[]){"Mira! You're awake at last.","The Metrodivinia stirs below.","Take your sword. The world needs you.","(ARROWS/WASD move, Z jump, X attack, C dash)"},4);
}

void game_clear_entities(void){
    memset(G->ents,0,sizeof(G->ents));
    G->nEnts=0;
    proj_clear();
}

void game_spawn_room_entities(void){
    game_clear_entities();
    Room *r=&G->world.rooms[G->world.cur];
    for(int i=0;i<r->nSpawns;i++){
        int t=r->spawns[i].type;
        /* skip cleared uniques */
        if((t==E_LORE||t==E_CHEST||t==E_TRIGGER) && G->world.st[G->world.cur].cleared && t==E_TRIGGER) continue;
        Entity *e=game_spawn(t, r->spawns[i].tx*TILE, r->spawns[i].ty*TILE);
        if(e){ e->param[0]=r->spawns[i].p0; e->param[1]=r->spawns[i].p1; e->param[2]=r->spawns[i].p2; }
    }
    /* respawn enemies unless cleared */
}

void game_load_room(int idx,float px,float py,int dir){
    if(idx<0||idx>=G->world.nRooms) idx=0;
    G->world.cur=idx;
    G->world.st[idx].visited=1; G->world.st[idx].discovered=1;
    game_spawn_room_entities();
    Player *p=&G->p;
    p->x=px; p->y=py; p->dir=dir?dir:1;
    player_reset_state();
    p->lastSafeX=px; p->lastSafeY=py; p->lastSafeRoom=idx;
    G->camX=CLAMP(px-VIEW_W/2,0,G->world.rooms[idx].w*TILE-VIEW_W);
    G->camY=CLAMP(py-VIEW_H/2,0,G->world.rooms[idx].h*TILE-VIEW_H);
    G->roomTitleT=120;
    G->transImmune=30;
    /* discover neighbors */
    Room *r=&G->world.rooms[idx];
    for(int i=0;i<r->nExits;i++) G->world.st[r->exits[i].target].discovered=1;
    /* boss */
    if(r->boss>=0 && !G->world.st[idx].cleared){
        /* trigger when player near center handled in update */
    } else {
        if(G->boss.active) G->boss.active=0;
    }
    if(r->music>=0 && !G->boss.active) audio_music(r->music);
    part_clear();
}

void game_room_transition(int target,float tx,float ty,int dirVec){
    G->state=ST_TRANSITION;
    G->transT=0; G->transDir=1;
    G->transTarget=target; G->transX=tx; G->transY=ty; G->transDirVec=dirVec;
    audio_sfx(SFX_DOOR);
}

void game_msg(const char *fmt,...){
    char b[96]; va_list ap; va_start(ap,fmt); vsnprintf(b,sizeof(b),fmt,ap); va_end(ap);
    snprintf(G->msg,sizeof(G->msg),"%s",b);
    G->msgT=180;
}
void game_shake(float mag){ if(G->shakeOn) G->shakeMag=MAX(G->shakeMag,mag); }
void game_hitstop(int f){ G->hitstop=MAX(G->hitstop,f); }

int game_flag(int i){ return G->world.st[0].shrineUsed? (G->p.transform): ( (void)i,0); }
void game_set_flag(int i,int v){ (void)i; (void)v; if(i==1&&v) G->p.transform=1; }

void game_give_item(int kind,int val,const char *name,const char *desc){
    G->itemGetKind=kind; G->itemGetVal=val;
    snprintf(G->itemName,sizeof(G->itemName),"%s",name);
    snprintf(G->itemDesc,sizeof(G->itemDesc),"%s",desc);
    G->itemGetT=140;
    audio_sfx(SFX_PICKUP);
}
void game_grant_ability(int a){
    if(G->p.abilities[a]) return;
    G->p.abilities[a]=1;
    game_give_item(1,a,ABILITY_NAMES[a],ABILITY_DESCS[a]);
    audio_sfx(SFX_1UP);
    part_ring(G->p.x+G->p.w/2,G->p.y+G->p.h/2,RGB(0xd1,0x9b,0xff),12);
}

void game_open_dialog(const char *speaker,int portrait,const char **lines,int n){
    Dialogue *d=&G->dlg;
    memset(d,0,sizeof(*d));
    d->active=1; d->nLines=MIN(n,12);
    for(int i=0;i<d->nLines;i++) snprintf(d->lines[i],sizeof(d->lines[i]),"%s",lines[i]);
    snprintf(d->speaker,sizeof(d->speaker),"%s",speaker);
    d->portrait=portrait;
    G->prevState=G->state;
    G->state=ST_DIALOG;
}

void game_do_save_shrine(void){
    game_save();
    G->p.hp=G->p.maxhp; G->p.energy=G->p.maxenergy;
    G->world.st[G->world.cur].shrineUsed=1;
    G->p.lastSafeX=G->p.x; G->p.lastSafeY=G->p.y; G->p.lastSafeRoom=G->world.cur;
    game_msg("Rest at the shrine. Progress saved.");
    audio_sfx(SFX_SHRINE);
    part_ring(G->p.x+G->p.w/2,G->p.y,RGB(0x74,0xd6,0xc8),14);
}

/* ---------------- save / load ---------------- */
static uint32_t save_checksum(SaveData *s){
    uint32_t c=0; unsigned char *p=(unsigned char*)s;
    size_t n=offsetof(SaveData,checksum);
    for(size_t i=0;i<n;i++) c=c*31+p[i];
    return c;
}
void game_save(void){
    SaveData s; memset(&s,0,sizeof(s));
    s.magic=SAVE_MAGIC; s.version=1;
    s.room=G->world.cur; s.x=G->p.x; s.y=G->p.y;
    s.hp=G->p.hp; s.maxhp=G->p.maxhp; s.energy=G->p.energy; s.maxenergy=G->p.maxenergy; s.fish=G->p.fish;
    memcpy(s.abilities,G->p.abilities,sizeof(s.abilities));
    memcpy(s.charms,G->p.charms,sizeof(s.charms));
    memcpy(s.charmSlots,G->p.charmSlots,sizeof(s.charmSlots));
    s.swordLevel=G->p.swordLevel;
    s.shards=G->p.shards; s.yarn=G->p.yarn; s.heartsFound=G->p.heartsFound;
    memcpy(s.lore,G->p.lore,sizeof(s.lore)); s.nLore=G->p.nLore;
    s.kills=G->p.kills; s.deaths=G->deathCount; s.playtime=G->p.playtime;
    for(int i=0;i<G->world.nRooms;i++){
        s.roomVisited[i]=G->world.st[i].visited;
        s.roomCleared[i]=G->world.st[i].cleared;
        s.roomShrine[i]=G->world.st[i].shrineUsed;
    }
    s.checksum=save_checksum(&s);
    char path[256]; platform_save_path(path,sizeof(path),"metrodivinia.sav");
    platform_write_file(path,&s,sizeof(s));
    audio_sfx(SFX_SAVEWRITE);
}
int game_has_save(void){
    char path[256]; platform_save_path(path,sizeof(path),"metrodivinia.sav");
    SaveData s; int n=platform_read_file(path,&s,sizeof(s));
    return n>=(int)sizeof(s) && s.magic==SAVE_MAGIC;
}
int game_load_slot(int slot){
    (void)slot;
    char path[256]; platform_save_path(path,sizeof(path),"metrodivinia.sav");
    SaveData s; int n=platform_read_file(path,&s,sizeof(s));
    if(n<(int)sizeof(s)||s.magic!=SAVE_MAGIC||s.checksum!=save_checksum(&s)) return 0;
    world_build_rooms();
    player_init();
    G->p.hp=s.hp; G->p.maxhp=s.maxhp; G->p.energy=s.energy; G->p.maxenergy=s.maxenergy; G->p.fish=s.fish;
    memcpy(G->p.abilities,s.abilities,sizeof(s.abilities));
    memcpy(G->p.charms,s.charms,sizeof(s.charms));
    memcpy(G->p.charmSlots,s.charmSlots,sizeof(s.charmSlots));
    G->p.swordLevel=s.swordLevel;
    G->p.shards=s.shards; G->p.yarn=s.yarn; G->p.heartsFound=s.heartsFound;
    memcpy(G->p.lore,s.lore,sizeof(s.lore)); G->p.nLore=s.nLore;
    G->p.kills=s.kills; G->deathCount=s.deaths; G->p.playtime=s.playtime;
    for(int i=0;i<G->world.nRooms;i++){
        G->world.st[i].visited=s.roomVisited[i];
        G->world.st[i].cleared=s.roomCleared[i];
        G->world.st[i].shrineUsed=s.roomShrine[i];
    }
    game_load_room(s.room,s.x,s.y,1);
    G->state=ST_PLAY;
    return 1;
}

int game_completion(void){
    int visited=0; for(int i=0;i<G->world.nRooms;i++) if(G->world.st[i].visited) visited++;
    int bosses=0; for(int i=0;i<G->world.nRooms;i++) if(G->world.rooms[i].boss>=0&&G->world.st[i].cleared) bosses++;
    int tot=G->world.nRooms+ G->world.nRooms/2;
    int pct=(visited*70 + bosses*30* (G->world.nRooms? 1:1))/ (tot? tot:1);
    return CLAMP(pct,0,100);
}

/* ---------------- update ---------------- */
static void update_camera(void){
    Player *p=&G->p;
    Room *r=&G->world.rooms[G->world.cur];
    float tx=CLAMP(p->x+p->w/2-VIEW_W/2,0,MAX(0,r->w*TILE-VIEW_W));
    float ty=CLAMP(p->y+p->h/2-VIEW_H/2,0,MAX(0,r->h*TILE-VIEW_H));
    G->camX=md_approach(G->camX,tx,12);
    G->camY=md_approach(G->camY,ty,12);
    if(G->shakeMag>0){
        G->shakeX=md_randrange(-G->shakeMag,G->shakeMag);
        G->shakeY=md_randrange(-G->shakeMag,G->shakeMag);
        G->shakeMag=md_approach(G->shakeMag,0,0.6f);
    } else {G->shakeX=0;G->shakeY=0;}
}

void check_transitions(void){
    Player *p=&G->p;
    Room *r=&G->world.rooms[G->world.cur];
    for(int i=0;i<r->nExits;i++){
        RoomExit *e=&r->exits[i];
        int ax=e->area.x*TILE, ay=e->area.y*TILE, aw=e->area.w*TILE, ah=e->area.h*TILE;
        if(faabb(p->x,p->y,p->w,p->h,ax,ay,aw,ah)){
            Room *tr=&G->world.rooms[e->target];
            int stx = e->tx<0? (tr->w+e->tx) : e->tx;
            int sty = e->ty<0? (tr->h+e->ty) : e->ty;
            game_room_transition(e->target, stx*TILE, sty*TILE, e->dir);
            return;
        }
    }
}
static void maybe_boss(void){
    Room *r=&G->world.rooms[G->world.cur];
    if(r->boss>=0 && !G->world.st[G->world.cur].cleared && !G->boss.active){
        Player *p=&G->p;
        float cx=r->w*TILE/2;
        if(fabsf(p->x-cx)<r->w*TILE*0.3f) game_trigger_boss(r->boss);
    }
}

static void ambient_particles(void){
    Room *r=&G->world.rooms[G->world.cur];
    if(G->frame%6) return;
    if(r->rain==5){ /* leaves/fireflies */
        part_spawn(G->camX+md_randrange(0,VIEW_W),G->camY-4,md_randrange(-20,20),md_randrange(20,50),3,RGB(0x9b,0xe0,0x82),5,2);
    } else if(r->rain==6){ /* snow */
        part_spawn(G->camX+md_randrange(0,VIEW_W),G->camY-4,md_randrange(-10,10),md_randrange(30,60),4,RGB(0xd1,0xec,0xff),4,2);
    } else if(r->zone==Z_EMBER){
        part_spawn(G->camX+md_randrange(0,VIEW_W),G->camY+VIEW_H,0,-md_randrange(30,70),2,RGB(0xff,0xa2,0x3a),3,2);
    } else if(r->zone==Z_CISTERN){
        part_spawn(G->camX+md_randrange(0,VIEW_W),G->camY+VIEW_H,0,-md_randrange(10,30),3,RGB(0x74,0xc6,0xf0),1,2);
    }
}

void game_update(void){
    G->frame++;
    G->p.playtime+=DT;
    if(G->hitstop>0){ G->hitstop--; return; }
    if(G->msgT>0)G->msgT--;
    if(G->roomTitleT>0)G->roomTitleT--;
    if(G->bossBarT>0)G->bossBarT--;

    InputState *in=&G->in;

    switch(G->state){
        case ST_TITLE:
            G->titleT++;
            if(in->pressed&(1<<BTN_CONFIRM)){
                if(game_has_save()) G->state=ST_MENU;
                else game_new();
            }
            if(in->pressed&(1<<BTN_MAP)){ G->state=ST_OPTIONS; G->optSel=0; }
            break;
        case ST_MENU:
            ui_update_menu(); break;
        case ST_OPTIONS:
            ui_update_options(); break;
        case ST_PLAY: {
            player_update();
            ent_update_all();
            boss_update();
            proj_update();
            part_update();
            world_update_dynamic();
            check_transitions();
            maybe_boss();
            ambient_particles();
            update_camera();
            if(in->pressed&(1<<BTN_PAUSE)){ G->state=ST_PAUSE; G->menuSel=0; audio_sfx(SFX_MENU);}
            if(in->pressed&(1<<BTN_MAP)){ G->state=ST_MAP; audio_sfx(SFX_MENU);}
            break;
        }
        case ST_PAUSE: ui_update_pause(); break;
        case ST_MAP: ui_update_map(); break;
        case ST_DIALOG: ui_update_dialog(); break;
        case ST_SHOP: ui_update_shop(); break;
        case ST_LORE: ui_update_lore(); break;
        case ST_TRANSITION:
            G->transT++;
            if(G->transT>=30 && G->transDir==1){
                G->transDir=2;
                game_load_room(G->transTarget,G->transX,G->transY,G->transDirVec);
            }
            if(G->transT>=60){ G->state=ST_PLAY; }
            part_update();
            break;
        case ST_ITEMGET:
            G->itemGetT--;
            if(G->itemGetT<=0 || (in->pressed&(1<<BTN_CONFIRM))) G->state=ST_PLAY;
            break;
        case ST_GAMEOVER:
            if(in->pressed&(1<<BTN_CONFIRM)){ game_load_room(G->world.cur,G->p.lastSafeX,G->p.lastSafeY,G->p.dir); G->p.hp=G->p.maxhp; G->state=ST_PLAY; }
            break;
        case ST_ENDING:
            G->creditsT++;
            if(in->pressed&(1<<BTN_CONFIRM)){ G->state=ST_CREDITS; G->creditsT=0; }
            break;
        case ST_CREDITS:
            G->creditsT++;
            if(G->creditsT>60*20 || (in->pressed&(1<<BTN_CONFIRM))){ G->state=ST_TITLE; }
            break;
    }

    /* ending trigger */
    if(game_flag(1) && G->state==ST_PLAY && G->world.cur==28 && G->world.st[28].cleared){
        if(in->pressed&(1<<BTN_CONFIRM)){ G->state=ST_ENDING; G->creditsT=0; audio_music(MUS_ENDING);}
    }

    /* item get overlay pauses world */
    if(G->itemGetT>0 && G->state==ST_PLAY){ /* keep playing but show overlay */ }
}

/* ---------------- render ---------------- */
static void render_world(void){
    gfx_clear(RGB(0,0,0));
    world_render_back();
    int ox=(int)(G->camX+G->shakeX), oy=(int)(G->camY+G->shakeY);
    (void)ox;(void)oy;
    world_render_tiles();
    ent_render_all();
    boss_render();
    player_render();
    proj_render();
    part_render(g_screen,VIEW_W,VIEW_H,(int)G->camX,(int)G->camY);
    world_render_front();
    /* darkness */
    Room *r=&G->world.rooms[G->world.cur];
    if(r->dark>0){
        gfx_rect_blend(g_screen,VIEW_W,VIEW_H,0,0,VIEW_W,VIEW_H,RGBA(0,0,10,r->dark));
    }
}

void game_render(void){
    switch(G->state){
        case ST_TITLE: ui_render_title(); break;
        case ST_MENU: ui_render_title(); ui_render_menu(); break;
        case ST_OPTIONS: ui_render_title(); ui_render_options(); break;
        case ST_PLAY: render_world(); ui_render_hud(); ui_render_msg(); ui_render_bossbar();
            if(G->itemGetT>0){G->state=ST_ITEMGET;} break;
        case ST_ITEMGET: render_world(); ui_render_hud(); ui_render_itemget(); break;
        case ST_PAUSE: render_world(); ui_render_pause(); break;
        case ST_MAP: render_world(); ui_render_map(); break;
        case ST_DIALOG: render_world(); ui_render_hud(); ui_render_dialog(); break;
        case ST_SHOP: render_world(); ui_render_shop(); break;
        case ST_LORE: render_world(); ui_render_lore(); break;
        case ST_TRANSITION: {
            render_world();
            float t=G->transT<30? G->transT/30.0f : 1.0f-(G->transT-30)/30.0f;
            gfx_rect_blend(g_screen,VIEW_W,VIEW_H,0,0,VIEW_W,VIEW_H,RGBA(0,0,0,(int)(t*255)));
            break;
        }
        case ST_GAMEOVER: ui_render_title(); font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H/2,"YOU FADED AWAY",RGB(0xd9,0x4f,0x4f),RGB(0,0,0)); break;
        case ST_ENDING: ui_render_ending(); break;
        case ST_CREDITS: ui_render_credits(); break;
    }
}
