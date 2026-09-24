import http from "node:http";
import net from "node:net";

/**
 * A small reverse proxy the browser talks to instead of the app directly, so a test can
 * genuinely sever the network path (destroy open sockets, refuse new ones) and later heal it.
 * Playwright's own offline emulation does not close an already-open EventSource.
 */
export class FlakyProxy {
  private server: http.Server;
  private sockets = new Set<net.Socket>();
  private blocked = false;
  port = 0;

  constructor(private target: string) {
    const t = new URL(target);
    this.server = http.createServer((req, res) => {
      if (this.blocked) {
        req.socket.destroy();
        return;
      }
      const upstream = http.request(
        { host: t.hostname, port: t.port || 80, path: req.url, method: req.method, headers: req.headers },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
          up.on("error", () => res.destroy());
        },
      );
      upstream.on("error", () => res.destroy());
      res.on("close", () => upstream.destroy());
      req.pipe(upstream);
    });
    this.server.on("connection", (s) => {
      if (this.blocked) return s.destroy();
      this.sockets.add(s);
      s.on("close", () => this.sockets.delete(s));
    });
  }

  async start(): Promise<string> {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.port = (this.server.address() as net.AddressInfo).port;
    return `http://127.0.0.1:${this.port}`;
  }

  /** Kill every open connection and refuse new ones until heal(). */
  sever() {
    this.blocked = true;
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
  }

  heal() {
    this.blocked = false;
  }

  async stop() {
    this.sever();
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}
