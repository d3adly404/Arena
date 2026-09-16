/* ============================================================================
   platform_win32.c -- Windows: window, GDI, keyboard, waveOut audio, save IO
   Build: see tools/build_windows.py
   ========================================================================== */
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmsystem.h>
#include <stdio.h>
#include <string.h>
#include "game.h"

static HWND g_hwnd;
static HDC g_hdcMem;
static HBITMAP g_hbmp;
static uint32_t *g_dib;
static int g_scale=3;
static int g_run=1;

/* ---------------- input ---------------- */
static uint32_t prevHeld=0;
static int keymap(int btn){ return 0; }
static uint32_t read_keys(void){
    uint32_t h=0;
    if(GetAsyncKeyState(VK_LEFT)&0x8000) h|=1<<BTN_LEFT;
    if(GetAsyncKeyState('A')&0x8000) h|=1<<BTN_LEFT;
    if(GetAsyncKeyState(VK_RIGHT)&0x8000) h|=1<<BTN_RIGHT;
    if(GetAsyncKeyState('D')&0x8000) h|=1<<BTN_RIGHT;
    if(GetAsyncKeyState(VK_UP)&0x8000) h|=1<<BTN_UP;
    if(GetAsyncKeyState('W')&0x8000) h|=1<<BTN_UP;
    if(GetAsyncKeyState(VK_DOWN)&0x8000) h|=1<<BTN_DOWN;
    if(GetAsyncKeyState('S')&0x8000) h|=1<<BTN_DOWN;
    if(GetAsyncKeyState('Z')&0x8000||GetAsyncKeyState('K')&0x8000||GetAsyncKeyState(VK_SPACE)&0x8000) h|=1<<BTN_JUMP;
    if(GetAsyncKeyState('X')&0x8000||GetAsyncKeyState('J')&0x8000) h|=1<<BTN_ATTACK;
    if(GetAsyncKeyState('C')&0x8000||GetAsyncKeyState('L')&0x8000||GetAsyncKeyState(VK_SHIFT)&0x8000) h|=1<<BTN_DASH;
    if(GetAsyncKeyState('V')&0x8000) h|=1<<BTN_SPECIAL;
    if(GetAsyncKeyState('M')&0x8000||GetAsyncKeyState(VK_TAB)&0x8000) h|=1<<BTN_MAP;
    if(GetAsyncKeyState(VK_ESCAPE)&0x8000||GetAsyncKeyState('P')&0x8000) h|=1<<BTN_PAUSE;
    if(GetAsyncKeyState(VK_RETURN)&0x8000||GetAsyncKeyState('Z')&0x8000) h|=1<<BTN_CONFIRM;
    if(GetAsyncKeyState('X')&0x8000||GetAsyncKeyState(VK_ESCAPE)&0x8000) h|=1<<BTN_CANCEL;
    return h;
}
void platform_get_input(InputState *in){
    uint32_t h=read_keys();
    in->held=h;
    in->pressed=h & ~prevHeld;
    in->released=prevHeld & ~h;
    prevHeld=h;
    in->ax=((h&(1<<BTN_RIGHT))?1:0)-((h&(1<<BTN_LEFT))?1:0);
    in->ay=((h&(1<<BTN_DOWN))?1:0)-((h&(1<<BTN_UP))?1:0);
}

/* ---------------- present ---------------- */
void platform_present(const uint32_t *fb){
    if(!g_hwnd) return;
    memcpy(g_dib,fb,VIEW_W*VIEW_H*4);
    HDC hdc=GetDC(g_hwnd);
    RECT rc; GetClientRect(g_hwnd,&rc);
    SetStretchBltMode(hdc,COLORONCOLOR);
    StretchBlt(hdc,0,0,rc.right,rc.bottom,g_hdcMem,0,0,VIEW_W,VIEW_H,SRCCOPY);
    ReleaseDC(g_hwnd,hdc);
}

/* ---------------- audio (waveOut) ---------------- */
#define BUF_FRAMES 1024
#define NBUF 4
static HWAVEOUT g_wo=NULL;
static WAVEHDR g_hdr[NBUF];
static short g_buf[NBUF][BUF_FRAMES*2];
static int g_bufIdx=0;
static void audio_thread_init(void){
    WAVEFORMATEX wf={0};
    wf.wFormatTag=WAVE_FORMAT_PCM; wf.nChannels=2; wf.nSamplesPerSec=44100;
    wf.wBitsPerSample=16; wf.nBlockAlign=4; wf.nAvgBytesPerSec=44100*4;
    if(waveOutOpen(&g_wo,WAVE_MAPPER,&wf,(DWORD_PTR)NULL,0,CALLBACK_NULL)!=MMSYSERR_NOERROR) return;
    for(int i=0;i<NBUF;i++){
        memset(&g_hdr[i],0,sizeof(WAVEHDR));
        g_hdr[i].lpData=(LPSTR)g_buf[i];
        g_hdr[i].dwBufferLength=BUF_FRAMES*4;
        waveOutPrepareHeader(g_wo,&g_hdr[i],sizeof(WAVEHDR));
        audio_mix(g_buf[i],BUF_FRAMES);
        waveOutWrite(g_wo,&g_hdr[i],sizeof(WAVEHDR));
    }
}
void platform_audio_pump(void){
    if(!g_wo) return;
    for(int i=0;i<NBUF;i++){
        if(g_hdr[i].dwFlags&WHDR_DONE){
            waveOutUnprepareHeader(g_wo,&g_hdr[i],sizeof(WAVEHDR));
            g_hdr[i].dwFlags=0;
            waveOutPrepareHeader(g_wo,&g_hdr[i],sizeof(WAVEHDR));
            audio_mix(g_buf[i],BUF_FRAMES);
            waveOutWrite(g_wo,&g_hdr[i],sizeof(WAVEHDR));
        }
    }
}

/* ---------------- time / io ---------------- */
uint64_t platform_ticks_ms(void){ return (uint64_t)GetTickCount64(); }
void platform_delay_ms(int ms){ Sleep(ms); }
int platform_write_file(const char *path,const void *data,int len){
    FILE *f=fopen(path,"wb"); if(!f)return 0;
    int n=(int)fwrite(data,1,len,f); fclose(f); return n;
}
int platform_read_file(const char *path,void *data,int maxlen){
    FILE *f=fopen(path,"rb"); if(!f)return 0;
    int n=(int)fread(data,1,maxlen,f); fclose(f); return n;
}
void platform_save_path(char *out,int maxlen,const char *name){
    char dir[MAX_PATH];
    GetModuleFileNameA(NULL,dir,MAX_PATH);
    char *slash=strrchr(dir,'\\'); if(slash)*slash=0;
    snprintf(out,maxlen,"%s\\%s",dir,name);
}

/* ---------------- window proc ---------------- */
static LRESULT CALLBACK WndProc(HWND h,UINT m,WPARAM w,LPARAM l){
    switch(m){
        case WM_CLOSE: g_run=0; return 0;
        case WM_DESTROY: PostQuitMessage(0); return 0;
        case WM_KEYDOWN: if(w==VK_F11){ /* toggle fullscreen-ish */ } return 0;
    }
    return DefWindowProcW(h,m,w,l);
}

int WINAPI WinMain(HINSTANCE hi,HINSTANCE hp,LPSTR cmd,int show){
    (void)hp;(void)cmd;
    WNDCLASSW wc={0};
    wc.lpfnWndProc=WndProc; wc.hInstance=hi; wc.lpszClassName=L"Metrodivinia";
    wc.hCursor=LoadCursor(NULL,IDC_ARROW);
    RegisterClassW(&wc);
    int w=VIEW_W*g_scale,h=VIEW_H*g_scale;
    RECT wr={0,0,w,h}; AdjustWindowRect(&wr,WS_OVERLAPPEDWINDOW,FALSE);
    g_hwnd=CreateWindowW(L"Metrodivinia",L"METRODIVINIA",WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT,CW_USEDEFAULT,wr.right-wr.left,wr.bottom-wr.top,NULL,NULL,hi,NULL);
    ShowWindow(g_hwnd,show);

    HDC hdc=GetDC(g_hwnd);
    g_hdcMem=CreateCompatibleDC(hdc);
    BITMAPINFO bi={0};
    bi.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth=VIEW_W; bi.bmiHeader.biHeight=-VIEW_H;
    bi.bmiHeader.biPlanes=1; bi.bmiHeader.biBitCount=32; bi.bmiHeader.biCompression=BI_RGB;
    g_hbmp=CreateDIBSection(hdc,&bi,DIB_RGB_COLORS,(void**)&g_dib,NULL,0);
    SelectObject(g_hdcMem,g_hbmp);
    ReleaseDC(g_hwnd,hdc);

    gfx_init(); art_init(); font_init(); game_init();
    audio_init(44100);
    audio_thread_init();
    audio_set_volume(G->masterVol,G->musicVol,G->sfxVol);

    uint64_t prev=platform_ticks_ms();
    double acc=0;
    MSG msg;
    while(g_run){
        while(PeekMessageW(&msg,NULL,0,0,PM_REMOVE)){
            if(msg.message==WM_QUIT){g_run=0;break;}
            TranslateMessage(&msg); DispatchMessageW(&msg);
        }
        uint64_t now=platform_ticks_ms();
        double dt=(now-prev)/1000.0; prev=now;
        if(dt>0.25)dt=0.25;
        acc+=dt;
        while(acc>=DT){
            platform_get_input(&G->in);
            game_update();
            audio_update();
            acc-=DT;
        }
        game_render();
        platform_present(g_screen);
        platform_audio_pump();
        platform_delay_ms(1);
    }
    audio_shutdown();
    return 0;
}

int main(void){
    return WinMain(GetModuleHandleW(NULL),NULL,GetCommandLineA(),SW_SHOW);
}
#endif /* _WIN32 */
