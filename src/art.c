/* ============================================================================
   art.c -- loads generated sprite data, tile textures, parallax backgrounds
   ========================================================================== */
#include "game.h"
#include "art_data.h"
#include <math.h>

typedef struct { char name[48]; Sprite *spr; } ArtSlot;
static ArtSlot *SLOTS = NULL;
static int NSLOTS = 0;
static int ART_READY = 0;

Sprite *art(const char *name){
    for(int i=0;i<NSLOTS;i++) if(strcmp(SLOTS[i].name,name)==0) return SLOTS[i].spr;
    return NULL;
}

/* ---- zone tile palettes ---- */
typedef struct {
    uint32_t base, base2, dark, edge, hi, accent;
} TilePal;
static const TilePal TPAL[Z_COUNT] = {
    /* VERDANT */ { RGB(0x57,0x7a,0x4a), RGB(0x4a,0x6b,0x40), RGB(0x33,0x4a,0x2c), RGB(0x8f,0xc8,0x6a), RGB(0xb5,0xe0,0x8a), RGB(0x9b,0xe0,0x82) },
    /* CISTERN */ { RGB(0x3a,0x55,0x75), RGB(0x32,0x4a,0x68), RGB(0x24,0x34,0x4c), RGB(0x5f,0x8a,0xb5), RGB(0x8a,0xb5,0xd9), RGB(0x74,0xc6,0xf0) },
    /* WARRENS */ { RGB(0x5f,0x44,0x5f), RGB(0x54,0x3a,0x54), RGB(0x3c,0x28,0x3c), RGB(0x8a,0x63,0x8a), RGB(0xb5,0x8a,0xd9), RGB(0xc9,0xa2,0xe8) },
    /* EMBER   */ { RGB(0x6b,0x3c,0x2c), RGB(0x5f,0x34,0x26), RGB(0x45,0x24,0x1a), RGB(0xa6,0x54,0x32), RGB(0xd9,0x7a,0x45), RGB(0xff,0xa2,0x3a) },
    /* FROST   */ { RGB(0x4a,0x5f,0x8a), RGB(0x41,0x54,0x7c), RGB(0x2e,0x3c,0x5c), RGB(0x6f,0x8a,0xc4), RGB(0x9b,0xb5,0xe8), RGB(0xb8,0xdc,0xff) },
    /* SKY     */ { RGB(0x5f,0x5f,0x8a), RGB(0x54,0x54,0x7c), RGB(0x3c,0x3c,0x5c), RGB(0x8a,0x8a,0xc4), RGB(0xb5,0xb5,0xe8), RGB(0xd1,0xd1,0xff) },
    /* CORE    */ { RGB(0x4c,0x34,0x5f), RGB(0x43,0x2c,0x54), RGB(0x2e,0x1e,0x3c), RGB(0x75,0x4c,0x9b), RGB(0xa6,0x6f,0xd9), RGB(0xd1,0x9b,0xff) },
};

static Sprite *TILE_CACHE[Z_COUNT][T_COUNT];
static inline uint32_t mixc2(uint32_t a,uint32_t b,int t);

static Sprite *gen_tile(int tile, int zone){
    const TilePal *P=&TPAL[zone];
    Sprite *s=spr_new(TILE,TILE);
    uint32_t seed=(uint32_t)(zone*97+tile*13+7);
    for(int y=0;y<TILE;y++)for(int x=0;x<TILE;x++){
        float n=fbm2(x*0.35f,y*0.35f,3,seed);
        uint32_t c=mixc2(P->base,P->base2,n<0.5f?0:255);
        /* speckle */
        float sp=noise2(x,y,seed^0x55);
        if(sp>0.82f) c=P->hi;
        else if(sp<0.10f) c=P->dark;
        else if(n>0.62f) c=P->base2;
        uint32_t edge=P->edge;
        switch(tile){
            case T_SOLID: case T_DARKSOLID: case T_SNOWSOLID:
                s->px[y*TILE+x]=c; break;
            case T_PLATFORM:
                if(y<2) s->px[y*TILE+x]=P->hi;
                else if(y<5) s->px[y*TILE+x]=edge;
                else if(y<6) s->px[y*TILE+x]=P->dark;
                break;
            case T_CRUMBLE:
                if(n>0.55f&&sp>0.5f) s->px[y*TILE+x]=P->dark; else s->px[y*TILE+x]=c;
                break;
            case T_ICE: case T_ICEBLOCK:
                s->px[y*TILE+x]= (sp>0.7f)? RGB(0xd1,0xec,0xff) : mixc2(RGB(0x69,0xb0,0xe8), RGB(0x9b,0xd1,0xf5), sp>0.4?255:0);
                break;
            case T_VINE:
                if(noise2(x,y,seed)>0.5f) s->px[y*TILE+x]=(sp>0.6f?P->accent:RGB(0x2f,0x6b,0x3c));
                break;
            case T_BREAKABLE:
                s->px[y*TILE+x]=c;
                if((x%8==0)||(y%8==0)) s->px[y*TILE+x]=P->dark;
                break;
            default:
                s->px[y*TILE+x]=c;
        }
        /* top edge highlight for solids */
        if((tile==T_SOLID||tile==T_SNOWSOLID||tile==T_DARKSOLID)){
            if(y<2) s->px[y*TILE+x]=edge;
            else if(y==2) s->px[y*TILE+x]=P->hi;
        }
    }
    /* per-zone decoration */
    if(tile==T_SOLID){
        if(zone==Z_VERDANT||zone==Z_WARRENS){
            for(int x=0;x<TILE;x++){
                if(noise2(x,99,seed)>0.45f){
                    s->px[0*TILE+x]=P->accent;
                    if(noise2(x,5,seed)>0.6f) s->px[1*TILE+x]=P->hi;
                }
            }
        }
        if(zone==Z_FROST){ for(int x=0;x<TILE;x++){ s->px[0*TILE+x]=RGB(0xd1,0xec,0xff); } }
        if(zone==Z_EMBER){ for(int x=0;x<TILE;x++){ if(noise2(x,3,seed)>0.7f) s->px[0*TILE+x]=RGB(0xff,0xa2,0x3a); } }
    }
    return s;
}

static inline uint32_t mixc2(uint32_t a,uint32_t b,int t){
    int ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255;
    int br=(b>>16)&255, bg=(b>>8)&255, bb=b&255;
    return RGB(ar+((br-ar)*t>>8), ag+((bg-ag)*t>>8), ab+((bb-ab)*t>>8));
}

Sprite *tile_spr(int tile,int zone){
    if(tile<0||tile>=T_COUNT||zone<0||zone>=Z_COUNT) return NULL;
    if(!TILE_CACHE[zone][tile]) TILE_CACHE[zone][tile]=gen_tile(tile,zone);
    return TILE_CACHE[zone][tile];
}

/* ---------------- parallax ---------------- */
static uint32_t *PARA[Z_COUNT][3];   /* 3 layers, each VIEW_W x VIEW_H */
static int PARA_READY[Z_COUNT];

static uint32_t zone_sky_top(int z){
    switch(z){
        case Z_VERDANT: return RGB(0x26,0x3a,0x4a);
        case Z_CISTERN: return RGB(0x10,0x20,0x33);
        case Z_WARRENS: return RGB(0x1c,0x12,0x22);
        case Z_EMBER:   return RGB(0x2a,0x14,0x10);
        case Z_FROST:   return RGB(0x1a,0x28,0x40);
        case Z_SKY:     return RGB(0x33,0x3f,0x6b);
        case Z_CORE:    return RGB(0x16,0x0e,0x20);
        default: return RGB(0x00,0x00,0x00);
    }
}
static uint32_t zone_sky_bot(int z){
    switch(z){
        case Z_VERDANT: return RGB(0x10,0x24,0x1c);
        case Z_CISTERN: return RGB(0x06,0x10,0x1e);
        case Z_WARRENS: return RGB(0x12,0x0a,0x14);
        case Z_EMBER:   return RGB(0x16,0x08,0x06);
        case Z_FROST:   return RGB(0x0c,0x16,0x28);
        case Z_SKY:     return RGB(0x1c,0x26,0x48);
        case Z_CORE:    return RGB(0x0a,0x06,0x12);
        default: return RGB(0x00,0x00,0x00);
    }
}

void make_parallax_layers(void){ /* called lazily per zone */ }

void ensure_parallax(int zone){
    if(zone<0||zone>=Z_COUNT||PARA_READY[zone]) return;
    PARA_READY[zone]=1;
    uint32_t top=zone_sky_top(zone), bot=zone_sky_bot(zone);
    uint32_t seed=(uint32_t)zone*777u+99u;
    for(int layer=0; layer<3; layer++){
        uint32_t *buf=(uint32_t*)md_calloc((size_t)VIEW_W*VIEW_H*4);
        float scale = 0.012f + layer*0.006f;
        float thresh = 0.42f + layer*0.10f;
        for(int y=0;y<VIEW_H;y++){
            float t=(float)y/VIEW_H;
            uint32_t sky=mixc2(top,bot,(int)(t*255));
            for(int x=0;x<VIEW_W;x++){
                buf[y*VIEW_W+x]=sky;
                float n=fbm2(x*scale + layer*100.0f, y*scale, 4, seed+ (uint32_t)layer);
                if(n>thresh){
                    float d=CLAMP((n-thresh)/0.25f,0,1);
                    uint32_t sil = mixc2(bot, RGB(0,0,0), 90);
                    uint32_t c = mixc2(sky, sil, (int)(d*200));
                    if(layer==2) c = mixc2(c, RGB(0,0,0), 120);
                    buf[y*VIEW_W+x]=c;
                }
            }
        }
        /* decorative accents */
        if(zone==Z_EMBER){
            for(int i=0;i<40;i++){
                int ex=md_randint(0,VIEW_W-1), ey=md_randint(VIEW_H/2,VIEW_H-1);
                gfx_circle_blend(buf,VIEW_W,VIEW_H,ex,ey,md_randint(1,2),RGB(0xff,0x90,0x30));
            }
        } else if(zone==Z_FROST || zone==Z_SKY){
            for(int i=0;i<60;i++){
                int ex=md_randint(0,VIEW_W-1), ey=md_randint(0,VIEW_H-1);
                gfx_px(buf,VIEW_W,VIEW_H,ex,ey,RGB(0xd1,0xec,0xff));
            }
        } else if(zone==Z_CISTERN){
            for(int i=0;i<40;i++){
                int ex=md_randint(0,VIEW_W-1), ey=md_randint(0,VIEW_H-1);
                gfx_circle_blend(buf,VIEW_W,VIEW_H,ex,ey,1,RGB(0x74,0xc6,0xf0));
            }
        } else if(zone==Z_CORE){
            for(int i=0;i<50;i++){
                int ex=md_randint(0,VIEW_W-1), ey=md_randint(0,VIEW_H-1);
                gfx_px(buf,VIEW_W,VIEW_H,ex,ey,RGB(0xd1,0x9b,0xff));
            }
        } else { /* verdant/warrens stars/fireflies */
            for(int i=0;i<30;i++){
                int ex=md_randint(0,VIEW_W-1), ey=md_randint(0,VIEW_H/2);
                gfx_px(buf,VIEW_W,VIEW_H,ex,ey,RGB(0xc0,0xd8,0xc0));
            }
        }
        PARA[zone][layer]=buf;
    }
}
uint32_t *parallax_layer(int zone,int layer){ ensure_parallax(zone); return PARA[zone][layer]; }

/* ---------------- init ---------------- */
void art_init(void){
    if(ART_READY) return;
    ART_READY=1;
    NSLOTS=ART_COUNT;
    SLOTS=(ArtSlot*)md_calloc(NSLOTS*sizeof(ArtSlot));
    for(int i=0;i<ART_COUNT;i++){
        snprintf(SLOTS[i].name,sizeof(SLOTS[i].name),"%s",ART_TABLE[i].name);
        SLOTS[i].spr=spr_from_ascii(ART_TABLE[i].w,ART_TABLE[i].h,ART_TABLE[i].art,ART_PAL,36);
    }
}

/* lookup table for palette (unused by ascii loader; sprites use raw rgb via pal none) */
static const uint32_t *art_pal_unused=NULL;
