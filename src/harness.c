/* ============================================================================
   harness.c -- headless Linux driver: screenshots, smoke tests, autopilot
   ========================================================================== */
#ifndef _WIN32
#include "game.h"
#include <math.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/time.h>

static uint32_t s_held=0;
void platform_get_input(InputState *in){
    in->held=s_held;
    static uint32_t prev=0;
    in->pressed=s_held&~prev; in->released=prev&~s_held; prev=s_held;
    in->ax=((s_held&(1<<BTN_RIGHT))?1:0)-((s_held&(1<<BTN_LEFT))?1:0);
    in->ay=((s_held&(1<<BTN_DOWN))?1:0)-((s_held&(1<<BTN_UP))?1:0);
}
void platform_present(const uint32_t *fb){ (void)fb; }
void platform_audio_pump(void){}
uint64_t platform_ticks_ms(void){ struct timeval tv; gettimeofday(&tv,NULL); return (uint64_t)tv.tv_sec*1000+tv.tv_usec/1000; }
void platform_delay_ms(int ms){ (void)ms; }
int platform_write_file(const char *p,const void *d,int n){ FILE*f=fopen(p,"wb"); if(!f)return 0; int w=(int)fwrite(d,1,n,f); fclose(f); return w; }
int platform_read_file(const char *p,void *d,int m){ FILE*f=fopen(p,"rb"); if(!f)return 0; int r=(int)fread(d,1,m,f); fclose(f); return r; }
void platform_save_path(char *out,int max,const char *name){ mkdir("saves",0755); snprintf(out,max,"saves/%s",name); }

static void step(void){ platform_get_input(&G->in); game_update(); }
static void write_bmp(const char *path,const uint32_t *px,int w,int h){
    FILE *f=fopen(path,"wb"); if(!f)return;
    int rowpad=(-(w*3))%4; int pix=(w*3+rowpad)*h;
    unsigned char hdr[54]={0};
    hdr[0]='B';hdr[1]='M';
    int off=54, fsz=54+pix;
    hdr[2]=fsz&255;hdr[3]=(fsz>>8)&255;hdr[4]=(fsz>>16)&255;hdr[5]=(fsz>>24)&255;
    hdr[10]=off;
    hdr[14]=40;
    hdr[18]=w&255;hdr[19]=(w>>8)&255;
    hdr[22]=h&255;hdr[23]=(h>>8)&255;
    hdr[26]=1; hdr[28]=32;  /* 32bpp, no padding */
    int isize=pix+ (0);
    hdr[34]= (w*h*4)&255; hdr[35]=((w*h*4)>>8)&255;
    fwrite(hdr,1,54,f);
    for(int y=h-1;y>=0;y--)for(int x=0;x<w;x++){
        uint32_t c=px[y*w+x];
        unsigned char b[4]={ (unsigned char)(c&255),(unsigned char)((c>>8)&255),(unsigned char)((c>>16)&255),255 };
        fwrite(b,1,4,f);
    }
    fclose(f);
}

static void find_spawn(int room,float *px,float *py){
    Room *r=&G->world.rooms[room];
    for(int y=r->h-6;y>1;y--){
        for(int x=3;x<r->w-3;x++){
            int t=r->tiles[y*r->w+x];
            int below=r->tiles[(y+1)*r->w+x];
            if(t==T_EMPTY&&below!=T_EMPTY&&below!=T_PLATFORM){
                *px=x*TILE; *py=y*TILE-20; return;
            }
        }
    }
    *px=4*TILE; *py=4*TILE;
}

static void render_room(int idx,const char *path){
    float px,py; find_spawn(idx,&px,&py);
    game_load_room(idx,px,py,1);
    G->state=ST_PLAY;
    G->roomTitleT=0;
    for(int i=0;i<6;i++){ s_held=0; step(); }
    game_render();
    write_bmp(path,g_screen,VIEW_W,VIEW_H);
    if(idx==0){
        Room *r=&G->world.rooms[0];
        printf("cam=%.0f,%.0f h=%d\n",G->camX,G->camY,r->h);
        printf("tile(5,19)=%d tile(5,20)=%d tile(5,21)=%d\n",
            r->tiles[19*r->w+5],r->tiles[20*r->w+5],r->tiles[21*r->w+5]);
        printf("px(320,320)=0x%08x px(100,310)=0x%08x px(320,2)=0x%08x\n",
            g_screen[320*VIEW_W+320],g_screen[310*VIEW_W+100],g_screen[2*VIEW_W+320]);
    }
}

int main(int argc,char **argv){
    setvbuf(stdout,NULL,_IONBF,0);
    gfx_init(); art_init(); font_init(); game_init();
    mkdir("shots",0755);
    if(argc<2){ printf("usage: harness <rooms|shot N|smoke|boss K>\n"); return 0; }
    if(strcmp(argv[1],"rooms")==0){
        for(int i=0;i<G->world.nRooms;i++){
            char p[128]; snprintf(p,sizeof(p),"shots/room_%02d.bmp",i);
            render_room(i,p);
        }
        printf("rendered %d rooms\n",G->world.nRooms);
    } else if(strcmp(argv[1],"shot")==0){
        int n=argc>2? atoi(argv[2]):0;
        render_room(n, argc>3? argv[3]:"shots/shot.bmp");
        printf("shot %d\n",n);
    } else if(strcmp(argv[1],"boss")==0){
        int k=argc>2? atoi(argv[2]):0;
        float px,py; find_spawn(6,&px,&py);
        game_load_room(6,px,py,1); G->state=ST_PLAY;
        game_trigger_boss(k);
        printf("triggered\n");
        for(int i=0;i<60*3;i++){
            if(i<60)printf("bf%d ",i);
            s_held=(1<<BTN_RIGHT);
            if(i%40<10)s_held|=1<<BTN_JUMP;
            if(i%30<6)s_held|=1<<BTN_ATTACK;
            step();
        }
        game_render(); write_bmp("shots/boss.bmp",g_screen,VIEW_W,VIEW_H);
        printf("boss %d hp=%d\n",k,G->boss.hp);
    } else if(strcmp(argv[1],"mv")==0){
        game_new(); G->dlg.active=0; G->state=ST_PLAY;
        for(int i=0;i<600;i++){ s_held=(1<<BTN_RIGHT); if(i%40<10)s_held|=1<<BTN_JUMP; if(i%90<10)s_held|=1<<BTN_DASH; if(i%34<8)s_held|=1<<BTN_ATTACK;
            platform_get_input(&G->in); if(i%50==0)printf("%d ",i); game_update(); }
        printf("\nfinal x=%.1f room=%d\n",G->p.x,G->world.cur);
        return 0;
    } else if(strcmp(argv[1],"dbg")==0){
        float px,py; find_spawn(0,&px,&py);
        game_load_room(0,px,py,1); G->state=ST_PLAY;
        Sprite *t=tile_spr(T_SOLID,0);
        for(int i=0;i<24;i++) printf("px[%d]=0x%08x ",i,t->px[i]); printf("\n");
        gfx_clear(RGB(0,0,0));
        gfx_px(g_screen,VIEW_W,VIEW_H,300,300,0xff123456);
        gfx_rect(g_screen,VIEW_W,VIEW_H,250,250,8,8,0xff654321);
        printf("px test (300,300)=0x%08x (252,252)=0x%08x\n",g_screen[300*VIEW_W+300],g_screen[252*VIEW_W+252]);
        gfx_sprite(g_screen,VIEW_W,VIEW_H,t,200,200);
        printf("direct sprite px(208,200)=0x%08x px(208,201)=0x%08x px(208,208)=0x%08x\n",g_screen[200*VIEW_W+208],g_screen[201*VIEW_W+208],g_screen[208*VIEW_W+208]);
        world_render_tiles();
        printf("after tiles px(8,0)=0x%08x px(8,1)=0x%08x px(8,8)=0x%08x\n",g_screen[0*VIEW_W+8],g_screen[1*VIEW_W+8],g_screen[8*VIEW_W+8]);
        printf("floor tile(20,20)=%d px(328,328)=0x%08x px(328,306)=0x%08x\n",G->world.rooms[0].tiles[20*44+20],g_screen[328*VIEW_W+328],g_screen[306*VIEW_W+328]);
        return 0;
    } else if(strcmp(argv[1],"smoke")==0){
        /* autopilot: walk right, jump & attack; ensure transitions and no crash */
        game_new();
        G->dlg.active=0; G->state=ST_PLAY;
        int transitions=0, lastRoom=G->world.cur;
        for(int i=0;i<60*40;i++){
            if(i%600==0)printf("f%d room=%d state=%d x=%.0f\n",i,G->world.cur,G->state,G->p.x);
            s_held=(1<<BTN_RIGHT);
            if(i%50<14)s_held|=1<<BTN_JUMP;
            if(i%34<8)s_held|=1<<BTN_ATTACK;
            if(i%90<10)s_held|=1<<BTN_DASH;
            step();
            if(G->state==ST_TRANSITION) transitions++;
            if(G->world.cur!=lastRoom){ lastRoom=G->world.cur; }
            if(G->state==ST_DIALOG){G->dlg.active=0;G->state=ST_PLAY;}
        }
        printf("SMOKE ok frames=%d room=%d hp=%d fish=%d kills=%d\n",
            60*40, G->world.cur, G->p.hp, G->p.fish, G->p.kills);
        game_render(); write_bmp("shots/smoke.bmp",g_screen,VIEW_W,VIEW_H);
    }
    return 0;
}
#endif
