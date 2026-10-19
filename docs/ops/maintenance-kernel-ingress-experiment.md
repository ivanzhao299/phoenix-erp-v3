# Owned VM kernel ingress experiment

This CI-only experiment determines whether a fixed, pre-existing kernel fence can
cover the old/new container window without removing candidate database access.
It is not a production firewall controller, authorization adapter, drain receipt,
continuous host inventory proof or installed 17-producer factory.

The current physical gap is concrete: Compose replacement inherits its API bridge
and host port; the old Docker isolation producer follows only old executor IDs.
The application HTTP interceptor permits GET/HEAD/OPTIONS, including the SSE GET
that changes presence and opens a long-lived connection. Application FENCED and
readiness therefore cannot substitute for independent physical ingress controls.

## Deliberately restricted topology

Each PG16/18 job owns an exclusive GitHub-hosted VM and creates one dedicated private IPv4
bridge, synthetic Node HTTP executors, one peer and a real PostgreSQL container.
The bridge is not marked Docker internal: real CI on both PG majors showed
Docker suppresses the required host port publication on an internal network.
The dedicated normal bridge and exact loopback publication match the packet
paths under test; this is not a claim of egress isolation. Test programs contain
only fixed owned-service and database destinations.
The HTTP server deliberately has no application fence. The host publication is
exactly 127.0.0.1:3100. IPv6 is disabled and no IPv6 port publication is accepted.
Database storage and client image VOLUME paths use owned ephemeral tmpfs; no host
DB, business data or production mount is used. SQL clients share the executor's
actual network namespace and perform only SELECT 1 against that owned database.
All immutable container IDs and create/start/stop intents are retained.

Before stopping the synthetic old executor or starting its replacement, a unique
owner-named nftables ruleset drops IPv4 TCP3100 to the owned subnet in host OUTPUT before NAT for the verified unique published loopback port,
after NAT for direct traffic bound to the exact owned bridge output, routed
FORWARD bound to that bridge, and same-bridge peer traffic in bridge FORWARD. The rules contain no global drop policy or ruleset flush.
Namespace inode, bridge interface index, table/chain/rule handles and normalized
kernel expressions are checked against the compiled expected expressions. Packet counters may advance; identity may not.

Actual host and peer requests must time out while the same live service answers
inside its own namespace, its database SELECT succeeds, and the corresponding per-path drop counters advance. Peer traffic records
whether the kernel used routed or bridge filtering; an untested alternative is
not declared passed. This is repeated on the replacement behind the already installed rules.
The old synthetic server has an explicit TERM handler; its stop is not proof that
the actual old API supports graceful shutdown. The earlier PR449 failure remains.

On the successful experiment path, exact owned tables are removed and both
external packet paths must work again. This is experimental rule removal, not a
public OPEN or formal deployment completion. A separate negative scenario removes
both exact owned host rules: the host becomes reachable, identity verification fails,
and a subsequent release request must be refused before any effect. Remaining
negative rules and all resources stay on that disposable VM; resource lifecycle acceptance is
NOT_VERIFIED. The receipt cannot be consumed as complete teardown or factory
acceptance. Failure never triggers automatic destructive cleanup.

Any unexpected state, probe failure, missing tool, command timeout or unknown
outcome is HOLD. There is no retry/reinstall, blanket cleanup or unknown-service
stop. The CLI timeout only ends the original local CLI; a daemon operation can
remain unknown. No production program imports this fixture or accepts its output
as release authority. HTTP probes have absolute deadlines and bounded original-request close joins;
a socket inactivity timeout or unclosed probe cannot count as a denied path.
Unknown Docker exec outcomes are not retried. Local root/kernel execution is NOT_RUN when unavailable;
real PG16/18 hosted results for the exact source are mandatory.

## Local validation before hosted execution

Node 20: 31 policy/probe tests passed, including a real endless-body HTTP
client failure and bounded original-child/server joins. Combined isolated pure
suite: 696 passed, 28 skipped; the skipped Docker/native cases are not inherited
as passes. Workflow YAML/matrix parsing passed. The local host has neither an
available protected root path nor nftables, so actual kernel/PG16/PG18 packet
experiments remain NOT_RUN until the exact source runs in the exclusive CI VM.

## Remaining work

Passing this packet-path experiment would not prove production topology or a
continuous interval: Docker event/loss coverage, independently supervised kernel
rule monitoring, cross-phase lease assembly, real old API and five-domain effects,
formal source/artifact/owner authorization, recovery closure and complete producer
integration remain mandatory. Production host ownership, environment approval
protection, maintenance start/duration and fresh final SHA audit are still absent.

Technical references: [Docker packet filtering](https://docs.docker.com/engine/network/packet-filtering-firewalls/),
[Docker nftables](https://docs.docker.com/engine/network/firewall-nftables/),
[bridge filtering](https://wiki.iptables.org/wiki-nftables/index.php/Bridge_filtering),
[netfilter hooks](https://wiki.nftables.org/wiki-nftables/index.php/Netfilter_hooks).

## Retained first hosted failures

Exact source `2e214adad8ebe22f365d8b0f00a5b44feaf378f5`, run39189126535,
failed before rule installation on both majors. Diagnostic source
`9739062faf485d89fb0a89078ce37cc13b3d0682`, run39189258358, confirmed
`NetworkSettings.Ports={}` at OWNED_PUBLISHED_PORT_BINDING on PG16 and PG18.
Neither run proves packet denial or a successful old/new window. The topology
is corrected to a dedicated non-internal bridge; the exact published-port
assertion, all kernel-expression/counter checks and all failure guards remain.
The new source requires fresh actual hosted receipts.

Hosted source1bedfff0, run39189700969, confirmed the next pre-install failure
on both majors: the runner nft build rejects pipe-backed `/dev/stdin` as
non-regular. Programs are now staged only in new root-owned0600 regular files
inside the experiment's private directory, with no-follow/exclusive creation,
fsync, bytes/hash and file identity checks before/after the command. The same
compiled rule bytes and all kernel assertions remain. No stdin fallback or
unknown-command retry is used. The separate local owned network-namespace
compiler check returned unsupported kernel capability and remains a failure;
it is not evidence of hosted host capability.
