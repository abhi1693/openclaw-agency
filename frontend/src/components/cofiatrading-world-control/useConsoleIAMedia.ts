"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConsoleIAAttachmentKind = "audio" | "camera" | "file" | "image" | "screen";

export type ConsoleIAAttachment = {
  id: string;
  kind: ConsoleIAAttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
  file: File;
  previewUrl?: string;
  note?: string;
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;
const MAX_AUDIO_MS = 20_000;

const createId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const readVideoMetadata = (video: HTMLVideoElement) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("SCREEN_METADATA_TIMEOUT")), 3000);
    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("SCREEN_VIDEO_ERROR"));
    };
  });

const captureVideoFrame = async (stream: MediaStream, prefix: "camera" | "screen", mimeType = "image/png") => {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await readVideoMetadata(video);
  await video.play();

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, video.videoWidth);
  canvas.height = Math.max(1, video.videoHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_CONTEXT_MISSING");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.88));
  if (!blob) throw new Error(`${prefix.toUpperCase()}_BLOB_FAILED`);
  const extension = mimeType === "image/jpeg" ? "jpg" : "png";
  return new File([blob], `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, {
    type: mimeType,
  });
};

export function useConsoleIAMedia() {
  const [attachments, setAttachments] = useState<ConsoleIAAttachment[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<number | null>(null);
  const attachmentsRef = useRef<ConsoleIAAttachment[]>([]);

  const appendAttachment = useCallback((attachment: ConsoleIAAttachment) => {
    setAttachments((current) => {
      if (current.length >= MAX_ATTACHMENTS) {
        setMediaError(`MAX_${MAX_ATTACHMENTS}_ATTACHMENTS`);
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        return current;
      }
      return [...current, attachment];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
  }, []);

  const addFiles = useCallback((files: FileList | File[], forcedKind?: ConsoleIAAttachmentKind) => {
    setMediaError(null);
    Array.from(files).forEach((file) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setMediaError(`FILE_TOO_LARGE_${Math.round(file.size / 1024 / 1024)}MB`);
        return;
      }
      const isImage = file.type.startsWith("image/");
      const kind = forcedKind ?? (isImage ? "image" : "file");
      const previewUrl = isImage || kind === "audio" ? URL.createObjectURL(file) : undefined;
      appendAttachment({
        id: createId(kind),
        kind,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        capturedAt: new Date().toISOString(),
        file,
        previewUrl,
        note: kind === "file" ? "Uploaded to local console.IA packet store after send." : undefined,
      });
    });
  }, [appendAttachment]);

  const captureScreen = useCallback(async () => {
    setMediaError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError("SCREEN_CAPTURE_UNSUPPORTED");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: true });
      const file = await captureVideoFrame(stream, "screen", "image/png");
      addFiles([file], "screen");
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "SCREEN_CAPTURE_FAILED");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }, [addFiles]);

  const captureCamera = useCallback(async () => {
    setMediaError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("CAMERA_CAPTURE_UNSUPPORTED");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      const file = await captureVideoFrame(stream, "camera", "image/jpeg");
      addFiles([file], "camera");
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "CAMERA_CAPTURE_FAILED");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }, [addFiles]);

  const stopAudioRecording = useCallback(() => {
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    recorderRef.current?.stop();
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startAudioRecording = useCallback(async () => {
    setMediaError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMediaError("AUDIO_RECORDING_UNSUPPORTED");
      return;
    }
    if (isRecordingAudio) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          const file = new File([blob], `audio-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`, {
            type: mimeType,
          });
          addFiles([file], "audio");
        }
        setIsRecordingAudio(false);
        recorderRef.current = null;
        audioStreamRef.current = null;
        audioChunksRef.current = [];
      };
      recorder.start();
      setIsRecordingAudio(true);
      autoStopRef.current = window.setTimeout(stopAudioRecording, MAX_AUDIO_MS);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "AUDIO_CAPTURE_FAILED");
      setIsRecordingAudio(false);
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    }
  }, [addFiles, isRecordingAudio, stopAudioRecording]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    attachmentsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  return {
    addFiles,
    attachments,
    captureCamera,
    captureScreen,
    clearAttachments,
    isRecordingAudio,
    mediaError,
    removeAttachment,
    startAudioRecording,
    stopAudioRecording,
  };
}
