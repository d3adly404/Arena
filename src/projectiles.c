/* projectiles.c -- pooled projectile system */
#include "game.h"
#include <math.h>

Projectile *proj_spawn(float x,float y,float vx,float vy,int dmg,int fromPlayer,int kind){
    for(int i=0;i<MAX_PROJ;i++){
        Projectile *p=&G->projs[i];
        if(p->alive) continue;
        memset(p,0,sizeof(*p));
        p->alive=1; p->x=x; p->y=y; p->vx=vx; p->vy=vy; p->damage=dmg;
        p->fromPlayer=fromPlayer; p->kind=kind; p->life=240;
        p->w=6; p->h=6;
        return p;
    }
    return NULL;
}
void proj_clear(void){ memset(G->projs,0,sizeof(G->projs)); }

static uint32_t proj_color(int kind){
    switch(kind){
        case 1: return RGB(0xff,0xa2,0x3a);
        case 2: return RGB(0x9b,0xd1,0xf5);
        case 3: return RGB(0x6f,0xd1,0x82);
        case 4: return RGB(0xd1,0x9b,0xff);
        case 5: return RGB(0xff,0xe0,0x7a);
        case 6: return RGB(0xd9,0xd9,0xd9);
        default:return RGB(0xff,0xff,0xff);
    }
}

void proj_update(void){
    float dt=DT;
    for(int i=0;i<MAX_PROJ;i++){
        Projectile *p=&G->projs[i];
        if(!p->alive) continue;
        p->life--; p->animT++;
        if(p->life<=0){ p->alive=0; continue; }
        if(p->gravity) p->vy+=700*dt;
        if(p->homing){
            float tx=G->p.x+G->p.w/2, ty=G->p.y+G->p.h/2;
            float dx=tx-p->x, dy=ty-p->y; float d=sqrtf(dx*dx+dy*dy);
            if(d>1){
                float spd=sqrtf(p->vx*p->vx+p->vy*p->vy);
                p->vx=md_approach(p->vx,dx/d*spd,300*dt);
                p->vy=md_approach(p->vy,dy/d*spd,300*dt);
            }
        }
        p->x+=p->vx*dt; p->y+=p->vy*dt;

        int hitWall=0;
        if(!world_line_clear(p->x,p->y,p->x,p->y) && world_solid_at(p->x,p->y)){
            if(p->bounce>0){ p->vy=-p->vy; p->bounce--; }
            else hitWall=1;
        }
        if(hitWall){
            part_burst(p->x,p->y,5,proj_color(p->kind),60,0,2);
            p->alive=0; continue;
        }

        if(p->fromPlayer){
            for(int e=0;e<G->nEnts;e++){
                Entity *en=&G->ents[e];
                if(!en->alive||!(en->flags&EF_HOSTILE)||en->invulnT>0) continue;
                if(faabb(p->x-p->w/2,p->y-p->h/2,p->w,p->h,en->x,en->y,en->w,en->h)){
                    ent_hurt(en,p->damage,p->x,p->y);
                    if(!p->pierce){ p->alive=0; break; }
                }
            }
            if(boss_active() && p->alive){
                Boss *b=&G->boss;
                if(faabb(p->x-p->w/2,p->y-p->h/2,p->w,p->h,b->x,b->y,b->w,b->h)){
                    boss_hurt(p->damage,p->x,p->y);
                    if(!p->pierce) p->alive=0;
                }
            }
        } else {
            Player *pl=&G->p;
            if(pl->invulnT<=0 && pl->deadT<=0 &&
               faabb(p->x-p->w/2,p->y-p->h/2,p->w,p->h,pl->x,pl->y,pl->w,pl->h)){
                player_hurt(p->damage,p->x);
                p->alive=0;
            }
        }
    }
}

void proj_render(void){
    int ox=(int)G->camX, oy=(int)G->camY;
    for(int i=0;i<MAX_PROJ;i++){
        Projectile *p=&G->projs[i];
        if(!p->alive) continue;
        int x=(int)p->x-ox, y=(int)p->y-oy;
        uint32_t c=proj_color(p->kind);
        int wob=(p->animT/4)%2;
        gfx_circle_blend(g_screen,VIEW_W,VIEW_H,x,y,3+wob,c);
        gfx_circle_blend(g_screen,VIEW_W,VIEW_H,x,y,1+wob,RGB(0xff,0xff,0xff));
    }
}
