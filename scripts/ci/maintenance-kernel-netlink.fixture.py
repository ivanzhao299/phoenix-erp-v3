"""Read-only owned-VM NFT event transport, NOT continuous ingress approval.

UAPI: linux/netlink.h, netfilter/nfnetlink.h, netfilter/nf_tables.h.
The original socket is retained until CLOSE. No nft mutation, resync-to-success,
root fallback, namespace switch, command selection, or raw packet output.
Actual multicast readiness still requires an approved parent sentinel exercise.
"""
import errno
import hashlib
import json
import os
import re
import select
import socket
import struct
import sys
import time


class ObserverHold(Exception):
    pass


def hold(code):
    raise ObserverHold("OWNED_NETLINK_HOLD=" + code)


def attributes(payload):
    result = {}
    at = 0
    while at < len(payload):
        if len(payload) - at < 4:
            hold("ATTRIBUTE_HEADER")
        size, kind = struct.unpack_from("=HH", payload, at)
        kind &= 0x3FFF
        aligned = (size + 3) & ~3
        if size < 4 or at + aligned > len(payload) or kind in result:
            hold("ATTRIBUTE_LENGTH_OR_DUPLICATE")
        result[kind] = payload[at + 4:at + size]
        at += aligned
    return result


def parse_datagram(data, sender_pid, receive_flags, owned_table, readiness_table, group):
    """Pure framing/classification only. Never infer reliable delivery from seq.
    Return hashes and closed metadata, excluding foreign names/process strings.
    """
    if sender_pid != 0 or receive_flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC) or group not in (0, 7):
        hold("KERNEL_OR_TRUNCATION")
    if not isinstance(data, bytes) or not 16 <= len(data) <= 65536:
        hold("DATAGRAM_LENGTH")
    at, result = 0, []
    # Only notifications known to the compiled UAPI. GET replies other than
    # this socket's GETGEN are not solicited by this program.
    notifications = {0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 18, 20, 22, 24,
                     26, 27, 28, 29, 30, 31, 32}
    while at < len(data):
        if len(data) - at < 16:
            hold("MESSAGE_HEADER")
        size, kind, flags, sequence, port_id = struct.unpack_from("=IHHII", data, at)
        aligned = (size + 3) & ~3
        if size < 16 or at + aligned > len(data) or flags & 0x10:
            hold("MESSAGE_LENGTH_OR_DUMP_INTERRUPTED")
        packet = data[at:at + size]
        payload = packet[16:]
        row = {"messageType": kind, "sequence": sequence, "deliveryGroup": group,
               "messagePortId": port_id, "frameSha256": hashlib.sha256(packet).hexdigest()}
        if kind == 4:  # NLMSG_OVERRUN is not a recoverable resync.
            hold("OVERRUN")
        if kind == 2:
            # This channel does not request extended ACKs. A successful ACK
            # contains errno + the original header, capped on current kernels.
            if len(payload) != 20 or flags not in (0, 0x100) or group != 0:
                hold("ERROR_FRAME")
            if struct.unpack_from("=i", payload)[0] != 0:
                hold("KERNEL_ERROR")
            length, request_type, request_flags, request_seq, request_port = struct.unpack_from("=IHHII", payload, 4)
            if length != 20 or request_type != (10 << 8) | 16 or request_flags != 5:
                hold("ACK_REQUEST_HEADER")
            row.update({"kind": "ACK", "requestSequence": request_seq, "requestPortId": request_port})
        elif kind >> 8 == 10:
            operation = kind & 255
            if len(payload) < 4 or payload[1] != 0:
                hold("NFGEN_HEADER")
            attr = attributes(payload[4:])
            row.update({"kind": "NFT", "operation": operation, "family": payload[0]})
            if operation == 15:  # NFT_MSG_NEWGEN, including GETGEN reply.
                if 1 not in attr or len(attr[1]) != 4:
                    hold("GENERATION_REQUIRED")
                row.update({"kind": "GENERATION", "generation": struct.unpack("!I", attr[1])[0]})
            elif operation in notifications:
                name = attr.get(1)
                if not name or name[-1:] != b"\0" or b"\0" in name[:-1] or len(name) > 256:
                    hold("TABLE_ATTRIBUTE_REQUIRED")
                row["tableScope"] = ("OWNED" if name[:-1] == owned_table.encode("ascii")
                                     else "READINESS" if name[:-1] == readiness_table.encode("ascii")
                                     else "FOREIGN")
            else:
                hold("UNKNOWN_NFT_OPERATION")
        else:
            hold("UNKNOWN_MESSAGE_TYPE")
        result.append(row)
        at += aligned
    return result


class OwnedNetlinkSocket:
    def __init__(self, owner, overflow_counterexample=False):
        if not re.fullmatch(r"[0-9]{1,20}-[0-9]{1,10}", owner):
            hold("OWNER_REQUIRED")
        if os.getuid() != 0 or os.path.exists("/.dockerenv") or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted":
            hold("EXCLUSIVE_VM_REQUIRED")
        self.namespace = os.readlink("/proc/self/ns/net")
        digest = hashlib.sha256(owner.encode("ascii")).hexdigest()[:32]
        self.owned_table, self.readiness_table = "phoenix_fixture_" + digest, "phoenix_ready_" + digest
        self.socket = socket.socket(socket.AF_NETLINK, socket.SOCK_RAW, 12)
        try:
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096 if overflow_counterexample else 1048576)
            self.receive_buffer = self.socket.getsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF)
            if overflow_counterexample and not 1 <= self.receive_buffer <= 8192:
                hold("COUNTEREXAMPLE_BUFFER_UNVERIFIED")
            # Never suppress ENOBUFS. It poisons the complete observation run.
            self.socket.setsockopt(270, 5, 0)
            self.socket.setsockopt(270, 3, 1)  # NETLINK_PKTINFO: actual destination group
            self.socket.bind((0, 1 << 6))  # NFNLGRP_NFTABLES == 7
            self.port_id, groups = self.socket.getsockname()
            memberships = self.socket.getsockopt(270, 9, 128)
            actual = [n for n in struct.unpack("=" + "I" * (len(memberships) // 4), memberships) if n]
            # LIST_MEMBERSHIPS returns bitmap words, not group-number entries:
            # net/netlink/af_netlink.c::netlink_getsockopt in upstream Linux.
            if groups != 64 or actual != [64] or self.socket.getsockopt(270, 5) != 0 or self.socket.getsockopt(270, 3) != 1 or self.port_id <= 0:
                hold("SUBSCRIPTION_UNVERIFIED")
            self.socket.setblocking(False)
        except BaseException:
            self.socket.close()
            raise
        self.started = time.monotonic()
        self.sequence = 0
        self.frames = []
        self.reported_index = 0
        self.chain = "0" * 64
        self.failed = False
        self.last_generation = None

    def check(self):
        if self.failed or time.monotonic() - self.started >= 1800 or os.readlink("/proc/self/ns/net") != self.namespace:
            self.failed = True
            hold("FAILED_WINDOW_OR_NAMESPACE")

    def receive(self):
        self.check()
        try:
            data, ancillary, flags, sender = self.socket.recvmsg(65536, 256)
            if len(ancillary) != 1 or ancillary[0][:2] != (270, 3) or len(ancillary[0][2]) != 4:
                hold("DELIVERY_GROUP_UNVERIFIED")
            group = struct.unpack("=I", ancillary[0][2])[0]
            if len(sender) != 2 or group not in (0, 7) or sender[1] != (64 if group == 7 else 0):
                hold("DELIVERY_GROUP_MISMATCH")
            rows = parse_datagram(data, sender[0], flags, self.owned_table, self.readiness_table, group)
            for row in rows:
                if len(self.frames) >= 4096:
                    hold("EVENT_BUDGET")
                row = {**row, "localIndex": len(self.frames) + 1,
                       "receivedMonotonicNs": str(time.monotonic_ns())}
                self.chain = hashlib.sha256((self.chain + json.dumps(row, sort_keys=True, separators=(",", ":"))).encode("ascii")).hexdigest()
                self.frames.append(row)
                if row["kind"] == "GENERATION":
                    self.last_generation = row["generation"]
            self.check()
            return rows
        except BlockingIOError:
            return []
        except OSError as error:
            self.failed = True
            hold("RECEIVE_ENOBUFS" if error.errno == errno.ENOBUFS else "SOCKET_IO")
        except BaseException:
            self.failed = True
            raise

    def probe(self, nonce, timeout_ms=2000):
        self.check()
        if not isinstance(nonce, str) or not re.fullmatch(r"[a-f0-9-]{36}", nonce) or type(timeout_ms) is not int or not 1 <= timeout_ms <= 2000:
            hold("FIXED_PROBE_REQUIRED")
        self.sequence += 1
        sequence, before, deadline = self.sequence, self.reported_index, time.monotonic() + timeout_ms / 1000
        # Same subscribed socket, not a fresh replacement socket. Sequence is a
        # request correlation only, never proof of multicast event completeness.
        request = struct.pack("=IHHII", 20, (10 << 8) | 16, 1 | 4, sequence, self.port_id) + b"\0\0\0\0"
        ack, generation = False, None
        try:
            if self.socket.sendto(request, (0, 0)) != len(request):
                hold("SEND_UNVERIFIED")
            while not ack or generation is None:
                self.check()
                left = deadline - time.monotonic()
                if left <= 0:
                    hold("PROBE_TIMEOUT")
                if not select.select([self.socket], [], [], left)[0]:
                    hold("PROBE_TIMEOUT")
                for row in self.receive():
                    # Another writer's multicast may use the same sequence.
                    # It never satisfies this socket's unicast request pair.
                    if row["deliveryGroup"] == 0:
                        if row["sequence"] != sequence or row["messagePortId"] != self.port_id:
                            hold("UNEXPECTED_UNICAST_IDENTITY")
                        if row["kind"] == "ACK":
                            if ack or row["requestSequence"] != sequence or row["requestPortId"] != self.port_id:
                                hold("ACK_REQUEST_IDENTITY")
                            ack = True
                        elif row["kind"] == "GENERATION":
                            if generation is not None or row["family"] != 0:
                                hold("GENERATION_REPLY_IDENTITY")
                            generation = row["generation"]
                        else:
                            hold("UNEXPECTED_PROBE_REPLY")
            self.check()
            if time.monotonic() >= deadline or len(self.frames) - before > 256:
                hold("PROBE_DEADLINE_OR_DELTA_BUDGET")
            result = {"nonce": nonce, "originalSocketPortId": self.port_id, "membership": [7],
                    "socketReceiveBufferBytes": self.receive_buffer,
                    "namespace": self.namespace, "generation": generation, "acknowledged": ack,
                    "eventCount": len(self.frames), "eventChainSha256": self.chain,
                    "events": self.frames[before:], "multicastReadiness": "NOT_PROVED_REQUIRES_PARENT_SENTINEL",
                    "continuousIngressProof": False, "productionAuthority": False, "fixtureOnly": True}
            self.reported_index = len(self.frames)
            return result
        except BaseException:
            self.failed = True
            raise

    def close(self):
        self.socket.close()  # Read transport only; NEVER removes kernel rules.


def main():
    observer = None
    try:
        if len(sys.argv) != 3 or sys.argv[1] not in ("--owned-readonly-channel", "--owned-readonly-overflow-counterexample"):
            hold("FIXED_COMMAND_REQUIRED")
        observer = OwnedNetlinkSocket(sys.argv[2], overflow_counterexample=sys.argv[1] == "--owned-readonly-overflow-counterexample")
        # No automatic readiness claim. The parent must consume a fresh PROBE
        # and then prove actual multicast readiness under approved setup intent.
        os.set_blocking(0, False)
        os.set_blocking(1, False)
        buffered = b""

        def send(value):
            data = json.dumps(value, separators=(",", ":")).encode("ascii") + b"\n"
            if len(data) > 262144:
                hold("RESPONSE_BYTE_BUDGET")
            deadline = time.monotonic() + 1
            while data:
                left = deadline - time.monotonic()
                if left <= 0 or not select.select([], [1], [], left)[1]:
                    hold("PARENT_OUTPUT_BACKPRESSURE")
                written = os.write(1, data)
                if written < 1:
                    hold("PARENT_OUTPUT_CLOSED")
                data = data[written:]

        while True:
            observer.check()
            readable = select.select([0, observer.socket], [], [], 1)[0]
            if observer.socket in readable:
                observer.receive()
            if 0 not in readable:
                continue
            chunk = os.read(0, 4096)
            if not chunk:
                hold("PARENT_CHANNEL_EOF")
            buffered += chunk
            if len(buffered) > 4096:
                hold("REQUEST_BYTE_BUDGET")
            while b"\n" in buffered:
                line, buffered = buffered.split(b"\n", 1)
                request = json.loads(line)
                if type(request) is not dict:
                    hold("FIXED_REQUEST_REQUIRED")
                if set(request) == {"operation", "nonce"} and request["operation"] == "PROBE":
                    send(observer.probe(request["nonce"]))
                elif request == {"operation": "CLOSE"}:
                    observer.close()
                    send({"originalSocketClosed": True, "kernelRulesRemoved": False})
                    return 0
                else:
                    hold("UNKNOWN_REQUEST")
    except BaseException as error:
        code = str(error) if isinstance(error, ObserverHold) else "OWNED_NETLINK_HOLD=IO_OR_PARSE_UNVERIFIED"
        print(code, file=sys.stderr, flush=True)
        return 64
    finally:
        if observer is not None:
            observer.close()


if __name__ == "__main__":
    sys.exit(main())
