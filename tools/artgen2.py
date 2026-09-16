#!/usr/bin/env python3
"""
artgen2.py -- second-pass pixel art: raster engine with outlines + shading for
real "depth", a fully re-animated procedural cat, and an enhance pass over the
base enemy/boss/item art.  Emits src/art_data.h as raw uint32 pixels.

Run: python3 tools/artgen2.py
"""
import os, sys, struct, math, importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("artgen", os.path.join(ROOT, "tools", "artgen.py"))
_base = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_base)
OLD = _base.SPR
PAL = _base.PAL

OUT = {}   # name -> (w,h,[uint32...])

def RGBc(r,g,b): return (r<<16)|(g<<8)|b

# ---------------- raster canvas ----------------
def C(w,h): return [[None]*w for _ in range(h)]
def put(c,x,y,col):
    h=len(c); w=len(c[0])
    if 0<=x<w and 0<=y<h: c[y][x]=col
def get(c,x,y):
    h=len(c); w=len(c[0])
    if 0<=x<w and 0<=y<h: return c[y][x]
    return None
def ell(c,cx,cy,rx,ry,col):
    for y in range(int(cy-ry),int(cy+ry)+1):
        for x in range(int(cx-rx),int(cx+rx)+1):
            if rx>0 and ry>0 and ((x-cx)**2/(rx*rx)+(y-cy)**2/(ry*ry))<=1.0:
                put(c,x,y,col)
def circ(c,cx,cy,r,col): ell(c,cx,cy,r,r,col)
def rect(c,x0,y0,w,h,col):
    for y in range(y0,y0+h):
        for x in range(x0,x0+w): put(c,x,y,col)
def line(c,x0,y0,x1,y1,col,t=1):
    dx=abs(x1-x0); dy=abs(y1-y0); n=max(dx,dy,1)
    for i in range(n+1):
        x=int(x0+(x1-x0)*i/n); y=int(y0+(y1-y0)*i/n)
        for a in range(t):
            for b in range(t): put(c,x+a-(t//2),y+b-(t//2),col)
def tri(c,p0,p1,p2,col):
    ys=[p0[1],p1[1],p2[1]]
    for y in range(min(ys),max(ys)+1):
        xs=[]
        pts=[p0,p1,p2]
        for i in range(3):
            a=pts[i]; b=pts[(i+1)%3]
            if (a[1]<=y<b[1]) or (b[1]<=y<a[1]):
                t=(y-a[1])/float(b[1]-a[1]); xs.append(a[0]+(b[0]-a[0])*t)
        if len(xs)>=2:
            xs.sort()
            for x in range(int(xs[0]),int(xs[1])+1): put(c,x,y,col)

def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))

def outline(c,col):
    h=len(c); w=len(c[0]); out=[row[:] for row in c]
    for y in range(h):
        for x in range(w):
            if c[y][x] is None:
                for dx,dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
                    if get(c,x+dx,y+dy) is not None:
                        out[y][x]=col; break
    return out

def shade(c, hi, sh, top=0.35, bot=0.4):
    h=len(c); w=len(c[0])
    for y in range(h):
        for x in range(w):
            col=c[y][x]
            if col is None: continue
            t=y/float(h)
            if t<top: col=lerp(col,hi,(top-t)/top*0.6)
            elif t>bot+0.3: col=lerp(col,sh,(t-(bot+0.3))/(1-(bot+0.3))*0.5)
            # rim light on top edge
            if get(c,x,y-1) is None: col=lerp(col,hi,0.7)
            # bottom shadow
            if get(c,x,y+1) is None: col=lerp(col,sh,0.6)
            c[y][x]=col
    return c

def to_raw(c):
    h=len(c); w=len(c[0]); out=[]
    for y in range(h):
        for x in range(w):
            col=c[y][x]
            out.append(RGBc(*col) if col is not None else 0)
    return w,h,out

def store(name,c):
    w,h,raw=to_raw(c); OUT[name]=(w,h,raw)

def enhance_from_ascii(name):
    w,h,art,_=OLD[name]
    c=C(w,h)
    for y in range(h):
        for x in range(w):
            ch=art[y][x]
            if ch!='.': c[y][x]=PAL[ch]
    # depth: outline then shade using a neutral hi/sh
    c=outline(c,(0x14,0x10,0x22))
    c=shade(c,(0xff,0xff,0xff),(0x00,0x00,0x00),0.3,0.45)
    store(name,c)

# ================= palette for the cat =================
O   =(0x17,0x12,0x26)
FD  =(0x3a,0x3f,0x5c)
F   =(0x5b,0x62,0x88)
FL  =(0x8a,0x92,0xbd)
FH  =(0xc3,0xcb,0xe8)
BL  =(0xe8,0xec,0xfa)
EY  =(0x59,0xe0,0x8b)
ED  =(0x0e,0x2b,0x1d)
NW  =(0xff,0x8a,0xa5)
SC  =(0x2f,0xb6,0xa8)
SCD =(0x1a,0x7d,0x78)
SCL =(0x6f,0xe0,0xd2)

W,H=24,30

def draw_legs(c,phase,amp,hipy,front_x,back_x,col=FD):
    a=math.sin(phase*math.pi*2)*amp
    b=math.sin(phase*math.pi*2+math.pi)*amp
    # back leg
    line(c,back_x,hipy,back_x+int(b),hipy+7,col,2)
    put(c,back_x+int(b),hipy+7,FH); put(c,back_x+int(b)+1,hipy+7,FH)
    # front leg
    line(c,front_x,hipy,front_x+int(a),hipy+7,col,2)
    put(c,front_x+int(a),hipy+7,FH); put(c,front_x+int(a)+1,hipy+7,FH)

def draw_cat(legs=None, bob=0, lean=0, pose='idle', eyes='open', mouth=False, tuck=0):
    c=C(W,H)
    hy=8+bob
    # ears
    tri(c,(7,hy-2),(5,hy-8),(10,hy-5),F)
    tri(c,(17,hy-2),(19,hy-8),(14,hy-5),F)
    tri(c,(7,hy-3),(6,hy-6),(9,hy-4),NW)   # inner
    tri(c,(17,hy-3),(18,hy-6),(15,hy-4),NW)
    # head
    ell(c,12,hy,7,6,F)
    ell(c,12,hy-1,6,5,FL)  # top light
    # muzzle
    ell(c,13,hy+3,3,2,BL)
    put(c,14,hy+2,NW); put(c,15,hy+2,NW)   # nose
    if mouth: rect(c,13,hy+4,3,1,ED)
    # eyes
    if eyes=='open':
        for ex in (8,14):
            ell(c,ex,hy,1.6,2,EY); put(c,ex,hy+0,ED); put(c,ex-1,hy-1,(0xff,0xff,0xff))
    elif eyes=='shut':
        line(c,7,hy,10,hy,ED,1); line(c,13,hy,16,hy,ED,1)
    elif eyes=='angry':
        for ex in (8,14):
            ell(c,ex,hy,1.6,1.6,EY); put(c,ex,hy,ED)
        line(c,6,hy-3,10,hy-1,O,1); line(c,18,hy-3,14,hy-1,O,1)
    # scarf
    rect(c,6,hy+5,13,2,SC); rect(c,6,hy+5,13,1,SCL)
    rect(c,5,hy+6,2,4,SCD)  # trailing end
    # body
    by=20+bob
    ell(c,12,by,6,6,F)
    ell(c,12,by+1,4,4,BL)  # belly
    # legs
    if legs is None:
        draw_legs(c,0,0,by+4,15,9)
    else:
        draw_legs(c,legs,3,by+4,15,9)
    if tuck:  # jump tuck
        rect(c,9,by+5,3,2,FD); rect(c,14,by+5,3,2,FD)
    # arms
    if pose=='atk':
        line(c,15,by-2,21,by-2,F,2); put(c,21,by-2,FH)
    elif pose=='up':
        line(c,15,by-2,19,by-7,F,2)
    elif pose=='down':
        line(c,15,by,20,by+4,F,2)
    else:
        line(c,15,by-1,17,by+3,FD,2)
    c=outline(c,O)
    c=shade(c,FH,FD,0.3,0.5)
    return c

def draw_tail(phase=0):
    c=C(14,16)
    pts=[]
    for i in range(12):
        t=i/11.0
        x=2+int(t*8)
        y=14-int(t*12)+int(math.sin(phase*math.pi*2+t*3)*1.5*t)
        pts.append((x,y))
    for i in range(len(pts)-1):
        line(c,pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],F,2)
    put(c,pts[-1][0],pts[-1][1],FH); put(c,pts[-1][0]+1,pts[-1][1],FH)
    c=outline(c,O)
    return c

def draw_sword():
    c=C(7,26)
    for y in range(0,18):
        wdt=1 if y>2 else 2
        line(c,3, y,3,y, (0xe6,0xf6,0xff),1)
        put(c,2,y,(0x9d,0xc6,0xdd))
    put(c,3,0,(0xff,0xff,0xff))
    rect(c,1,18,5,2,(0xf0,0xbd,0x55))
    rect(c,2,20,3,3,(0x9a,0x6a,0x24))
    rect(c,3,23,1,3,(0x9a,0x6a,0x24))
    c=outline(c,O)
    return c

def draw_slash(r):
    s=26
    c=C(s,s)
    cx=cy=s//2
    for i in range(60):
        a=(i/60.0)*math.pi*1.5 - math.pi*0.75
        for rr in range(r, r+3):
            x=int(cx+math.cos(a)*rr*1.4); y=int(cy+math.sin(a)*rr*1.4)
            col=(0xff,0xff,0xff) if rr==r+1 else (0xbf,0xe8,0xff)
            put(c,x,y,col)
    return c

# ---- cat frames ----
store('cat_idle0',draw_cat(legs=None,bob=0))
store('cat_idle1',draw_cat(legs=None,bob=1))
store('cat_idle2',draw_cat(legs=None,bob=0,eyes='shut'))
store('cat_idle3',draw_cat(legs=None,bob=1,eyes='shut'))
for i in range(8):
    store('cat_run%d'%i,draw_cat(legs=i/8.0,bob=(0 if i%2 else 1),eyes='open'))
store('cat_jump',draw_cat(tuck=1,eyes='open',pose='up'))
store('cat_fall',draw_cat(legs=0.12,eyes='open'))
store('cat_glide',draw_cat(legs=0.2,eyes='open'))
store('cat_dash',draw_cat(legs=0.0,eyes='angry',pose='atk'))
store('cat_atk0',draw_cat(pose='atk',eyes='angry'))
store('cat_atk1',draw_cat(pose='atk',eyes='angry',bob=1))
store('cat_atk2',draw_cat(pose='atk',eyes='angry'))
store('cat_atkup',draw_cat(pose='up',eyes='angry'))
store('cat_atkdn',draw_cat(pose='down',eyes='angry',tuck=1))
store('cat_hurt',draw_cat(eyes='shut',bob=1))
store('cat_sit',draw_cat(eyes='shut'))
store('cat_talk',draw_cat(mouth=True))
store('cat_cast',draw_cat(pose='up',eyes='open'))
dead=C(W,H)
ell(dead,12,24,8,4,F); ell(dead,8,22,4,3,FL)
line(dead,6,22,8,20,O,1); line(dead,9,22,11,20,O,1)  # x_x eyes
tri(dead,(18,22),(20,18),(16,20),F)
dead=outline(dead,O); store('cat_dead',dead)
store('cat_tail',draw_tail(0))
store('cat_tail1',draw_tail(0.25))
store('sword',draw_sword())
store('slash0',draw_slash(6))
store('slash1',draw_slash(8))
store('slash2',draw_slash(10))

# ---- everything else from base, enhanced ----
SKIP=set(['cat_idle0','cat_idle1','cat_idle2','cat_idle3','cat_run0','cat_run1','cat_run2','cat_run3',
 'cat_run4','cat_run5','cat_jump','cat_fall','cat_glide','cat_dash','cat_atk0','cat_atk1','cat_atk2',
 'cat_atkup','cat_atkdn','cat_hurt','cat_sit','cat_talk','cat_cast','cat_dead','cat_tail','sword',
 'slash0','slash1','slash2'])
for n in OLD:
    if n in SKIP: continue
    try: enhance_from_ascii(n)
    except Exception as e: sys.stderr.write("skip %s %s\n"%(n,e))

# ---------------- emit ----------------
def emit(path):
    L=[]
    L.append("/* GENERATED by tools/artgen2.py -- raw pixel data. do not edit. */")
    L.append("#include <stdint.h>")
    L.append("typedef struct { const char *name; int w,h; const uint32_t *px; } ArtRaw;")
    tbl=[]
    for n in sorted(OUT):
        w,h,raw=OUT[n]
        L.append("static const uint32_t px_%s[%d]={%s};"%(n.replace('.','_'),w*h,",".join("0x%08Xu"%v for v in raw)))
        tbl.append((n,w,h))
    L.append("static const ArtRaw ART_TABLE[]={")
    for n,w,h in tbl:
        L.append('  {"%s",%d,%d,px_%s},'%(n,w,h,n.replace('.','_')))
    L.append("};")
    L.append("#define ART_COUNT %d"%len(tbl))
    open(path,'w').write("\n".join(L)+"\n")

def contact(path,scale=3,cols=14):
    names=sorted(OUT)
    cellw=max(OUT[n][0] for n in names)*scale+6
    cellh=max(OUT[n][1] for n in names)*scale+6
    rowsn=(len(names)+cols-1)//cols
    Wd,Hd=cols*cellw+8,rowsn*cellh+8
    canvas=[[(24,20,40)]*Wd for _ in range(Hd)]
    for idx,n in enumerate(names):
        w,h,raw=OUT[n]
        cx=4+(idx%cols)*cellw+3; cy=4+(idx//cols)*cellh+3
        for y in range(h):
            for x in range(w):
                v=raw[y*w+x]
                if not v: continue
                r=(v>>16)&255;g=(v>>8)&255;b=v&255
                for dy in range(scale):
                    for dx in range(scale):
                        if 0<=cy+y*scale+dy<Hd and 0<=cx+x*scale+dx<Wd:
                            canvas[cy+y*scale+dy][cx+x*scale+dx]=(r,g,b)
    # bmp
    rowbytes=Wd*3; pad=(-rowbytes)%4; pix=(rowbytes+pad)*Hd
    data=bytearray()
    for y in range(Hd-1,-1,-1):
        for x in range(Wd):
            r,g,b=canvas[y][x]; data+=bytes((b,g,r))
        data+=b'\x00'*pad
    hdr=b'BM'+struct.pack('<IHHI',54+pix,0,0,54)+struct.pack('<IiiHHIIiiII',40,Wd,Hd,1,24,0,pix,2835,2835,0,0)
    open(path,'wb').write(hdr+bytes(data))

if __name__=='__main__':
    os.makedirs(os.path.join(ROOT,'shots'),exist_ok=True)
    emit(os.path.join(ROOT,'src','art_data.h'))
    contact(os.path.join(ROOT,'shots','art_sheet2.bmp'))
    print("sprites:",len(OUT))
