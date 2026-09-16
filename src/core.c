/* ============================================================================
   core.c -- math, rng, sprites, software renderer, font, noise
   ========================================================================== */
#include "game.h"
#include <math.h>
#include <stdarg.h>

uint32_t *g_screen   = NULL;
uint32_t *g_scratch  = NULL;
uint32_t *g_light    = NULL;
uint32_t *g_lightSrc = NULL;

/* ------------------------------------------------------------------ rng --- */
static uint32_t s_rng = 0x9E3779B9u;
void md_srand(uint32_t seed){ s_rng = seed ? seed : 1u; }
uint32_t md_rand32(void){
    s_rng ^= s_rng<<13; s_rng ^= s_rng>>17; s_rng ^= s_rng<<5; return s_rng;
}
float md_randf(void){ return (float)(md_rand32()>>8) * (1.0f/16777216.0f); }
float md_randrange(float lo,float hi){ return lo + md_randf()*(hi-lo); }
int   md_randint(int lo,int hi){ if(hi<lo){int t=lo;lo=hi;hi=t;} return lo + (int)(md_rand32()%(uint32_t)(hi-lo+1)); }

float md_lerp(float a,float b,float t){ return a+(b-a)*t; }
float md_approach(float cur,float tgt,float step){
    if(cur<tgt){ cur+=step; if(cur>tgt) cur=tgt; }
    else if(cur>tgt){ cur-=step; if(cur<tgt) cur=tgt; }
    return cur;
}
float md_ease(float t){ return t<0.5f ? 2*t*t : 1-2*(1-t)*(1-t); }

void *md_alloc(size_t n){ void *p = malloc(n); if(!p) md_fatal("out of memory"); return p; }
void *md_calloc(size_t n){ void *p = calloc(1,n); if(!p) md_fatal("out of memory"); return p; }
char *md_strdup(const char *s){ size_t n=strlen(s)+1; char *p=(char*)md_alloc(n); memcpy(p,s,n); return p; }
void md_fatal(const char *fmt,...){
    char b[512]; va_list ap; va_start(ap,fmt); vsnprintf(b,sizeof(b),fmt,ap); va_end(ap);
    fprintf(stderr,"FATAL: %s\n",b);
    exit(1);
}

/* --------------------------------------------------------------- sprites -- */
Sprite *spr_new(int w,int h){
    Sprite *s=(Sprite*)md_alloc(sizeof(Sprite));
    s->w=w; s->h=h; s->px=(uint32_t*)md_calloc((size_t)w*h*sizeof(uint32_t));
    return s;
}
void spr_free(Sprite *s){ if(!s) return; free(s->px); free(s); }

Sprite *spr_from_ascii(int w,int h,const char *art,const uint32_t *pal,int palCount){
    Sprite *s=spr_new(w,h);
    const char *p=art;
    for(int y=0;y<h;y++){
        for(int x=0;x<w;x++){
            char c=*p++;
            while(c=='\n'||c=='\r'||c==' ') c=*p++;   /* tolerate formatting */
            if(c==0){ c='.'; }
            uint32_t v=0;
            if(c!='.'){
                int idx;
                if(c>='0'&&c<='9') idx=c-'0';
                else if(c>='a'&&c<='z') idx=10+(c-'a');
                else if(c>='A'&&c<='Z') idx=36+(c-'A');
                else idx=0;
                if(idx>0 && idx<palCount) v=pal[idx];
                else if(idx>0) v=RGB(255,0,255);
            }
            s->px[y*w+x]=v;
        }
    }
    return s;
}

Sprite *spr_clone_flip(Sprite *src,int flipX){
    Sprite *s=spr_new(src->w,src->h);
    for(int y=0;y<src->h;y++)
        for(int x=0;x<src->w;x++)
            s->px[y*s->w + (flipX? src->w-1-x : x)] = src->px[y*src->w+x];
    return s;
}
Sprite *spr_copy_region(Sprite *src,int x,int y,int w,int h){
    Sprite *s=spr_new(w,h);
    for(int j=0;j<h;j++)for(int i=0;i<w;i++){
        int sx=CLAMP(x+i,0,src->w-1), sy=CLAMP(y+j,0,src->h-1);
        s->px[j*w+i]=src->px[sy*src->w+sx];
    }
    return s;
}
Sprite *spr_recolor(Sprite *src,uint32_t from,uint32_t to){
    Sprite *s=spr_new(src->w,src->h);
    for(int i=0;i<src->w*src->h;i++){
        s->px[i] = (src->px[i]==from)? to : src->px[i];
    }
    return s;
}

/* ---------------------------------------------------------------- gfx ----- */
void gfx_init(void){
    g_screen   = (uint32_t*)md_calloc((size_t)VIEW_W*VIEW_H*4);
    g_scratch  = (uint32_t*)md_calloc((size_t)VIEW_W*VIEW_H*4);
    g_light    = (uint32_t*)md_calloc((size_t)VIEW_W*VIEW_H*4);
    g_lightSrc = (uint32_t*)md_calloc((size_t)VIEW_W*VIEW_H*4);
}
void gfx_free(void){ free(g_screen);free(g_scratch);free(g_light);free(g_lightSrc); }

void gfx_clear(uint32_t c){
    for(int i=0;i<VIEW_W*VIEW_H;i++) g_screen[i]=c;
}
void gfx_fill_screen(uint32_t c){ gfx_clear(c); }

void gfx_px(uint32_t *buf,int bw,int bh,int x,int y,uint32_t c){
    if((unsigned)x>=(unsigned)bw||(unsigned)y>=(unsigned)bh) return;
    buf[y*bw+x]=c;
}
void gfx_hline(uint32_t *buf,int bw,int bh,int x,int y,int w,uint32_t c){
    if(y<0||y>=bh) return;
    int x0=CLAMP(x,0,bw-1), x1=CLAMP(x+w-1,0,bw-1);
    if(x1<x0) return;
    uint32_t *row=buf+y*bw;
    for(int i=x0;i<=x1;i++) row[i]=c;
}
void gfx_vline(uint32_t *buf,int bw,int bh,int x,int y,int h,uint32_t c){
    if(x<0||x>=bw) return;
    int y0=CLAMP(y,0,bh-1), y1=CLAMP(y+h-1,0,bh-1);
    for(int i=y0;i<=y1;i++) buf[i*bw+x]=c;
}
void gfx_rect(uint32_t *buf,int bw,int bh,int x,int y,int w,int h,uint32_t c){
    int y0=CLAMP(y,0,bh), y1=CLAMP(y+h,0,bh);
    int x0=CLAMP(x,0,bw), x1=CLAMP(x+w,0,bw);
    for(int j=y0;j<y1;j++){ uint32_t *row=buf+j*bw; for(int i=x0;i<x1;i++) row[i]=c; }
}
void gfx_frame(uint32_t *buf,int bw,int bh,int x,int y,int w,int h,uint32_t c){
    gfx_hline(buf,bw,bh,x,y,w,c);
    gfx_hline(buf,bw,bh,x,y+h-1,w,c);
    gfx_vline(buf,bw,bh,x,y,h,c);
    gfx_vline(buf,bw,bh,x+w-1,y,h,c);
}
static inline uint32_t mixc(uint32_t a,uint32_t b,int t){
    int ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255;
    int br=(b>>16)&255, bg=(b>>8)&255, bb=b&255;
    int r=ar+((br-ar)*t>>8), g=ag+((bg-ag)*t>>8), bl=ab+((bb-ab)*t>>8);
    return RGB(r,g,bl);
}
void gfx_blend(uint32_t *buf,int bw,int bh,int x,int y,uint32_t c){
    if((unsigned)x>=(unsigned)bw||(unsigned)y>=(unsigned)bh) return;
    int a=(c>>24)&255; if(a==0) return;
    if(a==255){ buf[y*bw+x]=c|0xFF000000u; return; }
    buf[y*bw+x]=mixc(buf[y*bw+x],c,a)|0xFF000000u;
}
void gfx_rect_blend(uint32_t *buf,int bw,int bh,int x,int y,int w,int h,uint32_t c){
    int a=(c>>24)&255; if(a==0) return;
    int y0=CLAMP(y,0,bh), y1=CLAMP(y+h,0,bh), x0=CLAMP(x,0,bw), x1=CLAMP(x+w,0,bw);
    for(int j=y0;j<y1;j++)for(int i=x0;i<x1;i++) gfx_blend(buf,bw,bh,i,j,c);
}
void gfx_rect_add(uint32_t *buf,int bw,int bh,int x,int y,int w,int h,uint32_t c){
    int a=(c>>24)&255; if(!a) return;
    int y0=CLAMP(y,0,bh), y1=CLAMP(y+h,0,bh), x0=CLAMP(x,0,bw), x1=CLAMP(x+w,0,bw);
    for(int j=y0;j<y1;j++)for(int i=x0;i<x1;i++){
        uint32_t d=buf[j*bw+i];
        int r=GETR(d)+((GETR(c)*a)>>8), g=GETG(d)+((GETG(c)*a)>>8), b=GETB(d)+((GETB(c)*a)>>8);
        buf[j*bw+i]=RGB(MIN(r,255),MIN(g,255),MIN(b,255));
    }
}
void gfx_sprite(uint32_t *buf,int bw,int bh,const Sprite *s,int x,int y){
    if(!s) return;
    int y0=MAX(0,-y), y1=MIN(s->h,bh-y);
    int x0=MAX(0,-x), x1=MIN(s->w,bw-x);
    for(int j=y0;j<y1;j++){
        const uint32_t *srow=s->px+(size_t)j*s->w;
        uint32_t *drow=buf+(size_t)(j+y)*bw+x;
        for(int i=x0;i<x1;i++){
            uint32_t c=srow[i];
            if(c) drow[i]=c|0xFF000000u;
        }
    }
}
void gfx_sprite_buf(const Sprite *s,uint32_t *dst,int dw,int dh,int x,int y){
    gfx_sprite(dst,dw,dh,s,x,y);
}
void gfx_sprite_tint(uint32_t *buf,int bw,int bh,const Sprite *s,int x,int y,uint32_t tint,int mode){
    gfx_sprite_ex(buf,bw,bh,s,x,y,0,0,tint,mode,1.0f);
}
void gfx_sprite_ex(uint32_t *buf,int bw,int bh,const Sprite *s,int x,int y,int flipX,int flipY,
                   uint32_t tint,int mode,float alpha){
    if(!s) return;
    int y0=MAX(0,-y), y1=MIN(s->h,bh-y);
    int x0=MAX(0,-x), x1=MIN(s->w,bw-x);
    int ai=(int)(alpha*255);
    for(int j=y0;j<y1;j++){
        int sy = flipY ? (s->h-1-j) : j;
        const uint32_t *srow=s->px+(size_t)sy*s->w;
        uint32_t *drow=buf+(size_t)(j+y)*bw;
        for(int i=x0;i<x1;i++){
            int sx = flipX ? (s->w-1-i) : i;
            uint32_t c=srow[sx];
            if(!c) continue;
            uint32_t out;
            if(mode==TINT_SILHOUETTE) out=tint;
            else if(mode==TINT_ADD){
                out=RGB(MIN(255,GETR(c)+GETR(tint)),MIN(255,GETG(c)+GETG(tint)),MIN(255,GETB(c)+GETB(tint)));
            } else {
                out=RGB((GETR(c)*GETR(tint))>>8,(GETG(c)*GETG(tint))>>8,(GETB(c)*GETB(tint))>>8);
            }
            if(ai>=255) drow[i+x]=out|0xFF000000u;
            else gfx_blend(buf,bw,bh,i+x,j+y,out|(uint32_t)ai<<24);
        }
    }
}
void gfx_sprite_scaled(uint32_t *buf,int bw,int bh,const Sprite *s,int x,int y,int scale,uint32_t tint,int mode){
    if(!s) return;
    for(int j=0;j<s->h*scale;j++)for(int i=0;i<s->w*scale;i++){
        uint32_t c=s->px[(j/scale)*s->w+(i/scale)];
        if(!c) continue;
        uint32_t out = (mode==TINT_SILHOUETTE)? tint :
            RGB((GETR(c)*GETR(tint))>>8,(GETG(c)*GETG(tint))>>8,(GETB(c)*GETB(tint))>>8);
        gfx_px(buf,bw,bh,x+i,y+j,out);
    }
}
void gfx_circle_fill(uint32_t *buf,int bw,int bh,int cx,int cy,int r,uint32_t c){
    for(int j=-r;j<=r;j++)for(int i=-r;i<=r;i++) if(i*i+j*j<=r*r) gfx_px(buf,bw,bh,cx+i,cy+j,c);
}
void gfx_circle_blend(uint32_t *buf,int bw,int bh,int cx,int cy,int r,uint32_t c){
    for(int j=-r;j<=r;j++)for(int i=-r;i<=r;i++){
        int d2=i*i+j*j;
        if(d2<=r*r){
            int a=(c>>24)&255;
            int edge=r*r;
            int aa = a - (a*d2)/(edge+1)/2;
            gfx_blend(buf,bw,bh,cx+i,cy+j,(c&0x00FFFFFF)|((uint32_t)CLAMP(aa,0,255)<<24));
        }
    }
}
void gfx_ellipse_fill(uint32_t *buf,int bw,int bh,int cx,int cy,int rx,int ry,uint32_t c){
    if(rx<=0||ry<=0) return;
    for(int j=-ry;j<=ry;j++)for(int i=-rx;i<=rx;i++)
        if((i*i*ry*ry + j*j*rx*rx) <= rx*rx*ry*ry) gfx_px(buf,bw,bh,cx+i,cy+j,c);
}
void gfx_line(uint32_t *buf,int bw,int bh,int x0,int y0,int x1,int y1,uint32_t c){
    int dx=ABS(x1-x0), sx=x0<x1?1:-1;
    int dy=-ABS(y1-y0), sy=y0<y1?1:-1;
    int err=dx+dy;
    for(;;){
        gfx_px(buf,bw,bh,x0,y0,c);
        if(x0==x1&&y0==y1) break;
        int e2=2*err;
        if(e2>=dy){ err+=dy; x0+=sx; }
        if(e2<=dx){ err+=dx; y0+=sy; }
    }
}
void gfx_line_thick(uint32_t *buf,int bw,int bh,int x0,int y0,int x1,int y1,int t,uint32_t c){
    if(t<=1){ gfx_line(buf,bw,bh,x0,y0,x1,y1,c); return; }
    int dx=ABS(x1-x0), dy=ABS(y1-y0);
    int steps=MAX(dx,dy); if(steps<1) steps=1;
    for(int i=0;i<=steps;i++){
        int x=x0+(x1-x0)*i/steps, y=y0+(y1-y0)*i/steps;
        gfx_rect(buf,bw,bh,x-t/2,y-t/2,t,t,c);
    }
}
void gfx_tri(uint32_t *buf,int bw,int bh,int x0,int y0,int x1,int y1,int x2,int y2,uint32_t c){
    int miny=MIN(MIN(y0,y1),y2), maxy=MAX(MAX(y0,y1),y2);
    miny=CLAMP(miny,0,bh-1); maxy=CLAMP(maxy,0,bh-1);
    for(int y=miny;y<=maxy;y++){
        int minx=1<<30, maxx=-(1<<30);
        int px[3]={x0,x1,x2}, py[3]={y0,y1,y2};
        for(int i=0;i<3;i++){
            int a=i, b=(i+1)%3;
            if((py[a]<=y&&py[b]>y)||(py[b]<=y&&py[a]>y)){
                int t=(y-py[a])/(py[b]-py[a]);
                int x=px[a]+(px[b]-px[a])*t;
                if(x<minx)minx=x; if(x>maxx)maxx=x;
            }
        }
        if(maxx>=minx) gfx_hline(buf,bw,bh,CLAMP(minx,0,bw),y,CLAMP(maxx,0,bw-1)-CLAMP(minx,0,bw)+1,c);
    }
}
void gfx_poly(uint32_t *buf,int bw,int bh,const int *pts,int n,uint32_t c){
    if(n<3) return;
    int miny=1<<30,maxy=-(1<<30);
    for(int i=0;i<n;i++){ if(pts[i*2+1]<miny)miny=pts[i*2+1]; if(pts[i*2+1]>maxy)maxy=pts[i*2+1]; }
    miny=CLAMP(miny,0,bh-1); maxy=CLAMP(maxy,0,bh-1);
    for(int y=miny;y<=maxy;y++){
        int xs[64]; int nx=0;
        for(int i=0;i<n&&nx<62;i++){
            int a=i,b=(i+1)%n;
            int ya=pts[a*2+1], yb=pts[b*2+1];
            if((ya<=y&&yb>y)||(yb<=y&&ya>y)){
                xs[nx++]=pts[a*2]+(pts[b*2]-pts[a*2])*(y-ya)/(yb-ya);
            }
        }
        for(int i=0;i<nx-1;i++)for(int j=i+1;j<nx;j++) if(xs[j]<xs[i]){int t=xs[i];xs[i]=xs[j];xs[j]=t;}
        for(int i=0;i+1<nx;i+=2) gfx_hline(buf,bw,bh,xs[i],y,xs[i+1]-xs[i]+1,c);
    }
}
void gfx_blit_buf(uint32_t *dst,int dw,int dh,const uint32_t *src,int sw,int sh,int x,int y){
    for(int j=0;j<sh;j++){
        int dy=y+j; if(dy<0||dy>=dh) continue;
        for(int i=0;i<sw;i++){
            int dx=x+i; if(dx<0||dx>=dw) continue;
            dst[dy*dw+dx]=src[j*sw+i];
        }
    }
}
void gfx_blit_buf_scaled(uint32_t *dst,int dw,int dh,const uint32_t *src,int sw,int sh,int x,int y,int scale,int flipX){
    if(scale<1) scale=1;
    for(int j=0;j<sh;j++){
        int sy=j;
        for(int i=0;i<sw;i++){
            int sx=flipX?(sw-1-i):i;
            uint32_t c=src[sy*sw+sx];
            for(int v=0;v<scale;v++)
                for(int u=0;u<scale;u++)
                    gfx_px(dst,dw,dh,x+i*scale+u,y+j*scale+v,c);
        }
    }
}
void gfx_blit_buf_alpha(uint32_t *dst,int dw,int dh,const uint32_t *src,int sw,int sh,int x,int y,float alpha){
    int a=(int)(alpha*255);
    for(int j=0;j<sh;j++){
        int dy=y+j; if(dy<0||dy>=dh) continue;
        for(int i=0;i<sw;i++){
            int dx=x+i; if(dx<0||dx>=dw) continue;
            gfx_blend(dst,dw,dh,dx,dy,(src[j*sw+i]&0x00FFFFFF)|((uint32_t)a<<24));
        }
    }
}

/* ----------------------------------------------------------------- font --- */
/* 5x7 bitmap font. Each glyph is 7 rows of 5 chars ('#'=lit). */
static const char *FONT_GLYPHS[128] = {0};

#define G(c, a,b,cc,d,e,f,g) FONT_GLYPHS[(int)(c)] = a b cc d e f g

static void font_define(void){
    G(' ', ".....",".....",".....",".....",".....",".....",".....");
    G('!', "..#..","..#..","..#..","..#..","..#..",".....","..#..");
    G('"', ".#.#.",".#.#.",".#.#.",".....",".....",".....",".....");
    G('#', ".#.#.","#####",".#.#.","#####",".#.#.",".....",".....");
    G('$', "..#..",".####","#.#..",".###.","..#.#","####.","..#..");
    G('%', "##..#","##..#","...#.","..#..",".#...",".#..#",".#..#");
    G('&', ".##..","#..#.",".#.#.","..#..","#.#.#","#..#.",".##.#");
    G('\'',"..#..","..#..",".....",".....",".....",".....",".....");
    G('(', "...#.","..#..",".#...",".#...",".#...","..#..","...#.");
    G(')', ".#...","..#..","...#.","...#.","...#.","..#..",".#...");
    G('*', ".....",".#.#.","..#..","#####","..#..",".#.#.",".....");
    G('+', ".....","..#..","..#..","#####","..#..","..#..",".....");
    G(',', ".....",".....",".....",".....","..##.","..#..",".#...");
    G('-', ".....",".....",".....","#####",".....",".....",".....");
    G('.', ".....",".....",".....",".....",".....",".##..",".##..");
    G('/', "....#","....#","...#.","..#..",".#...","#....","#....");
    G('0', ".###.","#...#","#..##","#.#.#","##..#","#...#",".###.");
    G('1', "..#..",".##..","..#..","..#..","..#..","..#..",".###.");
    G('2', ".###.","#...#","....#","...#.","..#..",".#...","#####");
    G('3', "#####","...#.","..#..","...#.","....#","#...#",".###.");
    G('4', "...#.","..##.",".#.#.","#..#.","#####","...#.","...#.");
    G('5', "#####","#....","####.","....#","....#","#...#",".###.");
    G('6', "..##.",".#...","#....","####.","#...#","#...#",".###.");
    G('7', "#####","....#","...#.","..#..",".#...",".#...",".#...");
    G('8', ".###.","#...#","#...#",".###.","#...#","#...#",".###.");
    G('9', ".###.","#...#","#...#",".####","....#","...#.",".##..");
    G(':', ".....",".##..",".##..",".....",".##..",".##..",".....");
    G(';', ".....",".##..",".##..",".....",".##..","..#..",".#...");
    G('<', "...#.","..#..",".#...","#....",".#...","..#..","...#.");
    G('=', ".....",".....","#####",".....","#####",".....",".....");
    G('>', ".#...","..#..","...#.","....#","...#.","..#..",".#...");
    G('?', ".###.","#...#","....#","...#.","..#..",".....","..#..");
    G('@', ".###.","#...#","#.###","#.#.#","#.###","#....",".###.");
    G('A', "..#..",".#.#.","#...#","#...#","#####","#...#","#...#");
    G('B', "####.","#...#","#...#","####.","#...#","#...#","####.");
    G('C', ".###.","#...#","#....","#....","#....","#...#",".###.");
    G('D', "####.","#...#","#...#","#...#","#...#","#...#","####.");
    G('E', "#####","#....","#....","####.","#....","#....","#####");
    G('F', "#####","#....","#....","####.","#....","#....","#....");
    G('G', ".###.","#...#","#....","#.###","#...#","#...#",".###.");
    G('H', "#...#","#...#","#...#","#####","#...#","#...#","#...#");
    G('I', ".###.","..#..","..#..","..#..","..#..","..#..",".###.");
    G('J', "..###","...#.","...#.","...#.","...#.","#..#.",".##..");
    G('K', "#...#","#..#.","#.#..","##...","#.#..","#..#.","#...#");
    G('L', "#....","#....","#....","#....","#....","#....","#####");
    G('M', "#...#","##.##","#.#.#","#.#.#","#...#","#...#","#...#");
    G('N', "#...#","##..#","#.#.#","#.#.#","#..##","#...#","#...#");
    G('O', ".###.","#...#","#...#","#...#","#...#","#...#",".###.");
    G('P', "####.","#...#","#...#","####.","#....","#....","#....");
    G('Q', ".###.","#...#","#...#","#...#","#.#.#","#..#.",".##.#");
    G('R', "####.","#...#","#...#","####.","#.#..","#..#.","#...#");
    G('S', ".####","#....","#....",".###.","....#","....#","####.");
    G('T', "#####","..#..","..#..","..#..","..#..","..#..","..#..");
    G('U', "#...#","#...#","#...#","#...#","#...#","#...#",".###.");
    G('V', "#...#","#...#","#...#","#...#","#...#",".#.#.","..#..");
    G('W', "#...#","#...#","#...#","#.#.#","#.#.#","##.##","#...#");
    G('X', "#...#","#...#",".#.#.","..#..",".#.#.","#...#","#...#");
    G('Y', "#...#","#...#",".#.#.","..#..","..#..","..#..","..#..");
    G('Z', "#####","....#","...#.","..#..",".#...","#....","#####");
    G('[', ".###.",".#...",".#...",".#...",".#...",".#...",".###.");
    G('\\',"#....","#....",".#...","..#..","...#.","....#","....#");
    G(']', ".###.","...#.","...#.","...#.","...#.","...#.",".###.");
    G('^', "..#..",".#.#.","#...#",".....",".....",".....",".....");
    G('_', ".....",".....",".....",".....",".....",".....","#####");
    G('`', ".#...","..#..",".....",".....",".....",".....",".....");
    /* lowercase map to compact variants */
    G('a', ".....",".....",".###.","....#",".####","#...#",".####");
    G('b', "#....","#....","####.","#...#","#...#","#...#","####.");
    G('c', ".....",".....",".###.","#....","#....","#....",".###.");
    G('d', "....#","....#",".####","#...#","#...#","#...#",".####");
    G('e', ".....",".....",".###.","#...#","#####","#....",".###.");
    G('f', "..##.",".#..#",".#...","###..",".#...",".#...",".#...");
    G('g', ".....",".....",".####","#...#","#...#",".####","....#");
    G('h', "#....","#....","####.","#...#","#...#","#...#","#...#");
    G('i', "..#..",".....",".##..","..#..","..#..","..#..",".###.");
    G('j', "...#.",".....","..##.","...#.","...#.","#..#.",".##..");
    G('k', "#....","#....","#..#.","#.#..","##...","#.#..","#..#.");
    G('l', ".##..","..#..","..#..","..#..","..#..","..#..",".###.");
    G('m', ".....",".....","##.#.","#.#.#","#.#.#","#.#.#","#...#");
    G('n', ".....",".....","####.","#...#","#...#","#...#","#...#");
    G('o', ".....",".....",".###.","#...#","#...#","#...#",".###.");
    G('p', ".....",".....","####.","#...#","#...#","####.","#....");
    G('q', ".....",".....",".####","#...#","#...#",".####","....#");
    G('r', ".....",".....","#.##.","##...","#....","#....","#....");
    G('s', ".....",".....",".####","#....",".###.","....#","####.");
    G('t', ".#...",".#...","####.",".#...",".#...",".#..#","..##.");
    G('u', ".....",".....","#...#","#...#","#...#","#..##",".##.#");
    G('v', ".....",".....","#...#","#...#","#...#",".#.#.","..#..");
    G('w', ".....",".....","#...#","#...#","#.#.#","#.#.#",".###.");
    G('x', ".....",".....","#...#",".#.#.","..#..",".#.#.","#...#");
    G('y', ".....",".....","#...#","#...#","#...#",".####","....#");
    G('z', ".....",".....","#####","...#.","..#..",".#...","#####");
    G('{', "...#.","..#..","..#..",".#...","..#..","..#..","...#.");
    G('|', "..#..","..#..","..#..","..#..","..#..","..#..","..#..");
    G('}', ".#...","..#..","..#..","...#.","..#..","..#..",".#...");
    G('~', ".....",".....",".#..#","#.#.#","#..#.",".....",".....");
    /* special glyphs used by the game */
    G(1,  ".###.","#####","#####","#####","#####",".###.",".....");   /* filled heart-ish */
    G(2,  ".###.","#...#","#...#","#...#","#...#",".###.",".....");   /* empty heart */
    G(3,  ".....","..#..",".###.","#####",".###.","..#..",".....");   /* diamond */
    G(4,  ".....",".....","#####","#...#","#...#","#####",".....");   /* box */
}

static int s_fontReady=0;
void font_init(void){
    if(s_fontReady) return;
    font_define();
    s_fontReady=1;
}
void font_glyph(uint32_t *buf,int bw,int bh,int x,int y,char ch,uint32_t c){
    unsigned char uc=(unsigned char)ch;
    const char *g = (uc<128)? FONT_GLYPHS[uc] : NULL;
    if(!g) g=FONT_GLYPHS[(int)'?'];
    if(!g) return;
    for(int j=0;j<7;j++){
        char row=g[j*5+ (0)];
        (void)row;
        for(int i=0;i<5;i++){
            if(g[j*5+i]=='#') gfx_px(buf,bw,bh,x+i,y+j,c);
        }
    }
}
void font_text(uint32_t *buf,int bw,int bh,int x,int y,const char *s,uint32_t c){
    int cx=x;
    for(const char *p=s;*p;p++){
        if(*p=='\n'){ cx=x; y+=8; continue; }
        font_glyph(buf,bw,bh,cx,y,*p,c);
        cx+=6;
    }
}
void font_text_shadow(uint32_t *buf,int bw,int bh,int x,int y,const char *s,uint32_t c,uint32_t sh){
    font_text(buf,bw,bh,x+1,y+1,s,sh);
    font_text(buf,bw,bh,x,y,s,c);
}
void font_text_center(uint32_t *buf,int bw,int bh,int cx,int y,const char *s,uint32_t c,uint32_t sh){
    int w=font_width(s);
    font_text_shadow(buf,bw,bh,cx-w/2,y,s,c,sh);
}
int font_width(const char *s){
    int best=0,cur=0;
    for(const char *p=s;*p;p++){
        if(*p=='\n'){ if(cur>best)best=cur; cur=0; }
        else cur+=6;
    }
    return cur>best?cur:best;
}

/* ----------------------------------------------------------------- noise -- */
uint32_t hash2(int x,int y,uint32_t s){
    uint32_t h=(uint32_t)x*374761393u + (uint32_t)y*668265263u + s*1442695040u;
    h=(h^(h>>13))*1274126177u;
    return h^(h>>16);
}
float noise2(int x,int y,uint32_t seed){ return (float)(hash2(x,y,seed)&0xFFFF)/65535.0f; }
static float vnoise(float x,float y,uint32_t seed){
    int xi=(int)floorf(x), yi=(int)floorf(y);
    float xf=x-xi, yf=y-yi;
    xf=xf*xf*(3-2*xf); yf=yf*yf*(3-2*yf);
    float a=noise2(xi,yi,seed), b=noise2(xi+1,yi,seed);
    float c=noise2(xi,yi+1,seed), d=noise2(xi+1,yi+1,seed);
    return a*(1-xf)*(1-yf)+b*xf*(1-yf)+c*(1-xf)*yf+d*xf*yf;
}
float fnoise2(float x,float y,uint32_t seed){ return vnoise(x,y,seed); }
float fbm2(float x,float y,int oct,uint32_t seed){
    float v=0, amp=0.5f, f=1.0f, tot=0;
    for(int i=0;i<oct;i++){ v+=vnoise(x*f,y*f,seed+i*17u)*amp; tot+=amp; amp*=0.5f; f*=2.0f; }
    return v/tot;
}
