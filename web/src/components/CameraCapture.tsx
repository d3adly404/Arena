/**
 * FieldLink — taking a photograph.
 *
 * Tries the device camera first (the normal case on a phone in the field). If the browser
 * cannot give camera access — permission refused, older device, desktop without a webcam —
 * the officer is offered the device's own camera app and a file picker instead, so a visit
 * is never blocked. Photographs taken without a connection are kept on the device.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button, Note, cx } from './ui';
import { Icon } from './Icon';

type Props = {
  open: boolean;
  title: string;
  hint?: string;
  onClose: () => void;
  onUse: (file: File, meta: { source: 'camera' | 'file'; capturedAt: string }) => void;
};

export function CameraCapture({ open, title, hint, onClose, onUse }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'starting' | 'live' | 'captured' | 'unavailable'>('starting');
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const start = async () => {
    setError(null);
    setShot(null);
    setState('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This device does not offer a camera to the browser.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setState('live');
    } catch (err: any) {
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was refused. You can allow it in your browser settings, or use the button below to open your camera app or choose a saved photo.'
          : err?.message || 'The camera could not be started on this device.',
      );
      setState('unavailable');
    }
  };

  useEffect(() => {
    if (!open) {
      stopStream();
      setShot(null);
      return;
    }
    start();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 960;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.85));
    if (!blob) return;
    stopStream();
    setShot({ blob, url: URL.createObjectURL(blob) });
    setState('captured');
  };

  const retake = async () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    await start();
  };

  const use = () => {
    if (!shot) return;
    const file = new File([shot.blob], `fieldlink-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onUse(file, { source: 'camera', capturedAt: new Date().toISOString() });
    URL.revokeObjectURL(shot.url);
    setShot(null);
    stopStream();
  };

  const pickFile = (file?: File | null, source: 'camera' | 'file' = 'file') => {
    if (!file) return;
    onUse(file, { source, capturedAt: new Date().toISOString() });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink-900 text-white">
      <header className="flex items-center gap-3 px-4 py-3">
        <button type="button" aria-label="Close camera" onClick={() => { stopStream(); onClose(); }} className="rounded-lg p-2 hover:bg-white/10">
          <Icon name="x" className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {hint ? <p className="truncate text-[12px] text-white/70">{hint}</p> : null}
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden bg-black">
        {state !== 'unavailable' ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={cx('h-full w-full object-contain', state === 'captured' && 'hidden')}
            />
            {shot ? <img src={shot.url} alt="Photograph preview" className="h-full w-full object-contain" /> : null}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10">
              <Icon name="camera" className="h-7 w-7" />
            </span>
            <p className="max-w-sm text-[14px] text-white/85">{error}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" icon="camera" onClick={() => nativeInputRef.current?.click()}>
                Open device camera
              </Button>
              <Button icon="upload" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => fileInputRef.current?.click()}>
                Choose a saved photo
              </Button>
            </div>
          </div>
        )}
        {state === 'starting' ? (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/70 text-[13px]">
            <div className="flex flex-col items-center gap-3">
              <Icon name="camera" className="h-7 w-7 animate-pulse" />
              Asking for camera permission…
            </div>
          </div>
        ) : null}
      </div>

      <footer className="safe-bottom flex items-center justify-center gap-3 px-4 py-5">
        {state === 'live' ? (
          <button
            type="button"
            onClick={capture}
            className="grid h-16 w-16 place-items-center rounded-full border-4 border-white/70 bg-white text-ink-900 transition active:scale-95"
            aria-label="Take photo"
          >
            <Icon name="camera" className="h-7 w-7" />
          </button>
        ) : null}
        {state === 'captured' ? (
          <>
            <Button icon="rotate-ccw" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={retake}>
              Retake
            </Button>
            <Button variant="primary" icon="check" onClick={use}>
              Use photo
            </Button>
          </>
        ) : null}
        {state === 'unavailable' ? (
          <p className="text-center text-[12px] text-white/60">
            Photographs taken without a connection are kept on this device and uploaded automatically.
          </p>
        ) : null}
      </footer>

      <Note tone="warn" icon="shield">
        <span className="text-white">Only photograph people who have agreed. Family photographs are private and are only visible to authorised FieldLink users.</span>
      </Note>

      {/* Fallbacks for devices that do not expose the camera to the browser. */}
      <input
        ref={nativeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => { pickFile(event.target.files?.[0], 'camera'); event.target.value = ''; }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => { pickFile(event.target.files?.[0], 'file'); event.target.value = ''; }}
      />
    </div>
  );
}
