/* particles.c -- pooled particle system */
#include "game.h"
#include <math.h>

static int part_alloc(void){
    for(int i=0;i<MAX_PARTICLES;i++) if(!G->parts[i].alive) return i;
    return -1;
}
void part_spawn(float x,float y,float vx,float vy,float life,uint32_t c,int kind,float size){
    int i=part_alloc(); if(i<0) return;
    Particle *p=&G->parts[i];
    memset(p,0,sizeof(*p));
    p->alive=1; p->x=x; p->y=y; p->vx=vx; p->vy=vy;
    p->life=life; p->maxlife=life; p->col=c; p->col2=c; p->kind=kind; p->size=size;
    p->fade=1; p->shrink=(kind==2||kind==6)?1:0;
}
void part_spawn_ex(Particle *tpl){
    int i=part_alloc(); if(i<0) return;
    G->parts[i]=*tpl; G->parts[i].alive=1; G->parts[i].maxlife=tpl->life;
}
void part_burst(float x,float y,int n,uint32_t c,float spd,int kind,float size){
    for(int i=0;i<n;i++){
        float a=md_randrange(0,6.28318f);
        float s=md_randrange(spd*0.3f,spd);
        part_spawn(x,y,cosf(a)*s,sinf(a)*s,md_randrange(0.2f,0.6f),c,kind,md_randrange(size*0.6f,size*1.4f));
    }
}
void part_ring(float x,float y,uint32_t c,float r){
    Particle t; memset(&t,0,sizeof(t));
    t.x=x;t.y=y;t.life=0.35f;t.col=c;t.kind=6;t.size=r;t.fade=0;
    part_spawn_ex(&t);
}
void part_text(float x,float y,const char *s,uint32_t c){
    Particle t; memset(&t,0,sizeof(t));
    t.x=x;t.y=y;t.life=0.9f;t.col=c;t.kind=8;t.ch=s[0];t.vy=-40;t.fade=1;
    part_spawn_ex(&t);
}
void part_update(void){
    float dt=DT;
    for(int i=0;i<MAX_PARTICLES;i++){
        Particle *p=&G->parts[i];
        if(!p->alive) continue;
        p->life-=dt;
        if(p->life<=0){ p->alive=0; continue; }
        if(p->gravity) p->vy+=700*dt;
        p->x+=p->vx*dt; p->y+=p->vy*dt;
        p->rot+=p->vrot*dt;
    }
}
void part_render(uint32_t *buf,int bw,int bh,int ox,int oy){
    for(int i=0;i<MAX_PARTICLES;i++){
        Particle *p=&G->parts[i];
        if(!p->alive) continue;
        float a=1.0f;
        if(p->fade) a=CLAMP(p->life/p->maxlife,0,1);
        uint32_t c=p->col;
        int alpha=(int)(a*255);
        uint32_t ca=(c&0x00FFFFFF)|((uint32_t)alpha<<24);
        int x=(int)p->x-ox, y=(int)p->y-oy;
        int sz=(int)(p->size*(p->shrink?a:1.0f))+1;
        switch(p->kind){
            case 0: gfx_rect_blend(buf,bw,bh,x,y,sz,sz,ca); break;
            case 1: gfx_circle_blend(buf,bw,bh,x,y,sz,ca); break;
            case 2: /* spark: line along velocity */
                gfx_line_thick(buf,bw,bh,x,y,x-(int)p->vx/40,y-(int)p->vy/40,1,ca); break;
            case 3: gfx_circle_blend(buf,bw,bh,x,y,sz+ (int)((1-a)*3),ca); break;
            case 4: /* snow */ gfx_px(buf,bw,bh,x,y,ca); gfx_px(buf,bw,bh,x+1,y,ca); break;
            case 5: /* leaf */ gfx_rect_blend(buf,bw,bh,x,y,2,2,ca); break;
            case 6: { /* ring */
                int r=(int)(p->size*(1.0f-a)+2);
                for(int k=0;k<40;k++){
                    float ang=k/40.0f*6.28318f;
                    gfx_blend(buf,bw,bh,x+(int)(cosf(ang)*r),y+(int)(sinf(ang)*r),ca);
                }
                break;
            }
            case 7: /* shard */
                gfx_rect_blend(buf,bw,bh,x,y,2,3,ca); break;
            case 8: font_glyph(buf,bw,bh,x,y,p->ch,ca); break;
        }
    }
}
void part_clear(void){ memset(G->parts,0,sizeof(G->parts)); }
