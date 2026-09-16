/* ============================================================================
   ui.c -- HUD, menus, map, dialogue, shop, options, credits
   ========================================================================== */
#include "game.h"
#include <math.h>

static const uint32_t C_BG   = RGB(0x14,0x12,0x22);
static const uint32_t C_PAN  = RGB(0x22,0x1e,0x38);
static const uint32_t C_EDGE = RGB(0x4a,0x42,0x70);
static const uint32_t C_TXT  = RGB(0xe8,0xe4,0xf4);
static const uint32_t C_DIM  = RGB(0x9a,0x94,0xb4);
static const uint32_t C_GOLD = RGB(0xf0,0xbd,0x55);
static const uint32_t C_TEAL = RGB(0x2f,0xb6,0xa8);

void ui_init(void){}

void ui_draw_panel(int x,int y,int w,int h,int style){
    gfx_rect(g_screen,VIEW_W,VIEW_H,x,y,w,h,style? C_BG:C_PAN);
    gfx_frame(g_screen,VIEW_W,VIEW_H,x,y,w,h,C_EDGE);
    gfx_frame(g_screen,VIEW_W,VIEW_H,x+1,y+1,w-2,h-2,RGB(0x10,0x0e,0x1c));
}

void ui_draw_heart(int x,int y,int fill,uint32_t col){
    Sprite *s=art(fill?"ico_heart":"ico_heart_empty");
    if(s) gfx_sprite(g_screen,VIEW_W,VIEW_H,s,x,y);
    (void)col;
}
void ui_draw_icon(int x,int y,int kind,int size){
    const char *n= kind==0?"ico_fish":kind==1?"ico_shard":kind==2?"ico_yarn":kind==3?"ico_lore":"ico_charm";
    Sprite *s=art(n);
    if(s) gfx_sprite(g_screen,VIEW_W,VIEW_H,s,x,y);
    (void)size;
}
void ui_draw_portrait(int x,int y,int kind,int frame){
    const char *n= kind==0?"npc_old":kind==1?"npc_moth":kind==2?"npc_vesper":kind==3?"npc_carto":"cat_idle0";
    Sprite *s=art(n);
    if(s) gfx_sprite_scaled(g_screen,VIEW_W,VIEW_H,s,x,y,2,RGB(0xff,0xff,0xff),TINT_MUL);
    (void)frame;
}

/* ------------------------- HUD ------------------------- */
void ui_render_hud(void){
    Player *p=&G->p;
    /* hearts */
    for(int i=0;i<p->maxhp;i++){
        int hx=8+(i%10)*11, hy=8+(i/10)*10;
        ui_draw_heart(hx,hy,i<p->hp,0);
    }
    /* energy pips */
    for(int i=0;i<p->maxenergy;i++){
        int ex=8+i*9, ey=30;
        uint32_t c=i<p->energy? RGB(0xd1,0x9b,0xff):RGB(0x30,0x2a,0x48);
        gfx_circle_blend(g_screen,VIEW_W,VIEW_H,ex+3,ey+3,3,c);
    }
    /* fish coins */
    ui_draw_icon(8,42,0,0);
    font_text_shadow(g_screen,VIEW_W,VIEW_H,22,42, (char[16]){},0,0);
    char buf[16]; snprintf(buf,sizeof(buf),"x%d",p->fish);
    font_text_shadow(g_screen,VIEW_W,VIEW_H,22,42,buf,C_TXT,RGB(0,0,0));

    /* ability icons bottom-left */
    int ax=8;
    for(int i=0;i<AB_COUNT;i++){
        if(p->abilities[i]){
            gfx_rect(g_screen,VIEW_W,VIEW_H,ax,VIEW_H-16,12,12,C_PAN);
            gfx_frame(g_screen,VIEW_W,VIEW_H,ax,VIEW_H-16,12,12,C_TEAL);
            font_glyph(g_screen,VIEW_W,VIEW_H,ax+3,VIEW_H-13,'A'+i,C_TEAL);
            ax+=15;
        }
    }

    /* room title */
    if(G->roomTitleT>0){
        Room *r=&G->world.rooms[G->world.cur];
        float a=CLAMP(G->roomTitleT/60.0f,0,1);
        font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,40, r->name, RGBA(0xe8,0xe4,0xf4,(int)(a*255)), RGBA(0,0,0,(int)(a*255)));
        font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,52, ZONE_NAMES[r->zone], RGBA(0x9a,0x94,0xb4,(int)(a*255)), RGBA(0,0,0,(int)(a*255)));
    }

    /* controls hint first moments */
    if(G->p.playtime<8 && G->state==ST_PLAY){
        font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H-24,"ARROWS/WASD MOVE  Z JUMP  X ATTACK  C DASH  V SPECIAL",C_DIM,RGB(0,0,0));
    }
}

void ui_render_msg(void){
    if(G->msgT<=0) return;
    float a=CLAMP(G->msgT/40.0f,0,1);
    int w=font_width(G->msg)+16;
    ui_draw_panel(VIEW_W/2-w/2,VIEW_H-40,w,20,1);
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H-34,G->msg,RGBA(0xe8,0xe4,0xf4,(int)(a*255)),0);
}

void ui_render_bossbar(void){
    if(!G->boss.active||G->bossBarT<=0) return;
    Boss *b=&G->boss;
    int w=VIEW_W-160;
    ui_draw_panel(80,VIEW_H-26,w+4,16,1);
    float f=CLAMP((float)b->hp/b->maxhp,0,1);
    gfx_rect(g_screen,VIEW_W,VIEW_H,82,VIEW_H-24,(int)(w*f),12,RGB(0xd9,0x4f,0x4f));
    gfx_rect(g_screen,VIEW_W,VIEW_H,82,VIEW_H-24,(int)(w*f),4,RGB(0xff,0x90,0x90));
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H-40,b->name,RGB(0xff,0xd0,0xd0),RGB(0,0,0));
}

/* ------------------------- title ------------------------- */
void ui_render_title(void){
    gfx_clear(RGB(0x0a,0x08,0x14));
    /* starfield */
    for(int i=0;i<80;i++){
        int x=(i*97+G->titleT/ (1+i%3))%VIEW_W;
        int y=(i*57)%VIEW_H;
        gfx_px(g_screen,VIEW_W,VIEW_H,x,y,RGB(0x60,0x5a,0x80));
    }
    /* big cat emblem */
    Sprite *c=art("cat_idle0");
    if(c) gfx_sprite_scaled(g_screen,VIEW_W,VIEW_H,c,VIEW_W/2-36,90,4,RGB(0xff,0xff,0xff),TINT_MUL);
    /* logo */
    int y=60+ (int)(sinf(G->titleT*0.05f)*4);
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,y, MD_TITLE, C_GOLD, RGB(0,0,0));
    /* bigger fake: draw with scale by repeating */
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,y+14,"A CAT, A SWORD, NINE LIVES",C_TEAL,RGB(0,0,0));
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H-60,(G->frame/30)%2? "PRESS ENTER":"",C_TXT,0);
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H-40,"M = OPTIONS",C_DIM,0);
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H-16,"v"MD_VERSION" - built for Windows",C_DIM,0);
}

/* ------------------------- menu ------------------------- */
static const char *MENU_ITEMS[]={"CONTINUE","NEW GAME","OPTIONS","QUIT"};
void ui_update_menu(void){
    InputState *in=&G->in;
    if(in->pressed&(1<<BTN_UP)){G->menuSel=(G->menuSel+3)%4;audio_sfx(SFX_MENU);}
    if(in->pressed&(1<<BTN_DOWN)){G->menuSel=(G->menuSel+1)%4;audio_sfx(SFX_MENU);}
    if(in->pressed&(1<<BTN_CONFIRM)){
        audio_sfx(SFX_SELECT);
        if(G->menuSel==0){ game_load_slot(0); }
        else if(G->menuSel==1){ game_new(); }
        else if(G->menuSel==2){ G->state=ST_OPTIONS; G->optSel=0; }
        else { G->quit=1; }
    }
    if(in->pressed&(1<<BTN_CANCEL)){ G->state=ST_TITLE; }
}
void ui_render_menu(void){
    ui_draw_panel(VIEW_W/2-90,VIEW_H/2-50,180,100,0);
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H/2-42,"MAIN MENU",C_GOLD,RGB(0,0,0));
    for(int i=0;i<4;i++){
        uint32_t c=i==G->menuSel? C_TEAL:C_TXT;
        const char *pre=i==G->menuSel?"> ":"  ";
        char line[40]; snprintf(line,sizeof(line),"%s%s",pre,MENU_ITEMS[i]);
        font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H/2-24+i*18,line,c,0);
    }
}

/* ------------------------- pause ------------------------- */
void ui_update_pause(void){
    InputState *in=&G->in;
    if(in->pressed&(1<<BTN_PAUSE)||in->pressed&(1<<BTN_CANCEL)){G->state=ST_PLAY;audio_sfx(SFX_CANCEL);return;}
    if(in->pressed&(1<<BTN_UP)){G->menuSel=(G->menuSel+2)%3;audio_sfx(SFX_MENU);}
    if(in->pressed&(1<<BTN_DOWN)){G->menuSel=(G->menuSel+1)%3;audio_sfx(SFX_MENU);}
    if(in->pressed&(1<<BTN_CONFIRM)){
        audio_sfx(SFX_SELECT);
        if(G->menuSel==0)G->state=ST_PLAY;
        else if(G->menuSel==1){game_save();game_msg("Game saved.");}
        else {G->state=ST_TITLE; audio_stop_music();}
    }
}
void ui_render_pause(void){
    gfx_rect_blend(g_screen,VIEW_W,VIEW_H,0,0,VIEW_W,VIEW_H,RGBA(0,0,0,150));
    ui_draw_panel(VIEW_W/2-80,VIEW_H/2-45,160,90,0);
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H/2-38,"PAUSED",C_GOLD,RGB(0,0,0));
    const char *it[3]={"RESUME","SAVE","QUIT TO TITLE"};
    for(int i=0;i<3;i++){
        uint32_t c=i==G->menuSel?C_TEAL:C_TXT;
        font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H/2-18+i*18,it[i],c,0);
    }
}

/* ------------------------- map ------------------------- */
void ui_update_map(void){
    InputState *in=&G->in;
    if(in->pressed&(1<<BTN_MAP)||in->pressed&(1<<BTN_CANCEL)){G->state=ST_PLAY;audio_sfx(SFX_CANCEL);}
}
void ui_render_map(void){
    gfx_rect_blend(g_screen,VIEW_W,VIEW_H,0,0,VIEW_W,VIEW_H,RGBA(0,0,0,200));
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,12,"WORLD MAP",C_GOLD,RGB(0,0,0));
    int cx=VIEW_W/2 - G->world.rooms[G->world.cur].roomX*26;
    int cy=VIEW_H/2 - G->world.rooms[G->world.cur].roomY*26;
    for(int i=0;i<G->world.nRooms;i++){
        Room *r=&G->world.rooms[i];
        if(!G->world.st[i].discovered) continue;
        int x=cx+r->roomX*26, y=cy+r->roomY*26;
        uint32_t col = i==G->world.cur? C_GOLD : (G->world.st[i].visited? C_TEAL : C_DIM);
        gfx_rect(g_screen,VIEW_W,VIEW_H,x,y,20,16,C_PAN);
        gfx_frame(g_screen,VIEW_W,VIEW_H,x,y,20,16,col);
        if(r->boss>=0) font_glyph(g_screen,VIEW_W,VIEW_H,x+7,y+4,'!',G->world.st[i].cleared?C_DIM:RGB(0xd9,0x4f,0x4f));
        if(i==G->world.cur) gfx_frame(g_screen,VIEW_W,VIEW_H,x-2,y-2,24,20,C_GOLD);
    }
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H-16,"M / ESC to close",C_DIM,0);
}

/* ------------------------- dialog ------------------------- */
void ui_update_dialog(void){
    Dialogue *d=&G->dlg;
    InputState *in=&G->in;
    d->chrT+=1;
    int len=(int)strlen(d->lines[d->line]);
    if(d->chr<len){ d->chr=(int)MIN(len,d->chr+ (d->chrT/1)); if(in->pressed&(1<<BTN_CONFIRM))d->chr=len; }
    else if(in->pressed&(1<<BTN_CONFIRM)){
        d->line++; d->chr=0; d->chrT=0; audio_sfx(SFX_TALK);
        if(d->line>=d->nLines){ d->active=0; G->state=ST_PLAY; audio_sfx(SFX_CANCEL); }
    }
}
void ui_render_dialog(void){
    Dialogue *d=&G->dlg;
    int h=52;
    ui_draw_panel(20,VIEW_H-h-12,VIEW_W-40,h,0);
    if(d->speaker[0]){
        font_text(g_screen,VIEW_W,VIEW_H,30,VIEW_H-h-6,d->speaker,C_TEAL);
    }
    if(d->portrait>=0) ui_draw_portrait(26,VIEW_H-h-4,d->portrait,0);
    char line[160];
    snprintf(line,sizeof(line),"%.*s",d->chr,d->lines[d->line]);
    int tx=d->portrait>=0? 66:30;
    /* wrap simple */
    font_text(g_screen,VIEW_W,VIEW_H,tx,VIEW_H-h+6,line,C_TXT);
    font_text(g_screen,VIEW_W,VIEW_H,VIEW_W-40,VIEW_H-22,(G->frame/20)%2?"v":"",C_DIM);
}

/* ------------------------- item get ------------------------- */
void ui_render_itemget(void){
    int w=220,h=54;
    ui_draw_panel(VIEW_W/2-w/2,60,w,h,0);
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,68,"NEW!",C_GOLD,RGB(0,0,0));
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,82,G->itemName,C_TEAL,RGB(0,0,0));
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,96,G->itemDesc,C_TXT,0);
}

/* ------------------------- shop ------------------------- */
const ShopItem *ui_shop_items(int shopId,int *count){
    static ShopItem items[8];
    int n=0;
    items[n++]=(ShopItem){"Heart Shard","A fragment of a greater heart. 4 = +1 HP.",60,1,0};
    items[n++]=(ShopItem){"Energy Yarn","Woven focus. 3 = +1 energy.",50,2,0};
    items[n++]=(ShopItem){"Swift Paw Charm","+18% move speed.",CHARM_COST[CH_SWIFT],4,CH_SWIFT};
    items[n++]=(ShopItem){"Iron Fur Charm","Take 1 less damage.",CHARM_COST[CH_IRON],4,CH_IRON};
    items[n++]=(ShopItem){"Lucky Fish Charm","Better drops.",CHARM_COST[CH_LUCK],4,CH_LUCK};
    items[n++]=(ShopItem){"Full Heal","Restore all health.",30,6,0};
    *count=n;
    (void)shopId;
    return items;
}
void ui_update_shop(void){
    InputState *in=&G->in;
    int count; const ShopItem *it=ui_shop_items(G->shopId,&count);
    if(in->pressed&(1<<BTN_CANCEL)){G->state=ST_PLAY;audio_sfx(SFX_CANCEL);return;}
    if(in->pressed&(1<<BTN_UP)){G->shopSel=(G->shopSel+count-1)%count;audio_sfx(SFX_MENU);}
    if(in->pressed&(1<<BTN_DOWN)){G->shopSel=(G->shopSel+1)%count;audio_sfx(SFX_MENU);}
    if(in->pressed&(1<<BTN_CONFIRM)){
        const ShopItem *s=&it[G->shopSel];
        if(G->p.fish>=s->price){
            G->p.fish-=s->price; audio_sfx(SFX_COIN);
            if(s->kind==1){G->p.shards++; if(G->p.shards>=4){G->p.shards=0;G->p.maxhp++;G->p.hp=G->p.maxhp;}}
            else if(s->kind==2){G->p.yarn++; if(G->p.yarn>=3){G->p.yarn=0;G->p.maxenergy++;G->p.energy=G->p.maxenergy;}}
            else if(s->kind==4){ for(int i=0;i<3;i++) if(G->p.charmSlots[i]==CH_NONE){G->p.charmSlots[i]=s->val;break;} }
            else if(s->kind==6){G->p.hp=G->p.maxhp;}
        } else audio_sfx(SFX_CANCEL);
    }
}
void ui_render_shop(void){
    int count; const ShopItem *it=ui_shop_items(G->shopId,&count);
    gfx_rect_blend(g_screen,VIEW_W,VIEW_H,0,0,VIEW_W,VIEW_H,RGBA(0,0,0,180));
    int w=280,h=170;
    ui_draw_panel(VIEW_W/2-w/2,40,w,h,0);
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,48,"MERCHANT",C_GOLD,RGB(0,0,0));
    char fb[24]; snprintf(fb,sizeof(fb),"FISH: %d",G->p.fish);
    font_text(g_screen,VIEW_W,VIEW_H,VIEW_W/2+w/2-70,48,fb,C_TEAL);
    for(int i=0;i<count;i++){
        int y=64+i*18;
        uint32_t c=i==G->shopSel?C_TEAL:C_TXT;
        char line[64]; snprintf(line,sizeof(line),"%s - %d",it[i].name,it[i].price);
        font_text(g_screen,VIEW_W,VIEW_H,VIEW_W/2-w/2+12,y,(i==G->shopSel?"> ":""),c);
        font_text(g_screen,VIEW_W,VIEW_H,VIEW_W/2-w/2+24,y,line,c);
        if(i==G->shopSel) font_text(g_screen,VIEW_W,VIEW_H,VIEW_W/2-w/2+12,y+9,it[i].desc,C_DIM);
    }
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,40+h-14,"Z buy  /  X close",C_DIM,0);
}

/* ------------------------- options ------------------------- */
static const char *OPT_ITEMS[]={"MUSIC VOLUME","SFX VOLUME","SCREEN SHAKE","DIFFICULTY","FULLSCREEN","BACK"};
void ui_update_options(void){
    InputState *in=&G->in;
    if(in->pressed&(1<<BTN_CANCEL)){G->state=ST_TITLE;audio_sfx(SFX_CANCEL);return;}
    if(in->pressed&(1<<BTN_UP)){G->optSel=(G->optSel+5)%6;audio_sfx(SFX_MENU);}
    if(in->pressed&(1<<BTN_DOWN)){G->optSel=(G->optSel+1)%6;audio_sfx(SFX_MENU);}
    if(in->pressed&(1<<BTN_LEFT)||in->pressed&(1<<BTN_RIGHT)){
        int d=in->pressed&(1<<BTN_RIGHT)?5:-5;
        if(G->optSel==0)G->musicVol=CLAMP(G->musicVol+d,0,100);
        if(G->optSel==1)G->sfxVol=CLAMP(G->sfxVol+d,0,100);
        if(G->optSel==2)G->shakeOn=!G->shakeOn;
        if(G->optSel==3)G->difficulty=!G->difficulty;
        if(G->optSel==4)G->fullscreen=!G->fullscreen;
        audio_set_volume(G->masterVol,G->musicVol,G->sfxVol);
    }
    if(in->pressed&(1<<BTN_CONFIRM)){
        if(G->optSel==5){G->state=ST_TITLE;audio_sfx(SFX_CANCEL);}
    }
}
void ui_render_options(void){
    ui_draw_panel(VIEW_W/2-110,60,220,150,0);
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,68,"OPTIONS",C_GOLD,RGB(0,0,0));
    for(int i=0;i<6;i++){
        int y=86+i*18;
        uint32_t c=i==G->optSel?C_TEAL:C_TXT;
        char val[16];
        if(i==0)snprintf(val,sizeof(val),"%d",G->musicVol);
        else if(i==1)snprintf(val,sizeof(val),"%d",G->sfxVol);
        else if(i==2)snprintf(val,sizeof(val),"%s",G->shakeOn?"ON":"OFF");
        else if(i==3)snprintf(val,sizeof(val),"%s",G->difficulty?"HARD":"NORMAL");
        else if(i==4)snprintf(val,sizeof(val),"%s",G->fullscreen?"FULL":"WIN");
        else val[0]=0;
        char line[48]; snprintf(line,sizeof(line),"%-14s %s",OPT_ITEMS[i],val);
        font_text(g_screen,VIEW_W,VIEW_H,VIEW_W/2-100,y,line,c);
    }
}

/* ------------------------- lore ------------------------- */
void ui_update_lore(void){
    InputState *in=&G->in;
    if(in->pressed&(1<<BTN_CANCEL)||in->pressed&(1<<BTN_CONFIRM)){G->state=ST_PAUSE;audio_sfx(SFX_CANCEL);}
}
void ui_render_lore(void){
    gfx_rect_blend(g_screen,VIEW_W,VIEW_H,0,0,VIEW_W,VIEW_H,RGBA(0,0,0,200));
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,20,"LORE TABLETS",C_GOLD,RGB(0,0,0));
    int y=40;
    for(int i=0;i<12;i++){
        const char **t=lore_text(i);
        uint32_t c=G->p.lore[i]?C_TXT:C_DIM;
        char line[64];
        snprintf(line,sizeof(line),"%d. %s",i+1,G->p.lore[i]?t[0]:"???");
        font_text(g_screen,VIEW_W,VIEW_H,40,y,line,c);
        y+=12;
    }
}

/* ------------------------- ending / credits ------------------------- */
void ui_render_ending(void){
    gfx_clear(RGB(0x0a,0x08,0x14));
    int t=G->creditsT;
    const char *L[6]={
      "The Metrodivinia opened its eye,",
      "and the world blinked with it.",
      "",
      "Mira sheathed her sword,",
      "and for the first time in nine lives,",
      "she simply purred."};
    for(int i=0;i<6;i++){
        if(t> i*40){
            float a=CLAMP((t-i*40)/40.0f,0,1);
            font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,100+i*22,L[i],RGBA(0xe8,0xe4,0xf4,(int)(a*255)),0);
        }
    }
    font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,VIEW_H-20,"ENTER to continue",C_DIM,0);
}
void ui_render_credits(void){
    gfx_clear(RGB(0x0a,0x08,0x14));
    int y=VIEW_H - G->creditsT/2;
    const char *C[]={
      "METRODIVINIA","","a metroidvania about a cat with a sword","","",
      "design / code / art / audio","   the Metrodivinia team","","",
      "engine","   hand-rolled C, software renderer","","",
      "built with","   zig cc (Windows) + gcc (tests)","","",
      "thank you for playing","","   meow."};
    int n=(int)(sizeof(C)/sizeof(C[0]));
    for(int i=0;i<n;i++) font_text_center(g_screen,VIEW_W,VIEW_H,VIEW_W/2,y+i*20,C[i],i==0?C_GOLD:C_TXT,0);
}
