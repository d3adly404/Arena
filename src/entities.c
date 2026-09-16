/* ============================================================================
   entities.c -- enemies, NPCs, pickups, interactive objects
   ========================================================================== */
#include "game.h"
#include <math.h>

static void npc_dialog(Entity *e);
const char **lore_text(int id);
static void collect_pickup(Entity *e);

typedef struct { const char *a,*b; int w,h; int hp; int dmg; int flags; } EntDef;
static const EntDef DEFS[E_TYPE_COUNT] = {
    [E_SLIME]      = {"slime0","slime1",14,10,3,1,EF_HOSTILE},
    [E_BAT]        = {"bat0","bat1",16,10,2,1,EF_HOSTILE|EF_FLY|EF_NOGRAV},
    [E_THORNLING]  = {"thorn0","thorn1",14,16,4,1,EF_HOSTILE},
    [E_SHROOM]     = {"shroom0","shroom1",14,14,3,1,EF_HOSTILE},
    [E_MUDLURK]    = {"mud0","mud1",18,12,5,1,EF_HOSTILE},
    [E_JELLY]      = {"jelly0","jelly1",14,16,3,1,EF_HOSTILE|EF_FLY|EF_NOGRAV},
    [E_ANGLER]     = {"angler0","angler1",20,12,4,1,EF_HOSTILE|EF_NOGRAV},
    [E_DRIP]       = {"jelly0","jelly1",12,12,2,1,EF_HOSTILE},
    [E_LARVA]      = {"larva0","larva1",12,8,2,1,EF_HOSTILE},
    [E_BEETLE]     = {"beetle0","beetle1",16,12,4,1,EF_HOSTILE},
    [E_SPITTER]    = {"spitter0","spitter1",16,16,4,1,EF_HOSTILE},
    [E_SWARM]      = {"wisp0","wisp1",10,10,1,1,EF_HOSTILE|EF_FLY|EF_NOGRAV},
    [E_EMBERLING]  = {"ember0","ember1",12,14,3,1,EF_HOSTILE},
    [E_FORGEBOT]   = {"forge0","forge1",16,18,6,1,EF_HOSTILE},
    [E_MAGMITE]    = {"magmite0","magmite1",14,10,3,1,EF_HOSTILE},
    [E_TURRET]     = {"forge0","forge1",16,16,5,1,EF_HOSTILE},
    [E_FROSTLING]  = {"frost0","frost1",12,14,3,1,EF_HOSTILE},
    [E_WISP]       = {"wisp0","wisp1",10,10,2,1,EF_HOSTILE|EF_FLY|EF_NOGRAV},
    [E_YETI]       = {"senti0","senti0",18,22,8,2,EF_HOSTILE},
    [E_ICICLE]     = {"wisp0","wisp0",8,14,1,1,EF_HOSTILE},
    [E_CROWLING]   = {"crow0","crow1",16,12,3,1,EF_HOSTILE|EF_FLY},
    [E_HARPY]      = {"harpy0","harpy1",18,16,4,1,EF_HOSTILE|EF_FLY|EF_NOGRAV},
    [E_GUST]       = {NULL,NULL,16,16,0,0,0},
    [E_SENTINEL]   = {"senti0","senti0",18,22,7,2,EF_HOSTILE|EF_FLY|EF_NOGRAV},
    [E_VOIDLING]   = {"void0","void1",12,14,4,1,EF_HOSTILE|EF_NOGRAV},
    [E_ACOLYTE]    = {"acolyte0","acolyte1",14,20,5,1,EF_HOSTILE},
    [E_REVENANT]   = {"revenant0","revenant0",16,22,6,2,EF_HOSTILE|EF_NOGRAV},
    [E_NPC]        = {"npc_old","npc_old",14,20,999,0,0},
    [E_SHOPKEEP]   = {"npc_moth","npc_moth",14,20,999,0,0},
    [E_LORE]       = {"ico_lore","ico_lore",12,12,999,0,0},
    [E_CHEST]      = {"chest_closed","chest_open",16,12,999,0,0},
    [E_SHRINE]     = {"shrine","shrine",18,24,999,0,0},
    [E_SIGN]       = {NULL,NULL,16,16,999,0,0},
    [E_PICKUP]     = {NULL,NULL,10,10,999,0,0},
    [E_TRIGGER]    = {NULL,NULL,16,24,999,0,0},
};

void ent_init(Entity *e,int type,float x,float y){
    memset(e,0,sizeof(*e));
    e->alive=1; e->type=type; e->x=x; e->y=y;
    const EntDef *d=&DEFS[type< E_TYPE_COUNT? type:0];
    e->w=d->w; e->h=d->h; e->hp=d->hp; e->maxhp=d->hp; e->damage=d->dmg; e->flags=d->flags;
    e->dir=md_randint(0,1)?1:-1;
    e->homeX=x; e->homeY=y; e->boss=-1;
    e->facing=e->dir;
    if(type==E_SHRINE){ e->y=y-6; }
}

Entity *game_spawn(int type,float x,float y){
    for(int i=0;i<MAX_ENTITIES;i++){
        if(!G->ents[i].alive){
            Entity *e=&G->ents[i];
            ent_init(e,type,x,y);
            e->id=i;
            if(i>=G->nEnts) G->nEnts=i+1;
            return e;
        }
    }
    return NULL;
}
void game_kill_entity(Entity *e){ e->alive=0; e->dead=1; }
Entity *game_find_entity(int id){ if(id<0||id>=MAX_ENTITIES) return NULL; return &G->ents[id]; }

Entity *ent_nearest_hostile(float x,float y,float maxd){
    Entity *best=NULL; float bd=maxd;
    for(int i=0;i<G->nEnts;i++){
        Entity *e=&G->ents[i];
        if(!e->alive||!(e->flags&EF_HOSTILE)) continue;
        float dx=e->x-x,dy=e->y-y; float d=sqrtf(dx*dx+dy*dy);
        if(d<bd){bd=d;best=e;}
    }
    return best;
}

void ent_spawn_particles(Entity *e,int n,uint32_t c){
    part_burst(e->x+e->w/2,e->y+e->h/2,n,c,120,0,2);
}

void ent_hurt(Entity *e,int dmg,float fromX,float fromY){
    if(!e->alive||e->invulnT>0) return;
    e->hp-=dmg; e->hurtT=8; e->invulnT=6;
    e->vx+=(e->x+e->w/2<fromX?60:-60);
    audio_sfx(SFX_HIT);
    part_burst(e->x+e->w/2,e->y+e->h/2,6,(0xFF000000u|0xffffff),120,2,2);
    if(e->hp<=0){
        game_kill_entity(e);
        G->p.kills++;
        audio_sfx(SFX_EXPLODE);
        ent_spawn_particles(e,16,(0xFF000000u|0xffffff));
        /* drops */
        int r=md_randint(0,100);
        if(r<40) game_spawn(E_PICKUP,e->x,e->y)->param[0]=0;
        else if(r<46) game_spawn(E_PICKUP,e->x,e->y)->param[0]=2;
        part_ring(e->x+e->w/2,e->y+e->h/2,(0xFF000000u|0xffffff),6);
    }
}

static void gravity_move(Entity *e,float speed){
    e->vy+=1450*DT; if(e->vy>470)e->vy=470;
    int hit=0;
    world_move_x(&e->x,&e->y,e->w,e->h,&e->vx,e->vy,&hit);
    if(hit) e->dir=-e->dir;
    world_move_y(&e->x,&e->y,e->w,e->h,e->vx,&e->vy,&hit);
    e->onground=hit&&e->vy>=0;
}

static void face_player(Entity *e){
    e->dir=(G->p.x+G->p.w/2 > e->x+e->w/2)?1:-1;
}
static float dist_player(Entity *e){
    float dx=G->p.x-e->x,dy=G->p.y-e->y; return sqrtf(dx*dx+dy*dy);
}
static void shoot_at(Entity *e,float spd,int kind,int dmg){
    float dx=(G->p.x+G->p.w/2)-(e->x+e->w/2), dy=(G->p.y+G->p.h/2)-(e->y+e->h/2);
    float d=sqrtf(dx*dx+dy*dy); if(d<1)d=1;
    proj_spawn(e->x+e->w/2,e->y+e->h/2,dx/d*spd,dy/d*spd,dmg,0,kind);
}

static void walker(Entity *e,float speed,int chase){
    float d=dist_player(e);
    if(chase && d<140){ face_player(e); e->vx=md_approach(e->vx,e->dir*speed*1.4f,800*DT); }
    else { e->vx=md_approach(e->vx,e->dir*speed,600*DT); }
    gravity_move(e,speed);
    /* turn at ledges */
    if(e->onground){
        int aheadx=(int)((e->dir>0? e->x+e->w+2 : e->x-2));
        if(!world_solid_at(aheadx,e->y+e->h+4) && !chase) e->dir=-e->dir;
    }
}

static void contact(Entity *e){
    Player *p=&G->p;
    if(!(e->flags&EF_HOSTILE)) return;
    if(p->invulnT<=0&&p->deadT<=0&&faabb(e->x,e->y,e->w,e->h,p->x,p->y,p->w,p->h)){
        player_hurt(e->damage,p->x);
    }
}

void ent_update_all(void){
    for(int i=0;i<G->nEnts;i++){
        Entity *e=&G->ents[i];
        if(!e->alive) continue;
        e->t+=DT; e->animT+=DT;
        if(e->hurtT>0)e->hurtT--;
        if(e->invulnT>0)e->invulnT--;
        e->frame=(int)(e->animT*8)%2;
        float d=dist_player(e);
        switch(e->type){
            case E_SLIME:
                if(e->onground){ e->stateT+=DT; if(e->stateT>1.2f){e->stateT=0; e->vy=-260; e->dir=(G->p.x>e->x)?1:-1; e->vx=e->dir*80;} else e->vx=0;}
                gravity_move(e,60); contact(e); break;
            case E_BAT: case E_WISP: case E_SWARM:
                e->y=e->homeY+sinf(e->t*3)*14;
                if(d<160){ face_player(e); e->x+=e->dir*70*DT; }
                else e->x=e->homeX+cosf(e->t*2)*20;
                contact(e); break;
            case E_THORNLING:
                if(e->cooldown>0)e->cooldown--;
                else if(d<180){ e->cooldown=90; shoot_at(e,160,3,1); audio_sfx(SFX_FIRE);}
                contact(e); break;
            case E_SHROOM: walker(e,40,0); contact(e); break;
            case E_MUDLURK:
                if(d<150){face_player(e); e->vx=md_approach(e->vx,e->dir*60,400*DT);} else e->vx=md_approach(e->vx,0,400*DT);
                e->vy=md_approach(e->vy,(G->p.y>e->y?40:-40),200*DT);
                e->x+=e->vx*DT; e->y+=e->vy*DT; contact(e); break;
            case E_JELLY:
                e->y=e->homeY+sinf(e->t*2)*20;
                if(e->cooldown>0)e->cooldown--; else if(d<140){e->cooldown=120; proj_spawn(e->x+e->w/2,e->y+e->h,0,120,1,0,2);}
                contact(e); break;
            case E_ANGLER:
                e->x=e->homeX+cosf(e->t*1.5)*40;
                if(d<120){face_player(e); e->y=md_approach(e->y,G->p.y,80*DT);}
                contact(e); break;
            case E_DRIP:
                if(e->state==0){ if(fabsf(G->p.x-e->x)<10){e->state=1;} }
                else { e->vy+=800*DT; e->y+=e->vy*DT; if(world_solid_at(e->x+e->w/2,e->y+e->h)){e->state=0;e->y=e->homeY;e->vy=0;} }
                contact(e); break;
            case E_LARVA: walker(e,30,0); contact(e); break;
            case E_BEETLE:
                if(d<120){face_player(e); e->vx=md_approach(e->vx,e->dir*140,900*DT);} else walker(e,40,0);
                if(e->vx!=0||d>=120) gravity_move(e,40); else gravity_move(e,140);
                contact(e); break;
            case E_SPITTER:
                if(e->cooldown>0)e->cooldown--; else if(d<200){e->cooldown=110; float dx=G->p.x-e->x; proj_spawn(e->x+e->w/2,e->y,dx>0?140:-140,-180,1,0,3)->gravity=1;}
                contact(e); break;
            case E_EMBERLING:
                if(e->onground){e->stateT+=DT; if(e->stateT>1.0f){e->stateT=0;e->vy=-300;e->dir=(G->p.x>e->x)?1:-1;e->vx=e->dir*100; if(md_randint(0,1))proj_spawn(e->x+e->w/2,e->y,e->dir*120,-60,1,0,1);}}
                gravity_move(e,60); contact(e); break;
            case E_FORGEBOT: case E_TURRET:
                if(e->cooldown>0)e->cooldown--; else if(d<220){e->cooldown=100; shoot_at(e,180,5,1); audio_sfx(SFX_FIRE);}
                if(e->type==E_FORGEBOT) walker(e,30,0);
                contact(e); break;
            case E_MAGMITE:
                e->stateT+=DT; if(e->stateT>1.6f){e->stateT=0; e->vy=-320; e->dir=(G->p.x>e->x)?1:-1; e->vx=e->dir*120;}
                gravity_move(e,60); contact(e); break;
            case E_FROSTLING:
                if(e->cooldown>0)e->cooldown--; else if(d<180){e->cooldown=100; shoot_at(e,160,2,1);}
                walker(e,40,0); contact(e); break;
            case E_YETI:
                walker(e,30,1);
                if(e->onground&&d<60&&e->cooldown<=0){e->cooldown=80; game_shake(4); part_burst(e->x+e->w/2,e->y+e->h,10,RGB(0xd1,0xec,0xff),120,0,2); if(d<70)player_hurt(2,e->x);}
                contact(e); break;
            case E_ICICLE:
                if(e->state==0){ if(fabsf(G->p.x-e->x)<8)e->state=1; }
                else { e->vy+=900*DT; e->y+=e->vy*DT; if(world_solid_at(e->x,e->y+e->h)){part_burst(e->x,e->y,6,RGB(0x9b,0xd1,0xf5),80,7,2); e->alive=0;} }
                contact(e); break;
            case E_CROWLING:
                e->y=e->homeY+fabsf(sinf(e->t*4))*-14;
                if(d<150){face_player(e); e->x+=e->dir*90*DT;}
                contact(e); break;
            case E_HARPY:
                if(d<200){face_player(e); e->x+=e->dir*100*DT; e->y=md_approach(e->y,G->p.y-10,100*DT);}
                else e->y=e->homeY+sinf(e->t*2)*10;
                contact(e); break;
            case E_GUST:
                if(d<60){ G->p.vx+=(e->dir>0?300:-300)*DT*4; part_spawn(e->x,e->y+md_randrange(0,16),e->dir*120,0,0.3f,(0xFF000000u|0xffffff),3,2); }
                break;
            case E_SENTINEL:
                e->y=e->homeY+sinf(e->t*2)*16;
                if(e->cooldown>0)e->cooldown--; else if(d<240){e->cooldown=140; shoot_at(e,220,4,2);}
                contact(e); break;
            case E_VOIDLING:
                e->stateT+=DT;
                if(e->stateT>1.5f){ e->stateT=0; part_burst(e->x,e->y,8,RGB(0xd1,0x9b,0xff),80,3,2);
                    float a=md_randrange(0,6.28f); e->x=CLAMP(e->x+cosf(a)*70,e->homeX-100,e->homeX+100); e->y=CLAMP(e->y+sinf(a)*50,e->homeY-60,e->homeY+60);
                    part_burst(e->x,e->y,8,RGB(0xd1,0x9b,0xff),80,3,2);}
                contact(e); break;
            case E_ACOLYTE:
                if(e->cooldown>0)e->cooldown--; else if(d<220){e->cooldown=130; for(int k=-1;k<=1;k++)proj_spawn(e->x+e->w/2,e->y, k*60, -140,1,0,4)->gravity=1;}
                contact(e); break;
            case E_REVENANT:
                face_player(e); e->x+=e->dir*70*DT; e->y=md_approach(e->y,G->p.y,60*DT);
                contact(e); break;

            case E_NPC: case E_SHOPKEEP:
                if(d<26 && (G->in.pressed&(1<<BTN_CONFIRM))){
                    if(e->type==E_SHOPKEEP){ G->state=ST_SHOP; G->shopId=e->param[0]; G->shopSel=0; audio_sfx(SFX_SELECT);}
                    else npc_dialog(e);
                }
                break;
            case E_SIGN:
                if(d<26 && (G->in.pressed&(1<<BTN_CONFIRM))){
                    const char *L[2]={e->text[0]?e->text:"...", " "};
                    game_open_dialog("",-1,L,1);
                }
                break;
            case E_LORE:
                if(d<26 && (G->in.pressed&(1<<BTN_CONFIRM))){
                    int id=e->param[0];
                    if(!G->p.lore[id]){ G->p.lore[id]=1; G->p.nLore++; }
                    game_open_dialog("Ancient Tablet",4,lore_text(id),3);
                    audio_sfx(SFX_PICKUP);
                    e->alive=0;
                }
                break;
            case E_CHEST:
                if(d<28 && (G->in.pressed&(1<<BTN_CONFIRM)) && e->state==0){
                    e->state=1; audio_sfx(SFX_CHEST);
                    part_burst(e->x+e->w/2,e->y,10,RGB(0xf0,0xbd,0x55),100,1,2);
                    int kind=e->param[0];
                    game_spawn(E_PICKUP,e->x+2,e->y-8)->param[0]=kind?kind:0;
                    if(e->param[1]) game_spawn(E_PICKUP,e->x+8,e->y-8)->param[0]=e->param[1];
                }
                break;
            case E_SHRINE:
                if(d<30 && (G->in.pressed&(1<<BTN_CONFIRM))){
                    game_do_save_shrine();
                }
                break;
            case E_TRIGGER:
                if(d<30 && e->state==0){
                    e->state=1;
                    game_grant_ability(e->param[0]);
                }
                break;
            case E_PICKUP: {
                if(d<40){ /* magnet */
                    float dx=(G->p.x)-(e->x),dy=(G->p.y)-(e->y); float dd=sqrtf(dx*dx+dy*dy); if(dd>1){e->x+=dx/dd*140*DT; e->y+=dy/dd*140*DT;}
                } else { e->vy+=400*DT; e->y+=e->vy*DT; if(world_solid_at(e->x,e->y+e->h))e->vy=0; }
                if(faabb(e->x,e->y,e->w,e->h,G->p.x,G->p.y,G->p.w,G->p.h)) collect_pickup(e);
                break;
            }
        }
    }
}

/* ---- pickups & lore & npc dialogue ---- */
void collect_pickup(Entity *e){
    Player *p=&G->p;
    switch(e->param[0]){
        case 0: p->fish++; audio_sfx(SFX_COIN); part_text(e->x,e->y-8,"+1",RGB(0xf0,0xbd,0x55)); break;
        case 1:
            p->shards++; audio_sfx(SFX_PICKUP);
            if(p->shards>=4){ p->shards=0; p->maxhp++; p->hp=p->maxhp; game_msg("Max health increased!"); audio_sfx(SFX_1UP);}
            break;
        case 2:
            p->yarn++; audio_sfx(SFX_PICKUP);
            if(p->yarn>=3){ p->yarn=0; p->maxenergy++; p->energy=p->maxenergy; game_msg("Max energy increased!"); audio_sfx(SFX_1UP);}
            break;
        case 3: if(!p->lore[e->param[1]]){p->lore[e->param[1]]=1;p->nLore++;} audio_sfx(SFX_PICKUP); break;
        case 4: {
            int c=e->param[1];
            for(int i=0;i<CH_COUNT;i++) if(p->charms[i]==c){c=-1;break;}
            if(c>=0){ p->charms[c]=c; game_give_item(4,c,CHARM_NAMES[c],CHARM_DESCS[c]); }
            break;
        }
        case 5: p->maxhp++; p->hp=p->maxhp; game_msg("A new heart!"); audio_sfx(SFX_1UP); break;
        case 6: p->hp=p->maxhp; audio_sfx(SFX_HEAL); break;
    }
    e->alive=0;
}

static const char *LORE_TEXT[32][3]={
 {"In the beginning, the Great Cat","dreamt the world into being, and","every whisker became a river."},
 {"The Metrodivinia sleeps beneath","the spire, dreaming of nine lives","it has yet to live."},
 {"We buried our swords when the","frost came, but the cold remembers","every blade it has swallowed."},
 {"Ignis was once one of us, before","the furnace took his name and his","mercy."},
 {"The hive sings to its mother in","a language of clicking silk."},
 {"Do not trust the water that does","not ripple. It is only waiting."},
 {"A shrine is a promise: that no","fall is final while a flame burns."},
 {"The crows carry the storm on","their backs and call it a crown."},
 {"Nine lives, nine doors, nine keys.","We built seven. The last two are","made of courage."},
 {"The cartographer maps only what","he has survived. The blank spaces","are the truth."},
 {"When the divine cat opens its","eye, the world will blink, and we","with it."},
 {"Swift as the claw, quiet as the","paw, patient as the tail."},
};
const char **lore_text(int id){
    static const char *buf[3];
    id=CLAMP(id,0,11);
    buf[0]=LORE_TEXT[id][0]; buf[1]=LORE_TEXT[id][1]; buf[2]=LORE_TEXT[id][2];
    return buf;
}

void npc_dialog(Entity *e){
    switch(e->param[0]){
        case 0: {
            const char *L[4]={
              "Mira! You finally woke up.","The Metrodivinia stirs below.","Take this sword, and your wits.","Press ATTACK to swing. DASH to dash.",
            };
            game_open_dialog("Old Tom",0,L,4); break;
        }
        case 2: {
            const char *L[3]={
              "The frost sings tonight.","Bring me word of the Choir,","and I shall sing your praise.",
            };
            game_open_dialog("Sister Vesper",2,L,3); break;
        }
        case 3: {
            const char *L[3]={
              "I map only what I survive.","The blank spaces on my map?","Those are the honest parts.",
            };
            game_open_dialog("The Cartographer",3,L,3); break;
        }
        default: {
            const char *L[2]={"...","Meow."};
            game_open_dialog("?",e->param[0],L,2);
        }
    }
    audio_sfx(SFX_TALK);
}

/* ---- rendering ---- */
void ent_render_all(void){
    int ox=(int)G->camX, oy=(int)G->camY;
    for(int i=0;i<G->nEnts;i++){
        Entity *e=&G->ents[i];
        if(!e->alive) continue;
        int x=(int)e->x-ox, y=(int)e->y-oy;
        if(x<-64||x>VIEW_W+64||y<-64||y>VIEW_H+64) continue;
        const EntDef *d=&DEFS[e->type];
        Sprite *s=NULL;
        switch(e->type){
            case E_PICKUP:
                switch(e->param[0]){
                    case 0: s=art("ico_fish"); break;
                    case 1: s=art("ico_shard"); break;
                    case 2: s=art("ico_yarn"); break;
                    case 3: s=art("ico_lore"); break;
                    case 4: s=art("ico_charm"); break;
                    case 5: s=art("ico_heart"); break;
                    default:s=art("ico_fish");
                }
                y+=(int)(sinf(e->t*4)*2);
                break;
            case E_NPC: case E_SHOPKEEP:
                s=art(e->param[0]==1?"npc_moth":e->param[0]==2?"npc_vesper":e->param[0]==3?"npc_carto":"npc_old");
                break;
            case E_CHEST: s=art(e->state?"chest_open":"chest_closed"); break;
            case E_SHRINE: s=art("shrine"); break;
            case E_LORE: s=art("ico_lore"); y+=(int)(sinf(e->t*3)*2); break;
            case E_TRIGGER:
                gfx_circle_blend(g_screen,VIEW_W,VIEW_H,x+8,y+12,10+ (int)(sinf(e->t*4)*2),RGBA(0xd1,0x9b,0xff,120));
                gfx_sprite(g_screen,VIEW_W,VIEW_H,art("ico_charm"),x+2,y+4);
                continue;
            case E_SIGN:
                gfx_rect(g_screen,VIEW_W,VIEW_H,x+2,y+6,12,10,RGB(0x8a,0x5a,0x3c));
                gfx_rect(g_screen,VIEW_W,VIEW_H,x+7,y+14,2,6,RGB(0x5c,0x3a,0x26));
                gfx_frame(g_screen,VIEW_W,VIEW_H,x+2,y+6,12,10,RGB(0x5c,0x3a,0x26));
                continue;
            case E_GUST:
                for(int k=0;k<3;k++) gfx_hline(g_screen,VIEW_W,VIEW_H,x,y+4+k*4,10+((G->frame/4+k)%3)*3,((uint32_t)100<<24)|0xffffff);
                continue;
            case E_ICICLE:
                gfx_tri(g_screen,VIEW_W,VIEW_H,x,y,x+4,y+14,x+8,y,RGB(0x9b,0xd1,0xf5));
                continue;
            default:
                s=art(e->frame? d->b:d->a);
        }
        if(!s) continue;
        uint32_t tint = e->hurtT>0? RGB(0xff,0x80,0x80):RGB(0xff,0xff,0xff);
        int mode = e->hurtT>0? TINT_ADD:TINT_MUL;
        gfx_sprite_ex(g_screen,VIEW_W,VIEW_H,s,x,y,(e->dir<0),0,tint,mode,1.0f);
    }
}
