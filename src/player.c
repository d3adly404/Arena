/* ============================================================================
   player.c -- movement, combat, abilities
   ========================================================================== */
#include "game.h"
#include <math.h>

static float GRAV=1450, MAXFALL=470;
static float RUN=150, ACCEL=1900, AIRACC=1300, FRICT=2100;
static float JUMPV=352;

static float p_maxhp_bonus(void){ return 0; }

void player_init(void){
    Player *p=&G->p;
    memset(p,0,sizeof(*p));
    p->w=12; p->h=18;
    p->maxhp=5; p->hp=5; p->maxenergy=3; p->energy=3;
    p->dir=1;
    for(int i=0;i<3;i++) p->charmSlots[i]=CH_NONE;
    p->swordLevel=1;
}
void player_reset_state(void){
    Player *p=&G->p;
    p->vx=0; p->vy=0;
    p->dashT=0; p->attackT=0; p->specialT=0;
    p->invulnT=0; p->hurtT=0;
    p->gliding=0;
}

int game_player_has_ability(int a){ return G->p.abilities[a]; }

static int charm_active(int c){
    for(int i=0;i<3;i++) if(G->p.charmSlots[i]==c) return 1;
    return 0;
}

void player_apply_charms(void){
    /* recompute derived stats if needed */
}

static float run_speed(void){
    float s=RUN;
    if(charm_active(CH_SWIFT)) s*=1.18f;
    return s;
}

void player_hurt(int dmg,float fromX){
    Player *p=&G->p;
    if(p->invulnT>0||p->deadT>0) return;
    if(charm_active(CH_IRON)) dmg=MAX(1,dmg-1);
    p->hp-=dmg;
    p->hurtT=20; p->invulnT=70;
    p->vx=(p->x+p->w/2<fromX?-1:1)*180;
    p->vy=-220;
    game_shake(5);
    game_hitstop(4);
    audio_sfx(SFX_HURT);
    part_burst(p->x+p->w/2,p->y+p->h/2,14,RGB(0xff,0xff,0xff),140,2,2);
    part_burst(p->x+p->w/2,p->y+p->h/2,8,RGB(0xd9,0x4f,0x4f),100,0,2);
    if(p->hp<=0){
        p->hp=0; p->deadT=1;
        audio_sfx(SFX_DEATH);
        part_burst(p->x+p->w/2,p->y+p->h/2,30,(0xFF000000u|0xffffff),200,2,2);
    }
}
void player_heal(int amt){
    Player *p=&G->p;
    if(p->hp>=p->maxhp) return;
    p->hp=MIN(p->maxhp,p->hp+amt);
    audio_sfx(SFX_HEAL);
    part_burst(p->x+p->w/2,p->y+p->h/2,10,RGB(0x63,0xe0,0x8c),80,1,2);
}

/* returns attack hitbox if attacking */
int player_attack_box(float *x,float *y,float *w,float *h){
    Player *p=&G->p;
    if(p->attackT<=0) return 0;
    int prog= (p->attackKind==1||p->attackKind==2)? (14-p->attackT) : (12-p->attackT);
    if(prog<2) return 0;
    float dmg_r=26;
    switch(p->attackKind){
        case 3: /* up */
            *x=p->x+p->w/2-12; *y=p->y-26; *w=24; *h=28; return 1;
        case 4: /* down */
            *x=p->x+p->w/2-12; *y=p->y+p->h-4; *w=24; *h=26; return 1;
        default:
            *x=p->dir>0? p->x+p->w-2 : p->x-dmg_r+2;
            *y=p->y-6; *w=dmg_r; *h=p->h+10; return 1;
    }
}

static void do_attack(int kind){
    Player *p=&G->p;
    if(p->attackCd>0||p->deadT>0) return;
    p->attackKind=kind;
    p->attackT=(kind==0)?12:14;
    p->attackCd=(kind==0)?6:8;
    p->comboCount++; p->comboT=40;
    audio_sfx(SFX_SWING);
    if(kind==3) p->vy=MIN(p->vy,-120);
}

static void do_special(void){
    Player *p=&G->p;
    if(p->energy<=0||p->specialT>0) return;
    p->energy--;
    p->specialT=20;
    audio_sfx(SFX_SPECIAL);
    /* yarn blast: 3 projectiles in a spread, or fire if fire ability */
    int kind = p->abilities[AB_FIRE]?1:4;
    for(int i=-1;i<=1;i++){
        Projectile *pr=proj_spawn(p->x+p->w/2,p->y+p->h/2,p->dir*260,i*70-20,2,1,kind);
        if(pr) pr->pierce=1;
    }
    part_ring(p->x+p->w/2,p->y+p->h/2,RGB(0xd1,0x9b,0xff),10);
}

static void do_dash(void){
    Player *p=&G->p;
    if(!p->abilities[AB_DASH]) return;
    if(p->dashCd>0) return;
    float dx=G->in.ax, dy=G->in.ay;
    if(fabsf(dx)<0.1f&&fabsf(dy)<0.1f){ dx=p->dir; dy=0; }
    float len=sqrtf(dx*dx+dy*dy); if(len<0.01f){dx=p->dir;dy=0;len=1;}
    p->dashDirX=dx/len; p->dashDirY=dy/len;
    if(charm_active(CH_FURY)){ p->dashDirY=0; p->dashDirX=SIGN(p->dashDirX)||p->dir; }
    p->dashT=10; p->dashCd=22;
    p->invulnT=MAX(p->invulnT,12);
    p->vy=0; p->vx=0;
    audio_sfx(SFX_DASH);
    part_burst(p->x+p->w/2,p->y+p->h/2,8,RGB(0x74,0xc6,0xf0),80,3,3);
}

void player_update(void){
    Player *p=&G->p;
    float dt=DT;
    if(p->comboT>0)p->comboT--; else p->comboCount=0;
    if(p->invulnT>0)p->invulnT--;
    if(p->hurtT>0)p->hurtT--;
    if(p->attackCd>0)p->attackCd--;
    if(p->attackT>0)p->attackT--;
    if(p->specialT>0)p->specialT--;
    if(p->dashCd>0)p->dashCd--;

    if(p->deadT>0){
        p->deadT++;
        p->vy+=GRAV*dt*0.5f;
        p->y+=p->vy*dt;
        if(p->deadT>90){
            G->deathCount++;
            game_load_room(G->world.cur, p->lastSafeX, p->lastSafeY, p->dir);
            p->hp=p->maxhp; p->deadT=0;
        }
        return;
    }

    int onground=p->onground;

    /* horizontal intent */
    float ax=G->in.ax;
    float target=ax*run_speed();
    float acc=onground?ACCEL:AIRACC;
    if(p->dashT>0){
        p->vx=p->dashDirX*420; p->vy=p->dashDirY*420;
        p->dashT--;
        part_spawn(p->x+p->w/2,p->y+p->h,0,0,0.3f,RGB(0x74,0xc6,0xf0),3,3);
    } else {
        if(fabsf(ax)>0.01f){
            p->vx=md_approach(p->vx,target,acc*dt);
            p->dir=ax>0?1:-1;
        } else {
            float fr=onground?FRICT:FRICT*0.4f;
            p->vx=md_approach(p->vx,0,fr*dt);
        }
        /* gravity */
        float g=GRAV;
        if(p->gliding) g=140;
        p->vy+=g*dt;
        if(p->vy>MAXFALL)p->vy=MAXFALL;
        /* wall slide */
        p->wallSlideT=0;
        if(!onground && p->onwall && p->vy>0 && ((p->walldir<0&&ax<0)||(p->walldir>0&&ax>0))){
            if(p->vy>90)p->vy=90;
            p->wallSlideT=1;
        }
    }

    /* jump buffering + coyote */
    if(G->in.pressed&(1<<BTN_JUMP)) p->jumpBuf=8;
    else if(p->jumpBuf>0)p->jumpBuf--;
    if(onground) p->coyote=7; else if(p->coyote>0)p->coyote--;

    /* jumping */
    if(p->jumpBuf>0){
        if(p->coyote>0){
            p->vy=-JUMPV; p->jumpBuf=0; p->coyote=0; p->jumpsUsed=0; p->onground=0;
            audio_sfx(SFX_JUMP); part_burst(p->x+p->w/2,p->y+p->h,5,(0xFF000000u|0xffffff),60,0,2);
        } else if(p->onwall && p->abilities[AB_WALL]){
            p->vy=-330; p->vx=-p->walldir*230; p->dir=-p->walldir; p->jumpBuf=0;
            audio_sfx(SFX_WALLJUMP); part_burst(p->x+p->w/2,p->y+p->h,6,(0xFF000000u|0xffffff),80,0,2);
        } else if(p->abilities[AB_DJUMP] && p->jumpsUsed<1){
            p->vy=-320; p->jumpsUsed++; p->jumpBuf=0;
            audio_sfx(SFX_DOUBLEJUMP); part_ring(p->x+p->w/2,p->y+p->h,RGB(0x9b,0xd1,0xf5),8);
        }
    }
    /* variable jump */
    if(!(G->in.held&(1<<BTN_JUMP)) && p->vy<-140) p->vy=-140;

    /* glide */
    p->gliding=0;
    if(p->abilities[AB_GLIDE] && !onground && (G->in.held&(1<<BTN_JUMP)) && p->vy>40 && p->jumpsUsed>0){
        p->gliding=1; audio_sfx(SFX_GLIDE);
    }

    /* air dash */
    if(G->in.pressed&(1<<BTN_DASH)){
        if(p->abilities[AB_AIRDASH] && !onground && p->dashAvail>0){
            p->dashAvail--; do_dash();
        } else if(onground){
            do_dash();
        } else if(p->abilities[AB_DASH]){
            do_dash();
        }
    }
    if(onground) p->dashAvail=1;

    /* attacks */
    if(G->in.pressed&(1<<BTN_ATTACK)){
        if(G->in.ay<-0.5f) do_attack(3);
        else if(G->in.ay>0.5f && !onground) do_attack(4);
        else do_attack(p->attackCombo%3);
        p->attackCombo++;
    }
    if(G->in.pressed&(1<<BTN_SPECIAL)) do_special();

    /* move + collide */
    int hitx=0,hity=0;
    float ox=p->x, oy=p->y;
    world_move_x(&p->x,&p->y,p->w,p->h,&p->vx,p->vy,&hitx);
    p->onwall=0; p->walldir=0;
    if(hitx && !onground){ p->onwall=1; p->walldir=p->vx==0?( (ox==p->x)? (p->dir) : p->dir):SIGN(p->dir); }
    world_move_y(&p->x,&p->y,p->w,p->h,p->vx,&p->vy,&hity);
    if(hity && p->vy>=0){ 
        if(!p->onground){ audio_sfx(SFX_LAND); part_burst(p->x+p->w/2,p->y+p->h,4,(0xFF000000u|0xffffff),50,0,2);}
        p->onground=1; p->jumpsUsed=0;
    } else if(hity && p->vy<0){ p->onground=0; }
    else if(!hity) p->onground= (p->vy==0 && world_rect_solid(p->x,p->y+p->h,p->w,2))||world_on_platform(p->x,p->y+p->h,p->w);
    /* detect wall from horizontal probe */
    if(!p->onwall && !onground){
        if(world_solid_at(p->x-2,p->y+p->h/2)){p->onwall=1;p->walldir=-1;}
        else if(world_solid_at(p->x+p->w+2,p->y+p->h/2)){p->onwall=1;p->walldir=1;}
    }

    /* crumble trigger under feet */
    if(p->onground){
        int tx=(int)((p->x+p->w/2)/TILE), ty=(int)((p->y+p->h+2)/TILE);
        world_trigger_crumble(tx,ty);
        /* safe spot */
        if(!world_hazard_at(p->x+p->w/2,p->y+p->h+2)){
            p->lastSafeX=p->x; p->lastSafeY=p->y; p->lastSafeRoom=G->world.cur;
        }
    }

    /* hazards */
    int cx=(int)(p->x+p->w/2), cy=(int)(p->y+p->h-2);
    int inwater = world_tile_at(p->x+p->w/2,p->y+p->h/2)==T_WATER;
    if(inwater){ p->vx*=0.9f; p->vy*=0.9f; if(p->vy>120)p->vy=120; }
    if(world_hazard_at(cx,cy)||world_tile_at(cx,cy)==T_LAVA){
        if(world_tile_at(cx,cy)==T_LAVA){ player_hurt(2,cx); p->vy=-300; }
        else player_hurt(1,cx);
    }

    /* attack hits */
    if(p->attackT>0){
        float hx,hy,hw,hh;
        if(player_attack_box(&hx,&hy,&hw,&hh)){
            int dmg=1+(p->swordLevel-1)+ (charm_active(CH_THORN)?1:0);
            for(int e=0;e<G->nEnts;e++){
                Entity *en=&G->ents[e];
                if(!en->alive||!(en->flags&EF_HOSTILE)||en->invulnT>0) continue;
                if(faabb(hx,hy,hw,hh,en->x,en->y,en->w,en->h)){
                    ent_hurt(en,dmg,p->x+p->w/2,p->y);
                    if(p->attackKind==4){ p->vy=-320; } /* pogo */
                }
            }
            if(boss_active()){
                Boss *b=&G->boss;
                if(faabb(hx,hy,hw,hh,b->x,b->y,b->w,b->h)){
                    boss_hurt(dmg,p->x+p->w/2,p->y);
                    if(p->attackKind==4) p->vy=-320;
                }
            }
            /* cut vines / break blocks with fire or sword lvl */
            int tx0=(int)(hx/TILE),tx1=(int)((hx+hw)/TILE),ty0=(int)(hy/TILE),ty1=(int)((hy+hh)/TILE);
            for(int ty=ty0;ty<=ty1;ty++)for(int tx=tx0;tx<=tx1;tx++){
                int t=world_tile(tx,ty);
                if(t==T_VINE && p->abilities[AB_FIRE]){ world_set_tile(tx,ty,T_EMPTY); part_burst(tx*TILE+8,ty*TILE+8,8,RGB(0x6f,0xd1,0x82),80,0,2); audio_sfx(SFX_FIRE);}
                if(t==T_ICEBLOCK && p->abilities[AB_FIRE]){ world_set_tile(tx,ty,T_EMPTY); part_burst(tx*TILE+8,ty*TILE+8,8,RGB(0x9b,0xd1,0xf5),80,7,2); audio_sfx(SFX_SHATTER);}
                if(t==T_BREAKABLE){ world_set_tile(tx,ty,T_EMPTY); part_burst(tx*TILE+8,ty*TILE+8,8,RGB(0x88,0x88,0x88),80,0,2); audio_sfx(SFX_SHATTER);}
            }
        }
    }

    /* fall out of world */
    if(p->y > G->world.rooms[G->world.cur].h*TILE + 200){
        player_hurt(99,p->x);
    }

    /* energy regen slowly */
    static int reg=0;
    if(++reg>60*6){ reg=0; if(p->energy<p->maxenergy)p->energy++; }

    /* anim state */
    p->animT+=dt;
    int st=0;
    if(p->deadT) st=9;
    else if(p->attackT>0) st=5+ (p->attackKind==3?2:(p->attackKind==4?3:0));
    else if(p->dashT>0) st=4;
    else if(!onground) st=(p->vy<0?2:3);
    else if(fabsf(p->vx)>10) st=1;
    p->animState=st;
    p->animFrame=(int)(p->animT*10)%6;
    (void)p_maxhp_bonus;
}

/* ---------------- render ---------------- */
static Sprite *cat_frame_sprite(void){
    Player *p=&G->p;
    const char *n="cat_idle0";
    switch(p->animState){
        case 1: n=p->animFrame<6? (const char*[]){"cat_run0","cat_run1","cat_run2","cat_run3","cat_run4","cat_run5"}[p->animFrame%6] : "cat_run0"; break;
        case 2: n="cat_jump"; break;
        case 3: n=p->gliding?"cat_glide":"cat_fall"; break;
        case 4: n="cat_dash"; break;
        case 5: n=(const char*[]){"cat_atk0","cat_atk1","cat_atk2"}[p->attackCombo%3]; break;
        case 6: n="cat_atk0"; break;
        case 7: n="cat_atkup"; break;
        case 8: n="cat_atkdn"; break;
        case 9: n="cat_dead"; break;
        default:
            if(p->hurtT>0) n="cat_hurt";
            else n=(p->animFrame%4==3)?"cat_idle3":"cat_idle0";
    }
    return art(n);
}

void player_render(void){
    Player *p=&G->p;
    if(p->deadT && p->deadT<10){} /* still draw */
    int ox=(int)G->camX, oy=(int)G->camY;
    int x=(int)(p->x+p->w/2)-9-ox;
    int y=(int)(p->y+p->h)-22-oy;
    /* blink while invulnerable */
    if(p->invulnT>0 && (G->frame/3)%2==0 && !p->deadT) return;

    /* tail behind */
    Sprite *tail=art("cat_tail");
    if(tail) gfx_sprite_ex(g_screen,VIEW_W,VIEW_H,tail, x+(p->dir>0?-6:14), y+10, p->dir<0,0, RGB(0xff,0xff,0xff),TINT_MUL,1.0f);

    Sprite *s=cat_frame_sprite();
    if(s) gfx_sprite_ex(g_screen,VIEW_W,VIEW_H,s,x,y,p->dir<0,0,RGB(0xff,0xff,0xff),TINT_MUL,1.0f);

    /* sword */
    if(p->attackT>0 || p->specialT>0){
        Sprite *sw=art("sword");
        float ang=0;
        int cx=x+9, cy=y+12;
        if(p->attackKind==3) ang=-1.9f + (14-p->attackT)*0.2f;
        else if(p->attackKind==4) ang=1.6f;
        else ang=(p->dir>0? -0.6f : 0.6f) + (12-p->attackT)*0.25f*(p->dir>0?1:-1);
        /* draw simple rotated blade via lines */
        int len=22;
        int ex=cx+(int)(cosf(ang)*len*p->dir), ey=cy+(int)(sinf(ang)*len);
        gfx_line_thick(g_screen,VIEW_W,VIEW_H,cx,cy,ex,ey,2,RGB(0xe6,0xf6,0xff));
        gfx_line_thick(g_screen,VIEW_W,VIEW_H,cx,cy,ex,ey,1,(0xFF000000u|0xffffff));
        /* slash arc */
        Sprite *sl=art(p->attackCombo%2? "slash1":"slash0");
        if(sl) gfx_sprite_ex(g_screen,VIEW_W,VIEW_H,sl,cx-12,cy-12,p->dir<0,0,(0xFF000000u|0xffffff),TINT_ADD,0.7f);
    } else {
        Sprite *sw=art("sword");
        if(sw) gfx_sprite_ex(g_screen,VIEW_W,VIEW_H,sw,x+(p->dir>0?12:-2),y+8,p->dir<0,0,RGB(0xff,0xff,0xff),TINT_MUL,1.0f);
    }
}
