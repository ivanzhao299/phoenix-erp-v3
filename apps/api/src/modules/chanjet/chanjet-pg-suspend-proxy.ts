import { createServer, Server, Socket } from 'node:net';

/** A REAL PostgreSQL wire-level suspend proxy. All protocol frames flow
 *  through unchanged EXCEPT simple-query ('Q') frames whose SQL is armed for
 *  holding: the frame is captured (never forwarded) so the client-side
 *  statement genuinely never reaches the server — exactly the suspended
 *  BEGIN / withheld COMMIT failure mode. One-shot: the first matching frame
 *  is held and the arm is cleared. */
export type PgSuspendProxy = {
  port: number;
  /** arm a one-shot hold for the next simple query matching `sql` (trimmed,
   *  case-insensitive, trailing ';' ignored) */
  armHold(sql: string): void;
  /** SQL text of the frames actually held so far */
  heldFrames(): string[];
  /** backend PIDs observed via BackendKeyData ('K') frames, in arrival order */
  backendPids(): number[];
  /** backend PID of the session each held frame belonged to (held-frame order) */
  heldPids(): number[];
  /** count of frontend sockets fully closed (both directions torn down) */
  closedSessions(): number;
  close(): Promise<void>;
};

const normalizeSql = (sql: string): string => sql.trim().replace(/;+\s*$/, '').toUpperCase();

type Frame = { type: number; body: Buffer };

export function startPgSuspendProxy(targetHost: string, targetPort: number): Promise<PgSuspendProxy> {
  const held: string[] = [];
  const pids: number[] = [];
  const heldPids: number[] = [];
  let armed = '';
  let closedSessions = 0;
  const server: Server = createServer((frontend: Socket) => {
    const backend: Socket = new Socket();
    let sessionPid = 0;
    let sawLiteralBegin = false;
    let tearingDown = false;
    const teardown = (): void => {
      if (tearingDown) return;
      tearingDown = true;
      closedSessions += 1;
      frontend.destroy();
      backend.destroy();
    };
    frontend.on('error', teardown);
    backend.on('error', teardown);
    backend.on('close', teardown);
    frontend.on('close', teardown);

    const forward = (buf: Buffer): void => { if (!backend.destroyed) backend.write(buf); };

    // framer over the frontend→backend byte stream: the FIRST message is the
    // PG startup packet (int32BE length, NO type byte); every following
    // protocol message is one type byte + int32BE length (including itself);
    // 'Q' frames carry the SQL as a NUL-terminated body
    let buf = Buffer.alloc(0);
    let startupDone = false;
    frontend.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (!startupDone) {
        if (buf.length < 4) return;
        const startupLen = buf.readInt32BE(0);
        if (startupLen < 8 || startupLen > 64 * 1024 * 1024) { teardown(); return; }
        if (buf.length < startupLen) return;
        forward(buf.subarray(0, startupLen)); // the startup packet flows verbatim
        buf = buf.subarray(startupLen);
        startupDone = true;
      }
      while (buf.length >= 5) {
        const type = buf[0];
        const len = buf.readInt32BE(1);
        if (len < 4 || len > 64 * 1024 * 1024) { teardown(); return; }
        if (buf.length < 1 + len) break;
        const frame: Frame = { type, body: buf.subarray(5, 1 + len) };
        if (type === 0x51 /* Q */ && armed) {
          const nul = frame.body.indexOf(0);
          const sql = frame.body.subarray(0, nul < 0 ? frame.body.length : nul).toString('utf8');
          const normalized = normalizeSql(sql);
          // a literal BEGIN marks THIS session as the raw transaction under
          // test — TypeORM's implicit save() transactions use START
          // TRANSACTION, so a COMMIT hold can never capture one of those
          if (normalized === 'BEGIN') sawLiteralBegin = true;
          if (type === 0x51 && armed && normalizeSql(armed) === normalized
            && (normalizeSql(armed) !== 'COMMIT' || sawLiteralBegin)) {
            held.push(sql);
            if (sessionPid) heldPids.push(sessionPid);
            armed = ''; // one-shot: the frame is withheld, never forwarded
            buf = buf.subarray(1 + len);
            continue;
          }
        }
        forward(buf.subarray(0, 1 + len));
        buf = buf.subarray(1 + len);
      }
    });

    backend.connect(targetPort, targetHost, () => { /* handshake flows once both sides pipe */ });
    backend.on('data', (chunk: Buffer) => {
      if (!frontend.destroyed) frontend.write(chunk);
      // sniff BackendKeyData ('K'): body = int32BE pid + int32BE secret
      let bbuf = chunk;
      while (bbuf.length >= 5) {
        const type = bbuf[0];
        const len = bbuf.readInt32BE(1);
        if (len < 4 || bbuf.length < 1 + len) break;
        if (type === 0x4b) { pids.push(bbuf.readInt32BE(5)); sessionPid = bbuf.readInt32BE(5); }
        bbuf = bbuf.subarray(1 + len);
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      resolve({
        port: address.port,
        armHold: (sql: string) => { armed = sql; },
        heldFrames: () => [...held],
        backendPids: () => [...pids],
        heldPids: () => [...heldPids],
        closedSessions: () => closedSessions,
        close: () => new Promise<void>((res) => {
          server.close(() => res());
          (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
        }),
      });
    });
  });
}
