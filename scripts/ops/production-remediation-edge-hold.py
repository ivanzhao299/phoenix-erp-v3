"""Render the temporary public-origin hold for Phoenix incident 45144287071-1.

The input is the pinned installed virtual host. Other virtual hosts and the
loopback ports used by the release supervisor are outside this configuration.
"""
import hashlib
import sys
from pathlib import Path

ORIGINAL_SHA256 = "2843bf385f4ee46c0d3fcb13ecd6712d0af564cc1cd87a5fb01eda90480b9e6e"
SERVER = b"\nserver {\n"
HOLD = b"    # Phoenix maintenance 45144287071-1\n    return 503;\n"


def render(original: bytes) -> bytes:
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError("virtual host changed before installation")
    if original.count(SERVER) != 2 or original.count(b"server_name erp.eggslao.com;") != 2:
        raise ValueError("expected the HTTP and HTTPS Phoenix virtual hosts")
    return original.replace(SERVER, SERVER + HOLD)


if __name__ == "__main__":
    sys.stdout.buffer.write(render(Path(sys.argv[1]).read_bytes()))
