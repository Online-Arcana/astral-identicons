interface ImportMeta {
  readonly dir: string;
}

declare const process: {
  exitCode?: number;
};

declare const Bun: {
  argv: string[];
  env: Record<string, string | undefined>;
  file(path: string): {
    text(): Promise<string>;
    json(): Promise<unknown>;
    exists(): Promise<boolean>;
  };
  write(path: string, data: string | Uint8Array): Promise<number>;
  serve(options: {
    port?: number;
    hostname?: string;
    fetch(request: Request): Response | Promise<Response>;
  }): { url: URL };
  build(options: {
    entrypoints: string[];
    target: "browser";
    format?: "esm";
    minify?: boolean;
    sourcemap?: "inline" | "external" | "none";
  }): Promise<{
    success: boolean;
    logs: Array<{ message?: string }>;
    outputs: Array<{ text(): Promise<string> }>;
  }>;
};

declare module "bun:test" {
  export function describe(name: string, body: () => void): void;
  export function test(name: string, body: () => void | Promise<void>): void;
  export function expect<T>(value: T): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toMatch(expected: RegExp): void;
    toContain(expected: unknown): void;
    not: {
      toContain(expected: unknown): void;
      toMatch(expected: RegExp): void;
    };
  };
}
