# Chanjet 并发准入与异步测试生命周期修复

```ini
BASE_MAIN=17700cd1b21e73503a8093fae44c946e4eb10802
TRACK=CHANJET_CONCURRENT_ADMISSION
FAILED_RELEASE_RUN=38002979963
PRODUCTION_LOCK_BUG_CONFIRMED=NO
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
API_TYPECHECK=PASS
LOCAL_ASYNC_BARRIER_TEST=IMPLEMENTED
```

## 根因

失败 run 中两个 `enqueueManualSync()` 都返回 `accepted=true`，原因是恢复集成测试的 mock 业务周期立即完成。第一个 scheduler 在 `setImmediate` 中执行、写入 SUCCESS 并释放 session advisory lock 后，第二个请求才获得锁并合法执行。测试没有在第一个业务执行期间建立重叠屏障，并且断言失败后没有等待异步任务清理，残留任务污染了后续 schedule 测试。

生产锁协议保持一条 QueryRunner session 从 admission 到终态提交和解锁；`ChanjetReadonlyLockLease` 继续校验 backend PID/pg_locks，并在不明状态时销毁连接。没有证据证明生产锁实现存在竞态缺陷。

## 修复

恢复集成测试加入明确的业务进入屏障：A 已持有 session lock、持久化 RUNNING 并进入业务执行后，B 才尝试 admission，B 必须被拒绝；finally 中释放 A 并等待其任务结束，再验证一次远端模拟 GET、SUCCESS、无 advisory lock 残留和 durable 状态。另加顺序手动请求测试，证明前一任务完整释放后后续手动请求仍可合法执行；schedule slot 幂等测试保持不变。

```ini
CONCURRENT_ADMISSION_ROOT_CAUSE=TEST_ASYNC_LIFECYCLE
PRODUCTION_LOCK_BUG_CONFIRMED=NO
TEST_ASYNC_LIFECYCLE_FIXED=YES
MANUAL_ADMISSION_RESULT=ONE_ACCEPTED_ONE_REJECTED_WHILE_A_HELD
SCHEDULE_IDEMPOTENCY_RESULT=RETAINED
```

本修复没有修改生产 scheduler 或 lock lease 实现。
