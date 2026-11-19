"""Fixed private local transport. SO_PEERCRED, never JSON, identifies callers.

No authority lives here: the original Node supervisor rechecks its one original
body descendant, protected registration, schema receipts and PostgreSQL lease.
"""
import json
import os
import select
import socket
import stat
import struct
import sys
import time

LIMIT = 16384


def frame(stream):
    data = bytearray()
    while len(data) <= LIMIT:
        item = stream.recv(1)
        if not item:
            raise ValueError("FRAME_EOF")
        data.extend(item)
        if item == b"\n":
            return json.loads(data)
    raise ValueError("FRAME_LIMIT")


def peer(stream):
    pid, uid, gid = struct.unpack("3i", stream.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    return {"pid": pid, "uid": uid, "gid": gid}


def serve(location, parent_pid, uid):
    if os.getppid() != parent_pid or os.getuid() != uid or len(os.fsencode(location)) > 100:
        raise ValueError("ORIGINAL_PARENT_REQUIRED")
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    os.umask(0o077)
    server.bind(location)
    os.chmod(location, 0o600)
    pinned = os.lstat(location)
    if not stat.S_ISSOCK(pinned.st_mode) or pinned.st_uid != uid or stat.S_IMODE(pinned.st_mode) != 0o600:
        raise ValueError("PRIVATE_SOCKET_REQUIRED")
    server.listen(1)
    server.settimeout(0.2)
    print(json.dumps({"kind": "READY", "pid": os.getpid()}), flush=True)
    sequence = 0
    while os.getppid() == parent_pid:
        # Parent EOF also closes the server; no fence/state is changed.
        if select.select([sys.stdin], [], [], 0)[0]:
            if not sys.stdin.readline():
                break
            raise ValueError("UNSOLICITED_PARENT_FRAME")
        try:
            connection, _ = server.accept()
        except socket.timeout:
            continue
        with connection:
            connection.settimeout(5)
            identity = peer(connection)
            if identity["uid"] != uid:
                continue
            try:
                request = frame(connection)
                sequence += 1
                print(json.dumps({"kind": "REQUEST", "sequence": sequence, "peer": identity, "request": request}), flush=True)
                if not select.select([sys.stdin], [], [], 300)[0]:
                    raise ValueError("PARENT_DEADLINE")
                raw = sys.stdin.buffer.readline(LIMIT + 1)
                if not raw.endswith(b"\n") or len(raw) > LIMIT:
                    raise ValueError("PARENT_FRAME")
                response = json.loads(raw)
                if response.get("sequence") != sequence or type(response.get("ok")) is not bool:
                    raise ValueError("PARENT_BINDING")
                connection.sendall(json.dumps({"ok": response["ok"]}).encode() + b"\n")
            except (OSError, ValueError, json.JSONDecodeError):
                # A disconnected caller does not permit replay or another effect.
                raise ValueError("REQUEST_RESULT_UNRESOLVED") from None
    server.close()


def request(location, expected_pid, operation, args):
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.settimeout(300)
    connection.connect(location)
    identity = peer(connection)
    if identity["pid"] != expected_pid or identity["uid"] != os.getuid():
        raise ValueError("ORIGINAL_SERVER_REQUIRED")
    message = json.dumps({"operation": operation, "args": args}).encode() + b"\n"
    if len(message) > LIMIT:
        raise ValueError("REQUEST_SIZE")
    connection.sendall(message)
    response = frame(connection)
    connection.close()
    if response != {"ok": True}:
        raise ValueError("SUPERVISOR_DENIED")


try:
    mode, location, identity, *rest = sys.argv[1:]
    if mode == "serve" and len(rest) == 1:
        serve(location, int(identity), int(rest[0]))
    elif mode == "request" and rest:
        request(location, int(identity), rest[0], rest[1:])
    else:
        raise ValueError("FIXED_MODE_REQUIRED")
except Exception:
    # No supplied bytes, paths, SQL or private data may enter normal diagnostics.
    sys.stderr.write("MODERN_SCHEMA_BODY_CHANNEL_HOLD\n")
    sys.exit(64)
