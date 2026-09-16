/* ============================================================================
   audio.c -- procedural chiptune synth: SFX + step-sequenced music
   ========================================================================== */
#include "game.h"
#include <math.h>
#include <string.h>

#define MAXVOICES 48
#define SR 44100

typedef struct {
    int active;
    float phase, freq, freqEnd;
    float t, dur;
    float vol;
    int wave;        /* 0 square,1 tri,2 noise,3 saw,4 sine */
    float slide;
    float noiseSeed;
} Voice;

static Voice voices[MAXVOICES];
static int s_inited=0;
static int vol_master=80, vol_music=70, vol_sfx=80;

/* music state */
static int mus_track=MUS_NONE;
static float mus_step=0;
static int mus_index=0;
static float mus_tempo=120;
static uint32_t nseed=1;

static float note_freq(int n){ /* n semitones from A3=220 */
    return 220.0f*powf(2.0f,(float)n/12.0f);
}

void audio_set_volume(int m,int mu,int s){ vol_master=m; vol_music=mu; vol_sfx=s; }
void audio_init(int sr){ (void)sr; s_inited=1; }
void audio_shutdown(void){ s_inited=0; }

static Voice *alloc_voice(void){
    for(int i=0;i<MAXVOICES;i++) if(!voices[i].active) return &voices[i];
    return &voices[0];
}
static void tone(int wave,float f0,float f1,float dur,float vol){
    Voice *v=alloc_voice();
    v->active=1; v->wave=wave; v->freq=f0; v->freqEnd=f1; v->dur=dur; v->t=0; v->vol=vol; v->phase=0;
}
static void noise(float dur,float vol,float cutoff){
    Voice *v=alloc_voice();
    v->active=1; v->wave=2; v->freq=cutoff; v->freqEnd=cutoff; v->dur=dur; v->t=0; v->vol=vol;
}

void audio_sfx(int id){
    if(!s_inited) return;
    float V=(float)vol_sfx/100.0f;
    switch(id){
        case SFX_JUMP: tone(1,300,520,0.14f,0.3f*V); break;
        case SFX_DOUBLEJUMP: tone(1,420,700,0.15f,0.3f*V); break;
        case SFX_WALLJUMP: tone(1,260,480,0.12f,0.3f*V); break;
        case SFX_LAND: noise(0.06f,0.15f*V,800); break;
        case SFX_SWING: noise(0.08f,0.2f*V,2500); tone(3,900,300,0.08f,0.1f*V); break;
        case SFX_HIT: tone(0,220,120,0.08f,0.3f*V); noise(0.05f,0.2f*V,1500); break;
        case SFX_HURT: tone(3,300,80,0.25f,0.35f*V); break;
        case SFX_DASH: noise(0.12f,0.2f*V,3000); tone(4,600,900,0.1f,0.1f*V); break;
        case SFX_PICKUP: tone(0,660,660,0.06f,0.25f*V); tone(0,880,880,0.08f,0.25f*V); break;
        case SFX_COIN: tone(0,900,1400,0.08f,0.25f*V); break;
        case SFX_SHRINE: tone(4,520,520,0.3f,0.2f*V); tone(4,660,660,0.3f,0.2f*V); break;
        case SFX_DOOR: noise(0.2f,0.2f*V,600); break;
        case SFX_MENU: tone(0,500,500,0.05f,0.2f*V); break;
        case SFX_CANCEL: tone(0,300,200,0.08f,0.2f*V); break;
        case SFX_SELECT: tone(0,700,900,0.08f,0.25f*V); break;
        case SFX_EXPLODE: noise(0.3f,0.4f*V,400); tone(3,200,40,0.3f,0.3f*V); break;
        case SFX_BOSSROAR: tone(3,120,60,0.6f,0.5f*V); noise(0.5f,0.3f*V,300); break;
        case SFX_ROAR2: tone(3,160,80,0.4f,0.4f*V); break;
        case SFX_DEATH: tone(3,400,40,0.6f,0.4f*V); break;
        case SFX_HEAL: tone(4,600,900,0.2f,0.25f*V); break;
        case SFX_FIRE: noise(0.15f,0.3f*V,1200); tone(3,300,100,0.15f,0.2f*V); break;
        case SFX_ICE: tone(0,1200,1800,0.1f,0.2f*V); noise(0.08f,0.15f*V,4000); break;
        case SFX_SHATTER: noise(0.15f,0.3f*V,3500); break;
        case SFX_CHEST: tone(0,500,700,0.1f,0.3f*V); tone(0,700,1000,0.12f,0.3f*V); break;
        case SFX_TALK: tone(0,400,420,0.03f,0.15f*V); break;
        case SFX_BOSSHIT: tone(0,180,120,0.06f,0.3f*V); break;
        case SFX_BOSSDIE: noise(0.6f,0.5f*V,500); tone(3,300,30,0.6f,0.4f*V); break;
        case SFX_SPECIAL: tone(4,300,900,0.2f,0.3f*V); break;
        case SFX_SPLASH: noise(0.2f,0.25f*V,900); break;
        case SFX_SAVEWRITE: tone(0,600,600,0.05f,0.2f*V); tone(0,800,800,0.08f,0.2f*V); break;
        case SFX_1UP: tone(0,660,660,0.08f,0.3f*V); tone(0,880,880,0.08f,0.3f*V); tone(0,1100,1100,0.12f,0.3f*V); break;
        default: break;
    }
}

/* ------------------ music data ------------------ */
/* patterns: 16 steps; values are semitone offsets from root or -1 rest. */
typedef struct { int tempo; int root; const signed char *mel; const signed char *bass; int drums; } TrackDef;
static const signed char MEL_VERDANT[32]={0,-1,3,-1,7,-1,3,-1, 5,-1,3,-1,0,-1,-1,-1, 0,-1,3,-1,7,-1,10,-1, 8,-1,7,-1,5,-1,3,-1};
static const signed char BAS_VERDANT[32]={0,-1,-1,-1,0,-1,-1,-1, -4,-1,-1,-1,-4,-1,-1,-1, 3,-1,-1,-1,3,-1,-1,-1, -2,-1,-1,-1,-2,-1,-2,-1};
static const signed char MEL_CISTERN[32]={0,-1,-1,2,-1,-1,3,-1, 5,-1,3,-1,2,-1,0,-1, 0,-1,-1,2,-1,-1,3,-1, 7,-1,5,-1,3,-1,2,-1};
static const signed char BAS_CISTERN[32]={0,-1,0,-1,-1,-1,0,-1, 0,-1,0,-1,-4,-1,-4,-1, 3,-1,3,-1,-1,-1,3,-1, -2,-1,-2,-1,-2,-1,-2,-1};
static const signed char MEL_WARRENS[32]={0,-1,1,-1,3,-1,1,-1, 0,-1,1,-1,5,-1,3,-1, 6,-1,5,-1,3,-1,1,-1, 0,-1,-1,-1,-1,-1,-1,-1};
static const signed char BAS_WARRENS[32]={0,0,-1,0,0,-1,0,0, 0,0,-1,0,0,-1,0,0, 6,6,-1,6,6,-1,6,6, -2,-2,-1,-2,-2,-1,-2,-2};
static const signed char MEL_EMBER[32]={0,-1,-1,-1,3,-1,-1,-1, 5,-1,-1,-1,6,-1,5,-1, 3,-1,-1,-1,0,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1};
static const signed char BAS_EMBER[32]={0,-1,0,-1,0,-1,0,-1, 0,-1,0,-1,0,-1,0,-1, 3,-1,3,-1,3,-1,3,-1, -2,-1,-2,-1,-2,-1,-2,-1};
static const signed char MEL_FROST[32]={7,-1,5,-1,3,-1,5,-1, 7,-1,7,-1,10,-1,7,-1, 8,-1,7,-1,5,-1,3,-1, 2,-1,3,-1,5,-1,-1,-1};
static const signed char BAS_FROST[32]={0,-1,-1,-1,0,-1,-1,-1, -4,-1,-1,-1,-4,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1, -4,-1,-1,-1,-2,-1,-2,-1};
static const signed char MEL_SKY[32]={0,-1,5,-1,7,-1,12,-1, 10,-1,7,-1,5,-1,7,-1, 3,-1,7,-1,10,-1,15,-1, 12,-1,10,-1,7,-1,3,-1};
static const signed char BAS_SKY[32]={0,-1,-1,-1,0,-1,-1,-1, 5,-1,-1,-1,5,-1,-1,-1, 3,-1,-1,-1,3,-1,-1,-1, -2,-1,-1,-1,-2,-1,-2,-1};
static const signed char MEL_CORE[32]={0,-1,1,-1,0,-1,1,-1, 3,-1,1,-1,0,-1,-1,-1, 6,-1,5,-1,3,-1,1,-1, 0,-1,-1,-1,-1,-1,-1,-1};
static const signed char BAS_CORE[32]={0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 6,6,6,6,6,6,6,6, -2,-2,-2,-2,-2,-2,-2,-2};
static const signed char MEL_BOSS[32]={0,-1,0,-1,3,-1,0,-1, 5,-1,3,-1,0,-1,-1,-1, 6,-1,6,-1,5,-1,3,-1, 1,-1,0,-1,-1,-1,-1,-1};
static const signed char BAS_BOSS[32]={0,0,-1,0,0,-1,0,0, 0,0,-1,0,0,-1,0,0, 6,6,-1,6,6,-1,6,6, 1,1,-1,1,1,-1,1,1};

static const TrackDef TRACKS[MUS_COUNT]={
 [MUS_TITLE]   ={100,0,MEL_SKY,BAS_SKY,1},
 [MUS_VERDANT] ={110,0,MEL_VERDANT,BAS_VERDANT,1},
 [MUS_CISTERN] ={95,0,MEL_CISTERN,BAS_CISTERN,1},
 [MUS_WARRENS] ={120,0,MEL_WARRENS,BAS_WARRENS,1},
 [MUS_EMBER]   ={125,0,MEL_EMBER,BAS_EMBER,1},
 [MUS_FROST]   ={90,0,MEL_FROST,BAS_FROST,0},
 [MUS_SKY]     ={115,0,MEL_SKY,BAS_SKY,1},
 [MUS_CORE]    ={110,0,MEL_CORE,BAS_CORE,1},
 [MUS_BOSS]    ={150,0,MEL_BOSS,BAS_BOSS,1},
 [MUS_FINAL]   ={150,0,MEL_CORE,BAS_BOSS,1},
 [MUS_SHRINE]  ={80,0,MEL_FROST,BAS_FROST,0},
 [MUS_ENDING]  ={80,0,MEL_FROST,BAS_FROST,0},
 [MUS_GAMEOVER]={70,0,MEL_CORE,BAS_CORE,0},
 [MUS_SECRET]  ={140,0,MEL_WARRENS,BAS_WARRENS,1},
};

void audio_music(int track){
    if(track==mus_track) return;
    mus_track=track; mus_index=0; mus_step=0;
}
void audio_stop_music(void){ mus_track=MUS_NONE; }

static void music_advance(float dt){
    if(mus_track<=0||mus_track>=MUS_COUNT) return;
    const TrackDef *T=&TRACKS[mus_track];
    float stepDur=60.0f/T->tempo/4.0f;  /* 16th */
    mus_step+=dt;
    while(mus_step>=stepDur){
        mus_step-=stepDur;
        int i=mus_index%32;
        float MV=(float)vol_music/100.0f*0.22f;
        int m=T->mel[i];
        if(m>=-0) {
            if(m>=0) tone(0, note_freq(T->root+m), note_freq(T->root+m), stepDur*1.8f, MV);
        }
        int b=T->bass[i];
        if(b>=0) tone(1, note_freq(T->root+b-12), note_freq(T->root+b-12), stepDur*1.8f, MV*0.9f);
        if(T->drums){
            if(i%8==0) noise(0.1f,MV*0.8f,200);      /* kick */
            if(i%8==4) noise(0.05f,MV*0.5f,4000);    /* hat */
            if(i%16==8) noise(0.08f,MV*0.6f,1500);   /* snare */
        }
        mus_index++;
    }
}

/* ------------------ mixing ------------------ */
static inline float wave_sample(Voice *v){
    switch(v->wave){
        case 0: return v->phase<0.5f?1:-1;
        case 1: return v->phase<0.5f? (v->phase*4-1) : (3-v->phase*4);
        case 2: { nseed=nseed*1664525u+1013904223u; float n=((nseed>>8)&0xFFFF)/32768.0f-1.0f; return n*(v->freq>2000?0.6f:1.0f); }
        case 3: return v->phase*2-1;
        default:return sinf(v->phase*6.28318f);
    }
}
int audio_mix(int16_t *out,int frames){
    if(!s_inited){ memset(out,0,frames*2*sizeof(int16_t)); return frames; }
    float MV=(float)vol_master/100.0f;
    for(int f=0;f<frames;f++){
        float l=0,r=0;
        for(int i=0;i<MAXVOICES;i++){
            Voice *v=&voices[i];
            if(!v->active) continue;
            float p=v->t/v->dur;
            float env= p<0.1f? p/0.1f : (1-p);
            if(env<0)env=0;
            float s=wave_sample(v)*env*v->vol;
            l+=s; r+=s;
            v->phase+=v->freq/(float)SR;
            if(v->phase>=1)v->phase-=1;
            v->freq+= (v->freqEnd-v->freq)*(1.0f/(v->dur*SR))*1.0f;
            v->t+=1.0f/(float)SR;
            if(v->t>=v->dur) v->active=0;
        }
        float mv=MV*0.5f;
        int li=(int)(l*32767*mv), ri=(int)(r*32767*mv);
        out[f*2+0]=(int16_t)CLAMP(li,-32768,32767);
        out[f*2+1]=(int16_t)CLAMP(ri,-32768,32767);
    }
    return frames;
}
void audio_update(void){
    /* advance music with game dt */
    music_advance(DT);
}
