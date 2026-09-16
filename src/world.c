/* world.c -- tilemap, collision, room rendering */
#include "game.h"
#include <math.h>

World G_world;  /* not used; G->world holds it */

static inline Room *cur(void){ return &G->world.rooms[G->world.cur]; }

int world_zone(void){ return cur()->zone; }

int world_tile(int tx,int ty){
    Room *r=cur();
    if(tx<0||ty<0||tx>=r->w||ty>=r->h) return T_SOLID;
    return r->tiles[ty*r->w+tx];
}
int world_tile_at(float wx,float wy){
    return world_tile((int)(wx/TILE),(int)(wy/TILE));
}
void world_set_tile(int tx,int ty,int v){
    Room *r=cur();
    if(tx<0||ty<0||tx>=r->w||ty>=r->h) return;
    r->tiles[ty*r->w+tx]=(uint8_t)v;
}

int tile_solid(int t){
    switch(t){
        case T_SOLID: case T_DARKSOLID: case T_SNOWSOLID: case T_ICE:
        case T_ICEBLOCK: case T_BREAKABLE: case T_VINE:
            return 1;
        case T_CRUMBLE: return 1;
        default: return 0;
    }
}
int tile_oneway(int t){ return t==T_PLATFORM; }
int tile_hazard(int t){ return t==T_SPIKE || t==T_LAVA; }

int world_solid_at(float wx,float wy){ return tile_solid(world_tile_at(wx,wy)); }
int world_hazard_at(float wx,float wy){ return tile_hazard(world_tile_at(wx,wy)); }

int world_rect_solid(float x,float y,float w,float h){
    int x0=(int)floorf(x/TILE), x1=(int)floorf((x+w-0.001f)/TILE);
    int y0=(int)floorf(y/TILE), y1=(int)floorf((y+h-0.001f)/TILE);
    for(int ty=y0;ty<=y1;ty++)for(int tx=x0;tx<=x1;tx++)
        if(tile_solid(world_tile(tx,ty))) return 1;
    return 0;
}
int world_on_platform(float x,float y,float w){
    int ty=(int)floorf((y+1)/TILE);
    int x0=(int)floorf(x/TILE), x1=(int)floorf((x+w-0.001f)/TILE);
    for(int tx=x0;tx<=x1;tx++) if(tile_oneway(world_tile(tx,ty))) return 1;
    return 0;
}
int world_line_clear(float x0,float y0,float x1,float y1){
    int steps=(int)(fabsf(x1-x0)+fabsf(y1-y0))/8+1;
    for(int i=0;i<=steps;i++){
        float t=(float)i/steps;
        float x=x0+(x1-x0)*t, y=y0+(y1-y0)*t;
        if(tile_solid(world_tile_at(x,y))) return 0;
    }
    return 1;
}

/* move horizontally; sets *hit on collision */
void world_move_x(float *x,float *y,float w,float h,float *vx,float vy,int *hit){
    *hit=0;
    float nx=*x + *vx*DT;
    int y0=(int)floorf(*y/TILE), y1=(int)floorf((*y+h-0.001f)/TILE);
    if(*vx>0){
        int tx=(int)floorf((nx+w-0.001f)/TILE);
        for(int ty=y0;ty<=y1;ty++) if(tile_solid(world_tile(tx,ty))){
            nx=tx*TILE-w; *vx=0; *hit=1; break;
        }
    } else if(*vx<0){
        int tx=(int)floorf(nx/TILE);
        for(int ty=y0;ty<=y1;ty++) if(tile_solid(world_tile(tx,ty))){
            nx=(tx+1)*TILE; *vx=0; *hit=1; break;
        }
    }
    *x=nx;
}
void world_move_y(float *x,float *y,float w,float h,float vx,float *vy,int *hit){
    *hit=0;
    float ny=*y + *vy*DT;
    int x0=(int)floorf(*x/TILE), x1=(int)floorf((*x+w-0.001f)/TILE);
    if(*vy>0){
        int ty=(int)floorf((ny+h-0.001f)/TILE);
        int oneway=tile_oneway(world_tile(x0,ty))||tile_oneway(world_tile(x1,ty));
        int solid=0;
        for(int tx=x0;tx<=x1;tx++) if(tile_solid(world_tile(tx,ty))) solid=1;
        float feet=*y+h;
        int feetTile=(int)floorf(feet/TILE);
        if(solid || (oneway && feetTile<ty)){
            ny=ty*TILE-h; *vy=0; *hit=1;
        }
    } else if(*vy<0){
        int ty=(int)floorf(ny/TILE);
        for(int tx=x0;tx<=x1;tx++) if(tile_solid(world_tile(tx,ty))){
            ny=(ty+1)*TILE; *vy=0; *hit=1; break;
        }
    }
    *y=ny;
}

/* ---------------- dynamic tiles ---------------- */
static float crumbleT[2048];
void world_update_dynamic(void){
    Room *r=cur();
    int ox=(int)(G->camX/TILE)-2, oy=(int)(G->camY/TILE)-2;
    for(int ty=MAX(0,oy);ty<MIN(r->h,oy+(VIEW_H/TILE)+6);ty++){
        for(int tx=MAX(0,ox);tx<MIN(r->w,ox+(VIEW_W/TILE)+6);tx++){
            int t=r->tiles[ty*r->w+tx];
            uint8_t m=r->meta[ty*r->w+tx];
            if(t==T_CRUMBLE && m>0 && m<250){
                m++;
                if(m>40){ r->tiles[ty*r->w+tx]=T_EMPTY; part_burst(tx*TILE+8,ty*TILE+8,6,RGB(0x88,0x77,0x66),60,0,2); }
                else r->meta[ty*r->w+tx]=m;
            }
        }
    }
    (void)crumbleT;
}
void world_trigger_crumble(int tx,int ty){
    Room *r=cur();
    if(tx>=0&&ty>=0&&tx<r->w&&ty<r->h && r->tiles[ty*r->w+tx]==T_CRUMBLE && r->meta[ty*r->w+tx]==0)
        r->meta[ty*r->w+tx]=1;
}

/* ---------------- rendering ---------------- */
static void render_decor(int zone,float camx,float camy);
void world_render_back(void){
    int zone=world_zone();
    /* sky gradient */
    uint32_t *far=parallax_layer(zone,0);
    uint32_t *mid=parallax_layer(zone,1);
    uint32_t *near=parallax_layer(zone,2);
    if(far) gfx_blit_buf(g_screen,VIEW_W,VIEW_H,far,VIEW_W,VIEW_H,0,0);
    int offx,offy;
    offx=-(int)(G->camX*0.2f)% (VIEW_W/2);
    offy=-(int)(G->camY*0.2f)% (VIEW_H/2);
    if(mid) gfx_blit_buf_alpha(g_screen,VIEW_W,VIEW_H,mid,VIEW_W,VIEW_H,offx- (VIEW_W/4), offy-(VIEW_H/4),0.85f);
    offx=-(int)(G->camX*0.45f)%(VIEW_W/2);
    offy=-(int)(G->camY*0.45f)%(VIEW_H/2);
    if(near) gfx_blit_buf_alpha(g_screen,VIEW_W,VIEW_H,near,VIEW_W,VIEW_H,offx-(VIEW_W/4), offy-(VIEW_H/4),0.9f);
    render_decor(zone,G->camX,G->camY);
}

static void render_decor(int zone,float camx,float camy){
    int ox=(int)camx, oy=(int)camy;
    int x0=(ox/96)*96;
    for(int wx=x0-96; wx<ox+VIEW_W+96; wx+=96){
        int sx=wx-ox;
        uint32_t h1=hash2(wx/96,zone,0xabc);
        int variant=h1%4;
        switch(zone){
            case Z_VERDANT: {
                int th=120+(h1%80);
                gfx_rect_blend(g_screen,VIEW_W,VIEW_H,sx+8,VIEW_H-th-(oy%8),10,th,RGBA(0x1c,0x2c,0x20,120));
                gfx_circle_blend(g_screen,VIEW_W,VIEW_H,sx+13,VIEW_H-th-(oy%8),22+variant*4,RGBA(0x2f,0x4a,0x30,120));
                break; }
            case Z_CISTERN:
                gfx_vline(g_screen,VIEW_W,VIEW_H,sx+20,0,VIEW_H,RGBA(0x10,0x1c,0x2c,120));
                gfx_vline(g_screen,VIEW_W,VIEW_H,sx+22,0,VIEW_H,RGBA(0x24,0x34,0x48,80));
                break;
            case Z_WARRENS:
                gfx_vline(g_screen,VIEW_W,VIEW_H,sx+30,0,VIEW_H/2+variant*20,RGBA(0xc9,0xa2,0xe8,40));
                break;
            case Z_EMBER:
                gfx_vline(g_screen,VIEW_W,VIEW_H,sx+26,0,120+variant*30,RGBA(0x20,0x10,0x08,160));
                gfx_circle_blend(g_screen,VIEW_W,VIEW_H,sx+26,130+variant*30,4,RGBA(0xff,0xa2,0x3a,120));
                break;
            case Z_FROST:
                gfx_tri(g_screen,VIEW_W,VIEW_H,sx+10,0,sx+18,60+variant*20,sx+26,0,RGBA(0x9b,0xd1,0xf5,60));
                break;
            case Z_SKY:
                gfx_ellipse_fill(g_screen,VIEW_W,VIEW_H,sx+20,80+variant*40,40,12,RGBA(0xd1,0xd1,0xff,30));
                break;
            case Z_CORE:
                gfx_rect_blend(g_screen,VIEW_W,VIEW_H,sx+12,40,14,VIEW_H,RGBA(0x2e,0x1e,0x3c,140));
                gfx_rect_blend(g_screen,VIEW_W,VIEW_H,sx+16,60+variant*20,6,10,RGBA(0xd1,0x9b,0xff,80));
                break;
        }
    }
}
void world_render_tiles(void){
    Room *r=cur();
    int ox=(int)G->camX, oy=(int)G->camY;
    int tx0=MAX(0,ox/TILE-1), tx1=MIN(r->w,(ox+VIEW_W)/TILE+2);
    int ty0=MAX(0,oy/TILE-1), ty1=MIN(r->h,(oy+VIEW_H)/TILE+2);
    for(int ty=ty0;ty<ty1;ty++){
        for(int tx=tx0;tx<tx1;tx++){
            int t=r->tiles[ty*r->w+tx];
            if(t==T_EMPTY) continue;
            int sx=tx*TILE-ox, sy=ty*TILE-oy;
            Sprite *s=NULL;
            switch(t){
                case T_WATER:
                    gfx_rect_blend(g_screen,VIEW_W,VIEW_H,sx,sy,TILE,TILE,RGBA(0x2b,0x6c,0xb5,150));
                    continue;
                case T_LAVA:
                    gfx_rect(g_screen,VIEW_W,VIEW_H,sx,sy,TILE,TILE,RGB(0xd9,0x4f,0x10));
                    if(((G->frame/8)+tx)%7==0) gfx_rect(g_screen,VIEW_W,VIEW_H,sx+2,sy,TILE-4,4,RGB(0xff,0xc0,0x40));
                    continue;
                case T_SPIKE:
                    for(int k=0;k<2;k++){
                        int bx=sx+k*8;
                        gfx_tri(g_screen,VIEW_W,VIEW_H,bx,sy+TILE,bx+4,sy+2,bx+8,sy+TILE,RGB(0xb0,0xb8,0xc8));
                        gfx_line(g_screen,VIEW_W,VIEW_H,bx,sy+TILE,bx+4,sy+2,RGB(0x70,0x78,0x88));
                    }
                    continue;
                case T_SAVE: case T_CHEST: case T_SWITCH: case T_HIDDEN:
                    continue;   /* drawn as entities */
                case T_VINE:
                    s=tile_spr(T_VINE,r->zone); break;
                case T_PLATFORM:
                    s=tile_spr(T_PLATFORM,r->zone); break;
                default:
                    s=tile_spr(t,r->zone);
            }
            if(s) gfx_sprite(g_screen,VIEW_W,VIEW_H,s,sx,sy);
        }
    }
}

void world_render_front(void){
    Room *r=cur();
    int ox=(int)G->camX, oy=(int)G->camY;
    /* water surface line */
    int tx0=MAX(0,ox/TILE-1), tx1=MIN(r->w,(ox+VIEW_W)/TILE+2);
    int ty0=MAX(0,oy/TILE-1), ty1=MIN(r->h,(oy+VIEW_H)/TILE+2);
    for(int ty=ty0;ty<ty1;ty++)for(int tx=tx0;tx<tx1;tx++){
        int t=r->tiles[ty*r->w+tx];
        if(t==T_WATER && world_tile(tx,ty-1)!=T_WATER){
            int sx=tx*TILE-ox, sy=ty*TILE-oy;
            int wob=((G->frame/10+tx)%2);
            gfx_hline(g_screen,VIEW_W,VIEW_H,sx,sy+wob,TILE,RGBA(0x9b,0xd1,0xf5,160));
        }
        if(t==T_CRUMBLE && r->meta[ty*r->w+tx]>0){
            int sx=tx*TILE-ox, sy=ty*TILE-oy;
            int sh=(int)((G->frame%2)?1:-1);
            Sprite *s=tile_spr(T_CRUMBLE,r->zone);
            if(s) gfx_sprite(g_screen,VIEW_W,VIEW_H,s,sx+sh,sy);
        }
    }
}
