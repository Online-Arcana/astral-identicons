import { describe, expect, test } from "bun:test";
import {
  RuntimeLoader,
  type RuntimeEnvironment,
  type RuntimeHandle
} from "../src/runtime-loader.ts";

interface FakeRuntime {
  ready: true;
  name: string;
}

function runtime(name: string): FakeRuntime {
  return { ready: true, name };
}

function ready(value: unknown): value is FakeRuntime {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as Partial<FakeRuntime>).ready === true
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(milliseconds, 5)));
}

function handle(): RuntimeHandle {
  return { remove() {} };
}

describe("retryable runtime loader", () => {
  test("owns script creation and shares one in-flight request", async () => {
    let current: FakeRuntime | Promise<FakeRuntime> | undefined;
    let creates = 0;

    const environment: RuntimeEnvironment<FakeRuntime> = {
      current: () => current,
      clear: () => {
        current = undefined;
      },
      create: (_url, loaded) => {
        creates += 1;
        queueMicrotask(() => {
          current = runtime("opencv");
          loaded();
        });
        return handle();
      },
      now: () => performance.now(),
      sleep
    };

    const loader = new RuntimeLoader(environment, {
      url: "./opencv.js",
      ready,
      timeoutMilliseconds: 1_000
    });
    const first = loader.load();
    const second = loader.load();

    expect(first === second).toBe(true);
    expect((await first).name).toBe("opencv");
    expect((await second).name).toBe("opencv");
    expect(creates).toBe(1);
  });

  test("clears a stale rejected global promise before loading", async () => {
    let current: FakeRuntime | Promise<FakeRuntime> | undefined =
      Promise.reject(new Error("stale runtime"));
    let clears = 0;

    const environment: RuntimeEnvironment<FakeRuntime> = {
      current: () => current,
      clear: () => {
        clears += 1;
        current = undefined;
      },
      create: (_url, loaded) => {
        queueMicrotask(() => {
          current = runtime("fresh");
          loaded();
        });
        return handle();
      },
      now: () => performance.now(),
      sleep
    };

    const loader = new RuntimeLoader(environment, {
      url: "./opencv.js",
      ready,
      timeoutMilliseconds: 1_000
    });

    expect((await loader.load()).name).toBe("fresh");
    expect(clears > 0).toBe(true);
  });

  test("does not permanently cache a failed load", async () => {
    let current: FakeRuntime | Promise<FakeRuntime> | undefined;
    let creates = 0;

    const environment: RuntimeEnvironment<FakeRuntime> = {
      current: () => current,
      clear: () => {
        current = undefined;
      },
      create: (_url, loaded, failed) => {
        creates += 1;

        queueMicrotask(() => {
          if (creates === 1) {
            failed(new Error("network failure"));
            return;
          }

          current = runtime("retry");
          loaded();
        });

        return handle();
      },
      now: () => performance.now(),
      sleep
    };

    const loader = new RuntimeLoader(environment, {
      url: "./opencv.js",
      ready,
      attempts: 1,
      timeoutMilliseconds: 1_000
    });

    let firstMessage = "";
    try {
      await loader.load();
    } catch (error) {
      firstMessage = error instanceof Error ? error.message : String(error);
    }

    expect(firstMessage).toContain("network failure");
    expect((await loader.load()).name).toBe("retry");
    expect(creates).toBe(2);
  });

  test("automatically retries with a cache-busting URL", async () => {
    let current: FakeRuntime | Promise<FakeRuntime> | undefined;
    const urls: string[] = [];

    const environment: RuntimeEnvironment<FakeRuntime> = {
      current: () => current,
      clear: () => {
        current = undefined;
      },
      create: (url, loaded, failed) => {
        urls.push(url);

        queueMicrotask(() => {
          if (urls.length === 1) {
            failed(new Error("first attempt failed"));
            return;
          }

          current = runtime("second attempt");
          loaded();
        });

        return handle();
      },
      now: () => performance.now(),
      sleep
    };

    const loader = new RuntimeLoader(environment, {
      url: "./opencv.js?build=123",
      ready,
      attempts: 2,
      timeoutMilliseconds: 1_000
    });

    expect((await loader.load()).name).toBe("second attempt");
    expect(urls).toEqual([
      "./opencv.js?build=123",
      "./opencv.js?build=123&runtime-retry=1"
    ]);
  });
});
