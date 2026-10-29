/**
 * "Take photo" at the desk (F107, 29 Oct 2026). Opens the desk computer's camera in the browser with a
 * live picture, then Capture -> Retake / Use photo. With two or more cameras (a laptop and a USB
 * webcam, or a tablet's front and back) a "Switch camera" button cycles between them. With no
 * camera, or when the browser's camera permission is refused, the sheet says so in plain words and
 * offers "Upload a photo" (a picture file) instead; that button is there in every state.
 *
 * The saved photo is the centre square of the frame, shrunk to about 400 px and under ~60 KB in the
 * browser (deskPhotoImage.ts). The live picture of a front camera is mirrored, like a mirror; the
 * saved photo is not. The camera is switched off the moment a photo is taken, and when the sheet
 * closes.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { cameraTrouble, cameraTroubleWords, type CameraTrouble } from '../logic/memberPhoto';
import { MemberPhotoError } from '../shop/memberPhotoApi';
import { shrinkPickedFile, shrinkVideoFrame } from './deskPhotoImage';
import { Button, ErrorBanner, Row, Sheet, color, font, radius, space } from './kit';

type Stage =
  | { kind: 'starting' }
  | { kind: 'live' }
  | { kind: 'trouble'; trouble: CameraTrouble }
  | { kind: 'shot'; blob: Blob; url: string; from: 'camera' | 'file' };

/** Every word on this sheet (the sheet title comes from the caller). */
export const CAMERA_WORDS = {
  upload: 'Upload a photo', // member-words
  pickAnother: 'Pick another', // member-words
  retake: 'Retake', // member-words
  use: 'Use photo', // member-words
  saving: 'Saving…', // member-words
  tryAgain: 'Try again', // member-words
  switchCamera: 'Switch camera', // member-words
  startingButton: 'Starting camera…', // member-words
  capture: 'Capture', // member-words
  cameraLabel: 'Camera picture', // member-words
  shotAlt: 'The photo just taken', // member-words
  starting: 'Starting the camera… If the browser asks, tap Allow.', // member-words
  checkShot: 'Check that the face is clear. Tap Use photo to keep it.', // member-words
  howTo: 'Ask the member to look at the camera, with their face inside the oval.', // member-words
  privacy: 'Only your gym’s staff can see this photo. It shows on the member’s page, their member card and at check-in.', // member-words
  remove: 'Remove photo', // member-words
  captureFailed: 'The photo didn’t work. Try again.', // member-words
  pickFailed: 'That photo couldn’t be used. Pick a JPG or PNG picture.', // member-words
  saveFailed: 'The photo didn’t save. Try again.', // member-words
  removeFailed: 'The photo wasn’t removed. Try again.', // member-words
} as const;
const W = CAMERA_WORDS;

/** Words for a failure the sheet shows. MemberPhotoError already carries plain words. */
function failWords(e: unknown, fallback: string): string {
  return e instanceof MemberPhotoError ? e.message : fallback;
}

export function DeskCameraSheet({
  title,
  onUse,
  onClose,
  onRemove,
}: {
  title: string;
  /** Called with the small JPEG. May save it; a thrown error's message is shown (the sheet stays open). */
  onUse: (jpeg: Blob) => Promise<void> | void;
  onClose: () => void;
  /** Only when the member already has a photo: "Remove photo". */
  onRemove?: () => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'starting' });
  const [cameras, setCameras] = useState<string[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [mirror, setMirror] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to start the camera again (Retake, Try again, Switch camera).
  const [startNo, setStartNo] = useState(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start (or restart) the camera.
  useEffect(() => {
    let live = true;
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) {
      // http:// (not https) or a very old browser: no camera at all here.
      setStage({ kind: 'trouble', trouble: 'unsupported' });
      return;
    }
    setStage({ kind: 'starting' });
    const size = { width: { ideal: 1280 }, height: { ideal: 960 } };
    const video: MediaTrackConstraints = deviceId ? { ...size, deviceId: { exact: deviceId } } : { ...size, facingMode: 'user' };
    md.getUserMedia({ video, audio: false })
      .then(async (stream) => {
        if (!live) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stopCamera();
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings?.() ?? {};
        // A back camera is not mirrored; a front camera or a desk webcam is (people expect a mirror).
        setMirror(settings.facingMode !== 'environment');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (e) {
            // quiet: autoplay of a muted inline video is allowed everywhere we run; a refusal here only means the frame shows a beat later
            console.info('[member photos] video.play() was refused; the frame will start on its own', e);
          }
        }
        setStage({ kind: 'live' });
        // The camera list is only complete once permission is given.
        try {
          const all = await md.enumerateDevices();
          const ids = all.filter((d) => d.kind === 'videoinput' && d.deviceId).map((d) => d.deviceId);
          if (live) setCameras(ids);
          if (live && !deviceId && settings.deviceId) setDeviceId(settings.deviceId);
        } catch (e) {
          console.info('[member photos] the camera list could not be read; no Switch camera button', e);
        }
      })
      .catch((e: unknown) => {
        if (!live) return;
        const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : null;
        console.info('[member photos] the camera did not open', name, e);
        setStage({ kind: 'trouble', trouble: cameraTrouble(name) });
      });
    return () => {
      live = false;
    };
    // deviceId is read for the start only; switching sets it AND bumps startNo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNo, stopCamera]);

  // The camera goes off when the sheet closes; a taken photo's preview address is released.
  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => {
    if (stage.kind !== 'shot') return;
    const url = stage.url;
    return () => URL.revokeObjectURL(url);
  }, [stage]);

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setError(null);
    try {
      const blob = await shrinkVideoFrame(v);
      stopCamera();
      setStage({ kind: 'shot', blob, url: URL.createObjectURL(blob), from: 'camera' });
    } catch (e) {
      console.warn('[ForgeErr] member photos: capture failed', e);
      setError(failWords(e, W.captureFailed));
    }
  };

  const picked = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const blob = await shrinkPickedFile(file);
      stopCamera();
      setStage({ kind: 'shot', blob, url: URL.createObjectURL(blob), from: 'file' });
    } catch (e) {
      console.warn('[ForgeErr] member photos: a picked picture could not be used', e);
      setError(failWords(e, W.pickFailed));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const use = async () => {
    if (stage.kind !== 'shot') return;
    setError(null);
    setBusy(true);
    try {
      await onUse(stage.blob);
      onClose();
    } catch (e) {
      console.warn('[ForgeErr] member photos: saving the photo failed', e);
      setError(e instanceof Error && e.message ? e.message : W.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onRemove) return;
    setError(null);
    setBusy(true);
    try {
      await onRemove();
      onClose();
    } catch (e) {
      console.warn('[ForgeErr] member photos: removing the photo failed', e);
      setError(e instanceof Error && e.message ? e.message : W.removeFailed);
    } finally {
      setBusy(false);
    }
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const at = deviceId ? cameras.indexOf(deviceId) : -1;
    setDeviceId(cameras[(at + 1) % cameras.length]);
    setStartNo((n) => n + 1);
  };

  const retake = () => {
    setError(null);
    if (stage.kind === 'shot' && stage.from === 'file' && streamRef.current === null && cameras.length === 0) {
      // No camera here: "Pick another" opens the file picker again.
      fileRef.current?.click();
      return;
    }
    setStartNo((n) => n + 1);
  };

  const uploadButton = (
    <Button variant={stage.kind === 'trouble' ? 'primary' : 'ghost'} disabled={busy} onClick={() => fileRef.current?.click()}>
      {W.upload}
    </Button>
  );

  const footer =
    stage.kind === 'shot' ? (
      <>
        <Button variant="ghost" disabled={busy} onClick={retake}>
          {stage.from === 'file' && cameras.length === 0 ? W.pickAnother : W.retake}
        </Button>
        <Button disabled={busy} onClick={use}>
          {busy ? W.saving : W.use}
        </Button>
      </>
    ) : stage.kind === 'trouble' ? (
      <>
        {(stage.trouble === 'refused' || stage.trouble === 'busy' || stage.trouble === 'other') && (
          <Button variant="ghost" disabled={busy} onClick={() => setStartNo((n) => n + 1)}>
            {W.tryAgain}
          </Button>
        )}
        {uploadButton}
      </>
    ) : (
      <>
        {uploadButton}
        {cameras.length >= 2 && (
          <Button variant="ghost" disabled={busy || stage.kind !== 'live'} onClick={switchCamera}>
            {W.switchCamera}
          </Button>
        )}
        <Button disabled={busy || stage.kind !== 'live'} onClick={capture}>
          {stage.kind === 'starting' ? W.startingButton : W.capture}
        </Button>
      </>
    );

  const frame: CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: 360,
    aspectRatio: '1 / 1',
    margin: '0 auto',
    borderRadius: radius.lg,
    overflow: 'hidden',
    background: '#0B0C0E',
    border: `1px solid ${color.border}`,
  };
  const help: CSSProperties = { margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 13, lineHeight: 1.5, color: color.inkSecondary };

  return (
    <Sheet title={title} onClose={onClose} footer={footer}>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={frame}>
        {stage.kind === 'shot' ? (
          <img src={stage.url} alt={W.shotAlt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : stage.kind === 'trouble' ? (
          <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: space.lg, textAlign: 'center', fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: '#E8EAED' }}>
            {cameraTroubleWords(stage.trouble)}
          </div>
        ) : (
          <>
            {/* Cut to the centre square, like the saved photo. Muted + playsInline: allowed to play at once. */}
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              aria-label={W.cameraLabel}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: mirror ? 'scaleX(-1)' : undefined }}
            />
            {/* A face guide: where the head should sit. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: '20%',
                top: '12%',
                width: '60%',
                height: '72%',
                borderRadius: '50%',
                border: '2px dashed rgba(255,255,255,0.7)',
                pointerEvents: 'none',
              }}
            />
            {stage.kind === 'starting' && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: font.body, fontSize: 14, color: '#E8EAED' }}>
                {W.starting}
              </div>
            )}
          </>
        )}
      </div>

      <p style={help}>
        {stage.kind === 'shot'
          ? W.checkShot
          : W.howTo}
      </p>
      <p style={{ ...help, marginTop: space.xs, fontSize: 12, color: color.inkMuted }}>
        {W.privacy}
      </p>

      {onRemove && (
        <Row gap={space.sm}>
          <Button variant="quiet" tone="danger" disabled={busy} onClick={remove}>
            {W.remove}
          </Button>
        </Row>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void picked(e.target.files?.[0])}
      />
    </Sheet>
  );
}
