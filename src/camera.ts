export const cameraRequestTimeout = 15_000;
export const videoStartTimeout = 8_000;

export class CameraTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CameraTimeoutError";
  }
}

function nameOf(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  if (!("name" in error)) return "";
  return String(error.name);
}

function messageOf(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  if (!("message" in error)) return String(error.message);
  return String(error.message);
}

export function cameraErrorMessage(error: unknown): string {
  if (error instanceof CameraTimeoutError) return error.message;

  switch (nameOf(error)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "Camera access was denied or blocked. Allow camera access for this site, then retry.";

    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera is available to this browser.";

    case "NotReadableError":
    case "TrackStartError":
      return "The camera could not start. It may already be in use by another app or browser tab.";

    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "The browser could not provide a compatible camera stream.";

    case "AbortError":
      return "The browser aborted the camera request. Close the scanner and try again.";

    case "TypeError":
      return "Camera access is unavailable in this browser context.";

    default: {
      const message = messageOf(error).trim();
      return message || "The camera did not start.";
    }
  }
}

export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

export function bounded<T>(
  request: Promise<T>,
  milliseconds: number,
  message: string,
  dispose?: (value: T) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;

    const timer = globalThis.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new CameraTimeoutError(message));
    }, milliseconds);

    void request.then(
      (value) => {
        if (finished) {
          dispose?.(value);
          return;
        }

        finished = true;
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (finished) return;
        finished = true;
        globalThis.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function requestCamera(
  devices: MediaDevices,
  timeout = cameraRequestTimeout
): Promise<MediaStream> {
  const request = devices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    }
  });

  return bounded(
    request,
    timeout,
    "The browser did not answer the camera request. Check the site camera permission or use a saved photo instead.",
    stopStream
  );
}

export function startVideo(
  video: HTMLVideoElement,
  timeout = videoStartTimeout
): Promise<void> {
  return bounded(
    video.play(),
    timeout,
    "The camera stream opened, but the browser did not start the video preview. Use a saved photo instead."
  );
}

export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
