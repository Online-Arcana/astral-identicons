export interface RuntimeHandle {
  remove(): void;
}

export interface RuntimeEnvironment<T> {
  current(): T | Promise<T> | undefined;
  clear(): void;
  create(
    url: string,
    loaded: () => void,
    failed: (reason: unknown) => void
  ): RuntimeHandle;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export interface RuntimeLoaderOptions<T> {
  url: string;
  ready(value: unknown): value is T;
  attempts?: number;
  timeoutMilliseconds?: number;
  pollMilliseconds?: number;
}

const timeoutMarker = Symbol("runtime-timeout");

function thenable<T>(value: unknown): value is PromiseLike<T> {
  if (!value || typeof value !== "object") return false;
  return typeof (value as PromiseLike<T>).then === "function";
}

export class RuntimeLoader<T> {
  readonly #environment: RuntimeEnvironment<T>;
  readonly #options: Required<RuntimeLoaderOptions<T>>;
  #request: Promise<T> | undefined;
  #value: T | undefined;

  constructor(
    environment: RuntimeEnvironment<T>,
    options: RuntimeLoaderOptions<T>
  ) {
    this.#environment = environment;
    this.#options = {
      attempts: options.attempts ?? 2,
      timeoutMilliseconds: options.timeoutMilliseconds ?? 20_000,
      pollMilliseconds: options.pollMilliseconds ?? 40,
      url: options.url,
      ready: options.ready
    };
  }

  load(): Promise<T> {
    if (this.#value) return Promise.resolve(this.#value);
    if (this.#request) return this.#request;

    const request = this.run();
    this.#request = request;

    void request.then(
      (value) => {
        this.#value = value;
      },
      () => {
        if (this.#request === request) this.#request = undefined;
      }
    );

    return request;
  }

  reset(): void {
    this.#request = undefined;
    this.#value = undefined;
    this.#environment.clear();
  }

  private async run(): Promise<T> {
    try {
      const existing = await this.resolveCurrent(250);
      if (existing) return existing;
    } catch {
      // A stale rejected global promise must never poison future loads.
    }

    this.#environment.clear();
    let lastError: unknown = new Error("Runtime did not initialise");

    for (let attempt = 0; attempt < this.#options.attempts; attempt += 1) {
      let handle: RuntimeHandle | undefined;

      try {
        const url = this.attemptUrl(attempt);
        const deadline = this.#environment.now() + this.#options.timeoutMilliseconds;
        handle = await this.loadScript(url, deadline);
        const value = await this.waitUntilReady(deadline);
        return value;
      } catch (error) {
        lastError = error;
        handle?.remove();
        this.#environment.clear();

        if (attempt + 1 < this.#options.attempts) {
          await this.#environment.sleep(100);
        }
      }
    }

    throw lastError;
  }

  private attemptUrl(attempt: number): string {
    if (attempt === 0) return this.#options.url;

    const separator = this.#options.url.includes("?") ? "&" : "?";
    return `${this.#options.url}${separator}runtime-retry=${attempt}`;
  }

  private async loadScript(
    url: string,
    deadline: number
  ): Promise<RuntimeHandle> {
    let handle: RuntimeHandle | undefined;

    const loaded = new Promise<void>((resolve, reject) => {
      handle = this.#environment.create(url, resolve, reject);
    });

    await this.beforeDeadline(loaded, deadline, `Runtime script did not load: ${url}`);
    return handle!;
  }

  private async waitUntilReady(deadline: number): Promise<T> {
    while (this.#environment.now() < deadline) {
      const remaining = deadline - this.#environment.now();
      const value = await this.resolveCurrent(remaining);
      if (value) return value;

      await this.#environment.sleep(this.#options.pollMilliseconds);
    }

    throw new Error("Runtime script loaded but never became ready");
  }

  private async resolveCurrent(milliseconds: number): Promise<T | undefined> {
    const current = this.#environment.current();
    if (!current) return undefined;
    if (this.#options.ready(current)) return current;
    if (!thenable<T>(current)) return undefined;

    const result = await Promise.race([
      Promise.resolve(current),
      this.#environment.sleep(Math.max(1, milliseconds)).then(() => timeoutMarker)
    ]);

    if (result === timeoutMarker) return undefined;
    return this.#options.ready(result) ? result : undefined;
  }

  private async beforeDeadline(
    value: Promise<void>,
    deadline: number,
    message: string
  ): Promise<void> {
    const remaining = Math.max(1, deadline - this.#environment.now());
    const result = await Promise.race([
      value.then(() => true),
      this.#environment.sleep(remaining).then(() => false)
    ]);

    if (!result) throw new Error(message);
  }
}
