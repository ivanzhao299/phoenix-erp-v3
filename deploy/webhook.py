#!/usr/bin/env python3
"""
Phoenix ERP V3 — 部署 Webhook 接收器
由 systemd 启动，nginx 将 /deploy/* 反代到 127.0.0.1:9000

环境变量（通过 /etc/phoenix-webhook.env 注入）：
  DEPLOY_WEBHOOK_TOKEN  必填，Bearer 令牌（GHA Secret 与此一致）
  DEPLOY_PATH           可选，代码根目录（默认脚本父目录的上一级）
  DEPLOY_LOG            可选，日志文件路径（默认 /var/log/phoenix-deploy.log）
  WEBHOOK_PORT          可选，监听端口（默认 9000）

端点：
  POST /deploy/webhook  触发部署（需 Authorization: Bearer <token>）
  GET  /deploy/status   查看部署状态与最近日志（公开，仅展示摘要）
  GET  /deploy/health   健康检查
"""
import hashlib, hmac, json, os, subprocess, sys, time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock, Thread

# ── 配置 ──────────────────────────────────────────────────────────────────────
_TOKEN_STR = os.environ.get('DEPLOY_WEBHOOK_TOKEN', '')
TOKEN      = _TOKEN_STR.encode()
DEPLOY_SH  = Path(os.environ.get('DEPLOY_SCRIPT',
                  str(Path(__file__).parent / 'deploy.sh')))
LOG_FILE   = Path(os.environ.get('DEPLOY_LOG', '/var/log/phoenix-deploy.log'))
PORT       = int(os.environ.get('WEBHOOK_PORT', 9000))
DEPLOY_PATH = os.environ.get('DEPLOY_PATH',
              str(Path(__file__).parent.parent.resolve()))

# ── 状态 ──────────────────────────────────────────────────────────────────────
_lock       = Lock()
_running    = False
_last_sha   = ''
_last_start = ''


def trigger_deploy(sha: str, actor: str) -> tuple[bool, str]:
    global _running, _last_sha, _last_start
    with _lock:
        if _running:
            return False, f'already running (sha={_last_sha[:8]})'
        _running    = True
        _last_sha   = sha
        _last_start = time.strftime('%Y-%m-%d %H:%M:%S')

    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, 'a') as f:
        f.write(f'\n{"=" * 64}\n'
                f'Deploy  sha={sha[:8]}  actor={actor}'
                f'  start={_last_start}\n'
                f'{"=" * 64}\n')

    def _run():
        global _running
        try:
            subprocess.run(
                ['bash', str(DEPLOY_SH), sha, actor],
                stdout=open(LOG_FILE, 'a'),
                stderr=subprocess.STDOUT,
                cwd=DEPLOY_PATH,
                start_new_session=True,
            )
        finally:
            _running = False

    Thread(target=_run, daemon=True).start()
    return True, 'deploy started'


# ── HTTP 处理器 ───────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # 日志由 systemd journal 处理，不重复输出

    def _verify_token(self) -> bool:
        if not TOKEN:
            return False
        auth = (self.headers.get('Authorization') or '').removeprefix('Bearer ')
        return hmac.compare_digest(auth.encode(), TOKEN)

    def _json(self, code: int, body: dict):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/deploy/health':
            self._json(200, {'status': 'ok', 'pid': os.getpid()})

        elif self.path == '/deploy/status':
            try:
                lines = LOG_FILE.read_text(errors='replace').splitlines()[-60:]
            except FileNotFoundError:
                lines = ['[no log yet]']
            self._json(200, {
                'running':    _running,
                'last_sha':   _last_sha[:8] if _last_sha else '',
                'last_start': _last_start,
                'log':        '\n'.join(lines),
            })
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path != '/deploy/webhook':
            self.send_response(404)
            self.end_headers()
            return

        if not self._verify_token():
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'Unauthorized')
            return

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length) or b'{}')
        except Exception:
            body = {}

        sha   = str(body.get('sha',   'unknown'))[:40]
        actor = str(body.get('actor', 'ci'))[:50]

        ok, msg = trigger_deploy(sha, actor)
        self._json(200 if ok else 409, {'ok': ok, 'msg': msg, 'sha': sha[:8]})


# ── 入口 ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if not TOKEN:
        print('ERROR: DEPLOY_WEBHOOK_TOKEN is not set', file=sys.stderr)
        sys.exit(1)
    if not DEPLOY_SH.exists():
        print(f'ERROR: deploy script not found: {DEPLOY_SH}', file=sys.stderr)
        sys.exit(1)

    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    LOG_FILE.touch(exist_ok=True)

    print(f'Phoenix webhook listening on 127.0.0.1:{PORT}')
    print(f'  deploy script : {DEPLOY_SH}')
    print(f'  deploy path   : {DEPLOY_PATH}')
    print(f'  log file      : {LOG_FILE}')

    server = HTTPServer(('127.0.0.1', PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
