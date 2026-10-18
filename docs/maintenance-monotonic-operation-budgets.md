# Monotonic maintenance operation budgets

The root lease and candidate observer previously measured cumulative time using
only `Date.now()`. A frozen wall clock, or a rollback still above the initial
sample, could extend the remaining operation budget despite per-command limits.
This P1 was found during source review; these components have not been deployed.

Both now use `performance.now()` for elapsed time while retaining wall time for
approval windows and evidence timestamps. Each check rejects nonfinite values,
wall-clock or monotonic rollback, expiry or cancellation. `remaining()` takes
the smaller wall/monotonic remainder from the same checked samples; it does not
read the clocks a second time or round an exhausted fraction up into a new I/O.
Only the exact redacted candidate deadline error is preserved through runtime
read classification. Other errors remain redacted.

Root observation failures still poison the existing lease. Cleanup receives a
new bounded operation budget and still permits closing the original resource
after the old approval window or owner marker expires. The candidate observer
does not close the caller's lease or grant authority on either success or error.

Directed tests cover wall freeze, rollback above start, monotonic rollback,
nonfinite clocks, same-sample remaining budget, a deadline crossed during
synchronous I/O, no later reads and root poison. Logical-time tests explicitly
control both clocks to avoid depending on CI scheduling latency. Actual owned
PG16/18 tests use the default real clocks and verify original-client/server
settlement. The full producer registry and production transition remain blocked.

Monotonic checking is not a hard realtime interrupt or a guarantee about all
system suspend modes. Synchronous I/O and observer children still require the
existing outer supervision and conservative HOLD/recovery handling. No producer,
approval workflow, deployment or production state is enabled by this correction.
