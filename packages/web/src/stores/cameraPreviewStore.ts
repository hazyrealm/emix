import { create } from 'zustand';
import { useCameraEffectsStore } from './cameraEffectsStore';

interface CameraPreviewRequest {
  /** Runs when the user presses Start; null while the preview is closed. */
  onConfirm: (() => void) | null;
  /** 'call' = starting a video call; 'camera' = turning the camera on in a call. */
  mode: 'call' | 'camera';
  open: (mode: 'call' | 'camera', onConfirm: () => void) => void;
  close: () => void;
}

/** The pre-broadcast camera preview (components/voice/DeviceControls.tsx draws it). */
export const useCameraPreviewStore = create<CameraPreviewRequest>((set) => ({
  onConfirm: null,
  mode: 'camera',
  open: (mode, onConfirm) => set({ mode, onConfirm }),
  close: () => set({ onConfirm: null }),
}));

/** Start a video call, showing the camera preview first when enabled. */
export function requestVideoCall(start: () => void): void {
  if (!useCameraEffectsStore.getState().alwaysPreview) { start(); return; }
  useCameraPreviewStore.getState().open('call', start);
}
