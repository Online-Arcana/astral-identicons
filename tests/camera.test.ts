import { describe, expect, test } from "bun:test";
import {
  bounded,
  cameraErrorMessage,
  CameraTimeoutError
} from "../src/camera.ts";

describe("camera startup", () => {
  test("does not leave a pending camera request forever", async () => {
    let error: unknown;

    try {
      await bounded(
        new Promise<never>(() => undefined),
        5,
        "camera request timed out"
      );
    } catch (value) {
      error = value;
    }

    expect(error instanceof CameraTimeoutError).toBe(true);
    expect(cameraErrorMessage(error)).toBe("camera request timed out");
  });

  test("explains denied camera permission", () => {
    const message = cameraErrorMessage({
      name: "NotAllowedError",
      message: "Permission denied"
    });

    expect(message).toContain("denied or blocked");
  });

  test("explains a camera already in use", () => {
    const message = cameraErrorMessage({
      name: "NotReadableError",
      message: "Could not start video source"
    });

    expect(message).toContain("already be in use");
  });
});
