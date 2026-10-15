import { createServer, Server, Socket } from 'node:net';

/** A REAL PostgreSQL wire-level suspend proxy. All protocol frames flow
 *  through unchanged EXCEPT:
 *  - simple-query ('Q') frames whose SQL is armed for holding: the frame is
 *    captured (never forwarded) so the client-side statement genuinely never
 *    reaches the server — exactly the suspended BEGIN / withheld COMMIT
 *    failure mode. One-shot per arm.
 *  - response withholding (`armResponseWithhold`): the request frame flows
 *    to the server but every backend→frontend frame afterwards is dropped
 *    until the arm is cleared — the commit lands server-side while the
 *    client never learns the verdict. Matches 'Q' frames exactly and 'P'
 *    (Parse) frames by substring (extended-protocol statements).
 */
export type PgSuspendProxy = {
  port: number;
  /** arm a one-shot hold for the next simple query matching `sql` (trimmed,
   *  case-insensitive, trailing ';' ignored); pass '' to disarm */
  armHold(sql: string): void;
  /** arm one-shot response withholding: the next matching request ('Q'
   *  exact / 'P' Parse substring) is FORWARDED, then backend responses are
   *  withheld until cleared with '' */
  armResponseWithhold(match: string): void;
  /** immediately withhold (true) or release (false) backend→frontend frames
   *  on every session */
  withholdBackendResponses(active: boolean): void;
  /** SQL text of the frames actually held so far */
  heldFrames(): string[];
  /** backend PIDs observed via BackendKeyData ('K') frames, in arrival order */
  backendPids(): number[];
  /** backend PID of the session each held frame belonged to (held-frame order) */
  heldPids(): number[];
  /** backend PID of the session whose response was withheld (withhold order) */
  responseWithheldPids(): number[];
  /** count of response frames dropped by an active withhold */
  withheldResponseFrames(): number;
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
  const responseWithheldPids: number[] = [];
  let armed = '';
  let responseWithholdArmed = '';
  let withholdingBackendGlobally = false;
  let withheldResponseFrames = 0;
  let closedSessions = 0;
  const liveBackends = new Set<Socket>();
  const server: Server = createServer((frontend: Socket) => {
    const backend: Socket = new Socket();
    liveBackends.add(backend);
    let sessionPid = 0;
    let sawLiteralBegin = false;
    // per-session withholding: ONLY the session whose armed frame matched
    // loses its verdict — unrelated sessions keep flowing
    let sessionWithhold = false;
    let tearingDown = false;
    const teardown = (): void => {
      if (tearingDown) return;
      tearingDown = true;
      closedSessions += 1;
      liveBackends.delete(backend);
      frontend.destroy();
      backend.destroy();
    };
    frontend.on('error', teardown);
    backend.on('error', teardown);
    backend.on('close', teardown);
    frontend.on('close', teardown);

    const forward = (buf: Buffer): void => { if (!backend.destroyed) backend.write(buf); };
    const bodyText = (frame: Frame): string => {
      const nul = frame.body.indexOf(0);
      return frame.body.subarray(0, nul < 0 ? frame.body.length : nul).toString('utf8');
    };
    // Parse ('P') body: NUL-terminated STATEMENT NAME (empty for the unnamed
    // statement), then the SQL text, then the parameter type count
    const parseSqlText = (frame: Frame): string => {
      const nameEnd = frame.body.indexOf(0);
      if (nameEnd < 0) return '';
      const sql = frame.body.subarray(nameEnd + 1);
      const sqlEnd = sql.indexOf(0);
      return sql.subarray(0, sqlEnd < 0 ? sql.length : sqlEnd).toString('utf8');
    };

    // framer over the frontend→backend byte stream: the FIRST message is the
    // PG startup packet (int32BE length, NO type byte); every following
    // protocol message is one type byte + int32BE length (including itself);
    // 'Q' frames carry the SQL, 'P' (Parse) frames start with the statement
    // text as a NUL-terminated body
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
        if (type === 0x51 /* Q */) {
          const sql = bodyText(frame);
          const normalized = normalizeSql(sql);
          // a literal BEGIN marks THIS session as the raw transaction under
          // test — TypeORM's implicit save() transactions use START
          // TRANSACTION, so a COMMIT hold can never capture one of those
          if (normalized === 'BEGIN') sawLiteralBegin = true;
          if (armed && normalizeSql(armed) === normalized
            && (normalizeSql(armed) !== 'COMMIT' || sawLiteralBegin)) {
            held.push(sql);
            if (sessionPid) heldPids.push(sessionPid);
            armed = ''; // one-shot: the frame is withheld, never forwarded
            buf = buf.subarray(1 + len);
            continue;
          }
        }
        if (responseWithholdArmed) {
          const match = normalizeSql(responseWithholdArmed);
          const text = type === 0x51 ? bodyText(frame)
            : type === 0x50 /* P */ ? parseSqlText(frame)
            : '';

          const matched = text !== ''
            && (type === 0x50 ? normalizeSql(text).includes(match) : normalizeSql(text) === match
              && (match !== 'COMMIT' || sawLiteralBegin));
          if (matched) {
            // the request REACHES the server; only the verdict is lost
            responseWithholdArmed = '';
            sessionWithhold = true;
            if (sessionPid) responseWithheldPids.push(sessionPid);
            forward(buf.subarray(0, 1 + len));
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
      // sniff BackendKeyData ('K'): body = int32BE pid + int32BE secret
      let bbuf = chunk;
      while (bbuf.length >= 5) {
        const type = bbuf[0];
        const len = bbuf.readInt32BE(1);
        if (len < 4 || bbuf.length < 1 + len) break;
        if (type === 0x4b) { pids.push(bbuf.readInt32BE(5)); sessionPid = bbuf.readInt32BE(5); }
        bbuf = bbuf.subarray(1 + len);
      }
      if (sessionWithhold || withholdingBackendGlobally) {
        withheldResponseFrames += 1;
        return; // the verdict never reaches the client
      }
      if (!frontend.destroyed) frontend.write(chunk);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      resolve({
        port: address.port,
        armHold: (sql: string) => { armed = sql; },
        armResponseWithhold: (match: string) => { responseWithholdArmed = match; },
        withholdBackendResponses: (active: boolean) => { withholdingBackendGlobally = active; },
        heldFrames: () => [...held],
        backendPids: () => [...pids],
        heldPids: () => [...heldPids],
        responseWithheldPids: () => [...responseWithheldPids],
        withheldResponseFrames: () => withheldResponseFrames,
        closedSessions: () => closedSessions,
        // the close is BOUNDED: the server stops accepting, every frontend
        // and every proxy-created backend socket is destroyed, and a 500ms
        // unref'd ceiling guarantees resolution even if a socket lingers
        close: () => new Promise<void>((res) => {
          let settled = false;
          const finish = (): void => {
            if (settled) return;
            settled = true;
            res();
          };
          const ceiling = setTimeout(finish, 500);
          ceiling.unref?.();
          server.close(finish);
          (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
          for (const backend of liveBackends) {
            try { backend.destroy(); } catch { /* gone */ }
          }
          liveBackends.clear();
        }),
      });
    });
  });
}
