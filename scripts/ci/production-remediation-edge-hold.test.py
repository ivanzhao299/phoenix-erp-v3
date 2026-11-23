"""Exercise the pinned virtual host and a neighbouring virtual host in Docker."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("edge", ROOT / "scripts/ops/production-remediation-edge-hold.py")
edge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)


def run(*command):
    return subprocess.check_output(command, stderr=subprocess.STDOUT).decode().strip()


def exercise(folder):
    config = folder / "conf"
    certs = folder / "certs"
    live = certs / "live/erp.eggslao.com"
    config.mkdir()
    live.mkdir(parents=True)
    original = subprocess.check_output(["git", "show", "5cf0c6cf36c871b53b8a259c5e9b1d36cbf74b11:nginx/erp.eggslao.com.conf"], cwd=ROOT)
    site = config / "phoenix.conf"
    site.write_bytes(original)
    held = edge.render(original)
    try:
        edge.render(original + b"# changed\n")
    except ValueError:
        pass
    else:
        raise AssertionError("modified origin accepted")
    (config / "neighbour.conf").write_text("""
map $request_uri $phoenix_chanjet_hold { default 0; }
server { listen 80 default_server; listen [::]:80 default_server; server_name neighbour.invalid; return 204; }
server { listen 127.0.0.1:3000; return 200 'web'; }
server { listen 127.0.0.1:3100; return 200 'api'; }
""")
    (certs / "options-ssl-nginx.conf").touch()
    run("openssl","req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=erp.eggslao.com","-addext","subjectAltName=DNS:erp.eggslao.com","-keyout",str(live/"privkey.pem"),"-out",str(live/"fullchain.pem"))
    run("openssl","genpkey","-genparam","-algorithm","DH","-pkeyopt","group:ffdhe2048","-out",str(certs/"ssl-dhparams.pem"))
    cid = run("docker","run","--rm","-d","-p","127.0.0.1::80","-p","127.0.0.1::443","-v",str(config)+":/etc/nginx/conf.d:ro","-v",str(certs)+":/etc/letsencrypt:ro","nginx:1.28-alpine")
    try:
        http = run("docker","port",cid,"80/tcp").split(":")[-1]
        tls = run("docker","port",cid,"443/tcp").split(":")[-1]
        def probe(path, code, https=True, hostname="erp.eggslao.com"):
            port = tls if https else http
            cmd = ["curl","--noproxy","*","--max-time","3","--silent","--output",os.devnull,"--write-out","%{http_code}","--cacert",str(live/"fullchain.pem"),"--resolve",f"{hostname}:{port}:127.0.0.1",f"{'https' if https else 'http'}://{hostname}:{port}{path}"]
            for _ in range(40):
                result = subprocess.run(cmd, capture_output=True)
                if result.stdout.decode()==str(code):
                    return
                time.sleep(.15)
            raise AssertionError((path,code,result.stdout,result.stderr))
        probe("/login",200)
        probe("/",204,False,"neighbour.invalid")
        for contents, expected in ((held,503),(original,200)):
            staging=site.with_suffix(".new");staging.write_bytes(contents);staging.replace(site)
            run("docker","exec",cid,"nginx","-t")
            run("docker","exec",cid,"nginx","-s","reload")
            probe("/login",expected)
            probe("/api/health",expected)
            probe("/",503 if expected==503 else 301,False)
            probe("/",204,False,"neighbour.invalid")
            if expected==503:
                v6=subprocess.run(["docker","exec",cid,"wget","-S","-O","/dev/null","--header","Host: erp.eggslao.com","http://[::1]/login"],capture_output=True)
                assert b"503 Service Temporarily Unavailable" in v6.stderr, v6.stderr
        print("PASS: unchanged neighbour, HTTP, TLS, IPv6, public API/login, restored origin, and input drift")
    finally:
        subprocess.run(["docker","stop","-t","3",cid],stdout=subprocess.DEVNULL,check=True)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as work:
        exercise(Path(work))
