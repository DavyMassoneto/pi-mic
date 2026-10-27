export interface ServerOptions {
  targetUrl: string | undefined;
  listenHost: string;
  listenPort: number;
}

const DEFAULT_LISTEN = "127.0.0.1:3042";

function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseOptions(argv: readonly string[], env: NodeJS.ProcessEnv): ServerOptions {
  const targetUrl = argValue(argv, "--target") || env.PI_MIC_WEB_TARGET || undefined;
  const listen = argValue(argv, "--listen") || env.PI_MIC_WEB_LISTEN || DEFAULT_LISTEN;
  const [listenHost, listenPort] = listen.split(":");
  return { targetUrl, listenHost, listenPort: Number(listenPort) };
}
