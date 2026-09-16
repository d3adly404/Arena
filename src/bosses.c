/* ============================================================================
   bosses.c -- boss fights
   ========================================================================== */
#include "game.h"
#include <math.h>

const char *BOSS_NAMES[B_COUNT]={
 "THORNMAW","MIRE LEVIATHAN","HIVE MOTHER KRRK","IGNIS, THE FURNACE CAT",
 "CHOIR OF FROST","STORMCROW ARCHON","THE METRODIVINIA","THE NINTH LIFE"
};

static void boss_size(int kind){
    Boss *b=&G->boss;
    switch(kind){
        case B_THORNMAW: b->w=40;b->h=36;break;
        case B_LEVIATHAN:b->w=34;b->h=28;break;
        case B_HIVEMOTHER:b->w=52;b->h=34;break;
        case B_IGNIS: b->w=26;b->h=30;break;
        case B_CHOIR: b->w=30;b->h=38;break;
        case B_STORMCROW:b->w=46;b->h=30;break;
        case B_METRODIVINIA:b->w=48;b->h=44;break;
        case B_NINTHLIFE:b->w=24;b->h=26;break;
        default:b->w=32;b->h=32;
    }
}
static int boss_maxhp(int kind){
    switch(kind){
        case B_THORNMAW:return 40; case B_LEVIATHAN:return 50; case B_HIVEMOTHER:return 55;
        case B_IGNIS:return 60; case B_CHOIR:return 60; case B_STORMCROW:return 70;
        case B_METRODIVINIA:return 100; case B_NINTHLIFE:return 80; default:return 40;
    }
}

void game_trigger_boss(int kind){
    if(G->boss.active||G->world.st[G->world.cur].cleared) return;
    Boss *b=&G->boss;
    memset(b,0,sizeof(*b));
    b->active=1; b->kind=kind;
    boss_size(kind);
    b->maxhp=boss_maxhp(kind); if(G->difficulty==1)b->maxhp*=1.3f;
    b->hp=b->maxhp;
    b->x=G->p.x+ (kind==B_IGNIS?120:0); b->y=G->p.y- (kind==B_IGNIS?0:140);
    if(b->y<40)b->y=40;
    snprintf(b->name,sizeof(b->name),"%s",BOSS_NAMES[kind]);
    b->intro=90;
    audio_music(MUS_BOSS);
    audio_sfx(SFX_BOSSROAR);
    game_shake(6);
}

int boss_active(void){ return G->boss.active && !G->boss.defeated; }

void boss_hurt(int dmg,float fromX,float fromY){
    Boss *b=&G->boss;
    if(!boss_active()||b->intro>0||b->invulnT>0) return;
    b->hp-=dmg; b->hurtT=6;
    G->bossBarT=180;
    audio_sfx(SFX_BOSSHIT);
    part_burst(b->x+b->w/2,b->y+b->h/2,5,(0xFF000000u|0xffffff),140,2,2);
    if(b->hp<=0){
        b->hp=0; b->defeated=1;
        audio_sfx(SFX_BOSSDIE);
        game_shake(10);
        part_burst(b->x+b->w/2,b->y+b->h/2,60,(0xFF000000u|0xffffff),240,2,3);
        part_ring(b->x+b->w/2,b->y+b->h/2,(0xFF000000u|0xffffff),20);
        G->world.st[G->world.cur].cleared=1;
        /* rewards */
        switch(b->kind){
            case B_THORNMAW: game_spawn(E_PICKUP,b->x,b->y)->param[0]=5; break;
            case B_LEVIATHAN: game_spawn(E_PICKUP,b->x,b->y)->param[0]=5; break;
            case B_HIVEMOTHER: game_spawn(E_PICKUP,b->x,b->y)->param[0]=4, game_spawn(E_PICKUP,b->x,b->y)->param[1]=CH_THORN; break;
            case B_IGNIS: game_spawn(E_PICKUP,b->x,b->y)->param[0]=5; break;
            case B_CHOIR: game_spawn(E_PICKUP,b->x,b->y)->param[0]=4, game_spawn(E_PICKUP,b->x,b->y)->param[1]=CH_IRON; break;
            case B_STORMCROW: game_spawn(E_PICKUP,b->x,b->y)->param[0]=5; break;
            case B_METRODIVINIA:
                game_set_flag(1,1);
                game_grant_ability(AB_DIVINE);
                break;
            case B_NINTHLIFE: game_spawn(E_PICKUP,b->x,b->y)->param[0]=4, game_spawn(E_PICKUP,b->x,b->y)->param[1]=CH_NINE; break;
        }
        b->active=0;
        audio_music(G->world.rooms[G->world.cur].music);
    }
}

void boss_start(int kind,float x,float y){ game_trigger_boss(kind); G->boss.x=x;G->boss.y=y; }

static void bproj(float x,float y,float vx,float vy,int dmg,int kind){
    proj_spawn(x,y,vx,vy,dmg,0,kind);
}
static void radial(int kind,int n,float spd,int dmg){
    Boss *b=&G->boss;
    for(int i=0;i<n;i++){
        float a=(float)i/n*6.28318f + b->t;
        bproj(b->x+b->w/2,b->y+b->h/2,cosf(a)*spd,sinf(a)*spd,dmg,kind);
    }
}
static void aim(float spd,int kind,int dmg){
    Boss *b=&G->boss;
    float dx=(G->p.x)-(b->x),dy=(G->p.y)-(b->y); float d=sqrtf(dx*dx+dy*dy); if(d<1)d=1;
    bproj(b->x+b->w/2,b->y+b->h/2,dx/d*spd,dy/d*spd,dmg,kind);
}
static void contact_boss(void){
    Boss *b=&G->boss; Player *p=&G->p;
    if(b->intro>0) return;
    if(p->invulnT<=0&&p->deadT<=0&&faabb(b->x,b->y,b->w,b->h,p->x,p->y,p->w,p->h))
        player_hurt(2,p->x);
}

void boss_update(void){
    Boss *b=&G->boss;
    if(!b->active) return;
    float dt=DT;
    b->t+=dt; b->stateT+=dt;
    if(b->hurtT>0)b->hurtT--;
    if(b->invulnT>0)b->invulnT--;
    if(b->intro>0){ b->intro--; return; }
    int phase = b->hp < b->maxhp*0.5 ? 1:0;
    if(phase!=b->phase){ b->phase=phase; audio_sfx(SFX_ROAR2); game_shake(6); radial(b->kind==B_CHOIR?2:4,10,120,1); }
    float spd = phase?1.35f:1.0f;

    switch(b->kind){
        case B_THORNMAW:
            b->y=md_approach(b->y,60+sinf(b->t*2)*20,60*dt);
            b->x=md_approach(b->x,G->p.x-b->w/2,80*spd*dt);
            if(b->stateT>(phase?1.2f:1.8f)){ b->stateT=0;
                for(int i=-2;i<=2;i++) bproj(b->x+b->w/2,b->y+b->h,i*60,140,1,3);
                audio_sfx(SFX_FIRE);
            }
            contact_boss(); break;
        case B_LEVIATHAN:
            b->y=md_approach(b->y,G->p.y-10,120*spd*dt);
            b->x=md_approach(b->x,G->p.x-b->w/2,150*spd*dt);
            if(b->stateT>(phase?1.0f:1.6f)){ b->stateT=0; radial(2,8,140,1); }
            contact_boss(); break;
        case B_HIVEMOTHER:
            b->x=G->world.rooms[G->world.cur].w*TILE/2-b->w/2 + cosf(b->t)*80;
            b->y=60+sinf(b->t*2)*20;
            if(b->stateT>(phase?1.0f:1.6f)){ b->stateT=0;
                if(md_randint(0,1)) game_spawn(E_LARVA,b->x+b->w/2,b->y+b->h);
                else radial(3,10,120,1);
            }
            contact_boss(); break;
        case B_IGNIS:
            if(b->state==0){ /* approach */
                b->x=md_approach(b->x,G->p.x-60,(b->dir>0?1:-1)*100*spd*dt* (G->p.x>b->x?1:-1));
                if(b->stateT>1.2f){b->stateT=0;b->state=1;b->param[0]=3;}
            } else if(b->state==1){ /* dash slash */
                b->x+=b->dir*300*spd*dt;
                if(b->stateT>0.4f){ b->stateT=0; b->param[0]--; b->dir=(G->p.x>b->x)?1:-1;
                    if(b->param[0]<=0)b->state=0; }
            }
            if(b->stateT>0 && b->state==1) part_spawn(b->x+b->w/2,b->y+b->h,0,0,0.3f,RGB(0xff,0xa2,0x3a),3,2);
            if(phase && b->param[1]++>140){ b->param[1]=0; for(int i=-3;i<=3;i++)bproj(b->x+b->w/2,b->y+b->h/2,i*70,-100,1,1); }
            contact_boss(); break;
        case B_CHOIR:
            b->y=60+sinf(b->t*1.5)*30;
            b->x=md_approach(b->x,G->p.x-b->w/2,60*spd*dt);
            if(b->stateT>(phase?0.9f:1.4f)){ b->stateT=0; radial(2,phase?14:10,150,1); audio_sfx(SFX_ICE);}
            contact_boss(); break;
        case B_STORMCROW:
            if(b->state==0){ b->y=md_approach(b->y,50,100*dt); b->x=md_approach(b->x,G->p.x-b->w/2,160*spd*dt);
                if(b->stateT>1.4f){b->stateT=0;b->state=1;} }
            else { b->y+=420*dt; b->x+= (G->p.x>b->x?1:-1)*100*dt; if(b->y>G->p.y+40){b->state=0;b->y=50;} }
            if(b->stateT>0&&b->state==1) part_spawn(b->x+b->w/2,b->y,0,-40,0.3f,(0xFF000000u|0xffffff),3,5);
            if(phase&&b->param[0]++>160){b->param[0]=0; for(int i=-2;i<=2;i++)bproj(b->x+b->w/2,b->y+b->h,i*80,160,1,5);}
            contact_boss(); break;
        case B_METRODIVINIA:
            b->y=70+sinf(b->t)*30;
            b->x=G->world.rooms[G->world.cur].w*TILE/2-b->w/2+cosf(b->t*0.7f)*120;
            if(b->stateT>(phase?0.8f:1.2f)){
                b->stateT=0; b->state=(b->state+1)%3;
                if(b->state==0) radial(4,phase?18:12,150,1);
                else if(b->state==1){ for(int i=0;i<3;i++)aim(200+i*40,4,2); }
                else game_spawn(E_VOIDLING,b->x+md_randrange(-40,40),b->y+60);
            }
            contact_boss(); break;
        case B_NINTHLIFE:
            b->x=md_approach(b->x,G->p.x-b->w/2,220*spd*dt);
            b->y=md_approach(b->y,G->p.y-b->h/2,180*spd*dt);
            if(b->stateT>1.0f){ b->stateT=0; radial(4,8,160,1); }
            contact_boss(); break;
    }
}

void boss_render(void){
    Boss *b=&G->boss;
    if(!b->active) return;
    int ox=(int)G->camX, oy=(int)G->camY;
    int x=(int)b->x-ox, y=(int)b->y-oy;
    const char *spr=NULL;
    switch(b->kind){
        case B_THORNMAW: spr="boss_thorn_head";break;
        case B_LEVIATHAN:spr="boss_levi_head";break;
        case B_HIVEMOTHER:spr="boss_hive_body";break;
        case B_IGNIS: spr="boss_ignis";break;
        case B_CHOIR: spr="boss_choir";break;
        case B_STORMCROW:spr="boss_crow";break;
        case B_METRODIVINIA:spr="boss_god";break;
        case B_NINTHLIFE:spr="boss_god";break;
    }
    Sprite *s=art(spr);
    uint32_t tint=b->hurtT>0?RGB(0xff,0x90,0x90):RGB(0xff,0xff,0xff);
    int mode=b->hurtT>0?TINT_ADD:TINT_MUL;
    if(b->kind==B_NINTHLIFE) mode=TINT_SILHOUETTE, tint=RGB(0xd1,0x9b,0xff);
    if(b->intro>0){
        float a=1.0f-b->intro/90.0f;
        gfx_sprite_ex(g_screen,VIEW_W,VIEW_H,s,x,y,0,0,tint,mode,a);
    } else {
        float bob=sinf(b->t*3)*2;
        gfx_sprite_ex(g_screen,VIEW_W,VIEW_H,s,x,(int)(y+bob),0,0,tint,mode,1.0f);
        /* eye glow */
        gfx_circle_blend(g_screen,VIEW_W,VIEW_H,x+b->w/2,y+b->h/3,3+ (int)(sinf(b->t*6)*1),RGBA(0xff,0xff,0xff,120));
    }
}
