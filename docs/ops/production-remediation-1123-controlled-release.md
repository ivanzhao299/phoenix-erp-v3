# 2026 年 11 月 23 日生产管理候选发布

本流程供获用户委托的发布协调人执行，代码验证与维护窗口批准分别留证。审批身份是当前 GitHub 登录的 `emvia`（账号 ID `7245339`）。发布只覆盖旧运行版本 `6bb885442` 之后经审查的三项迁移和同一主分支版本的 API、Web。原两组历史超额与合计 60 枚的批准范围继续保留原始 HOLD。首次试点登记、权限分离、实物盘点和业务签认另行办理。

以下命令在同一个 Bash 中运行，使用 gh、Git、Python 3 和 GNU date。只向标准输出写入公开回执字段。GitHub 凭据由 gh 自身管理。

## 1. 确认候选和独立验收

```bash
set -euo pipefail
export GH_REPO=ivanzhao299/phoenix-erp-v3
main_sha() { gh api "repos/$GH_REPO/commits/main" --jq .sha; }
target=$(main_sha)
test "$(gh api user --jq '[.login, (.id | tostring)] | join(":")')" = emvia:7245339
success_run() {
  gh run list --branch main --workflow "$1" --event "$2" --commit "$target" --status success \
    --json databaseId --limit 1 --jq '.[0].databaseId // empty'
}
ci=$(success_run deploy.yml push)
uat=$(success_run production-remediation-acceptance.yml push)
if [[ -z $uat ]]; then uat=$(success_run production-remediation-acceptance.yml workflow_dispatch); fi
test -n "$ci" && test -n "$uat" && test "$ci" != "$uat"
gh run view "$ci" --json conclusion,headSha,jobs
gh run view "$uat" --json conclusion,headSha,jobs
```

如候选验收尚在进行，等其结束后重新取号。如同一主分支提交尚未运行独立验收，可执行 `gh workflow run production-remediation-acceptance.yml --ref main`，再等待该运行。API 登记时会独立读取 GitHub 作业及步骤，核验类型检查、两个镜像的推送、PG18 事务/权限、双地址族围栏、桌面/移动 Chromium、旧版 API/历史回执、冷装，以及候选 API 镜像与真实登录权限五项验收步骤的实际成功状态。

## 2. 只读取证

以下函数记录本次 dispatch 之前最大的运行号，并按候选、工作流、运行名称、事件和账号唯一定位新运行。同一协调人一次执行一个同名请求。匹配多个、等待超时或名称不符时，从 Actions 确认本次运行号和输入，避免重复发起。

```bash
dispatch() {
  local selection=$1 previous rows i
  shift
  test "$(main_sha)" = "$target" || return 1
  previous=$(gh run list --workflow deploy.yml --event workflow_dispatch --limit 1 \
    --json databaseId --jq '.[0].databaseId // 0') || return 1
  gh workflow run deploy.yml --ref main -f approve_production=true -f preserve_artifacts=true \
    -f run_migrations=false -f modern_schema_resume_owner="$selection" "$@" >&2 || return 1
  for ((i=0;i<30;i++)); do
    rows=$(gh run list --workflow deploy.yml --event workflow_dispatch --user emvia --branch main \
      --commit "$target" --limit 50 --json displayTitle,databaseId | \
      python3 -c 'import json,sys; rows=[r["databaseId"] for r in json.load(sys.stdin) if r["displayTitle"]==sys.argv[1] and r["databaseId"]>int(sys.argv[2])]; print(*rows,sep="\n")' "$selection" "$previous") || return 1
    if [[ -n $rows ]]; then [[ $rows =~ ^[0-9]+$ ]] || return 1; echo "$rows"; return 0; fi
    sleep 4
  done
  return 1
}
api_fields=(-f mode=api -f modern_schema_release=true -f approved_config_floor_sha="$target")
inspect_id=$(dispatch inspect1123 "${api_fields[@]}")
gh run watch "$inspect_id" --exit-status
attempt() { gh api "repos/$GH_REPO/actions/runs/$1" --jq '.run_attempt'; }
inspect_owner="$inspect_id-$(attempt "$inspect_id")"
preview=$(gh run view "$inspect_id" --log | python3 -c '
import json,sys
prefix="{\"schema\":\"phoenix.remediation-1123-public-inspection/v1\""
rows=[json.loads(line[line.index(prefix):]) for line in sys.stdin if prefix in line]
assert len(rows)==1 and rows[0]["owner"]==sys.argv[1] and rows[0]["targetSha"]==sys.argv[2]
print(json.dumps(rows[0]))' "$inspect_owner" "$target")
printf '%s\n' "$preview" | python3 -m json.tool
field() { python3 -c 'import json,sys; v=json.load(sys.stdin); print(v[sys.argv[1]])' "$1" <<<"$preview"; }
floor=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["binding"]["floorSha"])' <<<"$preview")
digest=$(field inspectionSha256)
```

取证不需要预填旧 floor。主机会从受保护的当前 floor 读取旧锚点，核对旧版本、旧账本、前次 20 项原始回执和两个历史测试组，核对新镜像与三项源/编译摘要，并在隔离副本实测恢复及旧 API 启动。API 新业务表在切换后须由真实运行登录验证读写。未登记现场即使维持原有高权限角色，也会在证据中显示 `PILOT_NOT_READY`。该状态不能用于启用试点。

2026 年 11 月 23 日，候选 `f5e644a38` 的首次取证在 PLAN 阶段停止。随后从既有受控只读入口核对，运行 API 仍为 `6bb885442`，原生账本摘要仍为 `4bd27f1eb8eb96fa1dfd18e39ef2f81aaaa9628c396d3b2413451845336381e4`。三项迁移均待执行，原始审计结论为 HOLD。失败运行不能作为窗口批准凭证。[首次取证](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45130655916) · [独立账本核对](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45132098701)

## 3. 批准精确窗口并发布 API

以下估算包含两次完整取证耗时、一次额外演练、实测恢复与旧 API 就绪时间的 125%、150 秒恢复余量、180 秒 Web 余量及 10 分钟调度余量。按分钟向上取整。协调人在此步骤通过其真实账号提交精确的开始和结束时间。常规审批上限为 180 分钟。11 月 23 日事故自原批准起点 17:07:52 累计延长至 720 分钟，截止 11 月 24 日 05:07:52（新加坡时间）。GitHub 托管的单次作业仍受 360 分钟上限。排队、演练、旧服务恢复、API 和 Web 都计入这段总时间。已消费的原批准、原租约及历史数据保持原值。只调整时限不能接管处于 HOLD 的发布。

```bash
elapsed=$(gh api "repos/$GH_REPO/actions/runs/$inspect_id" --jq '[.run_started_at,.updated_at] | join(" ")')
read -r first last <<<"$elapsed"
inspect_seconds=$(( $(date -d "$last" +%s) - $(date -d "$first" +%s) ))
test "$inspect_seconds" -gt 0
restore_ms=$(field restoreMs)
ready_ms=$(field originalReadyMs)
rehearsal_ms=$(field rehearsalMs)
needed=$((2*inspect_seconds + (rehearsal_ms+999)/1000 + (5*(restore_ms+ready_ms)+3999)/4000 + 150 + 180 + 600))
minutes=$(((needed+59)/60))
test "$minutes" -le 180  # 常规新发布；已消费的事故由单独接管流程处理
start=$(date -u +%s)
end=$((start+minutes*60))
selection="approve1123-$inspect_owner-$digest-$ci-$uat-$start-$end"
printf '主分支 %s，窗口 %s 至 %s（新加坡时间）\n' "$target" \
  "$(TZ=Asia/Singapore date -d "@$start" -Iseconds)" "$(TZ=Asia/Singapore date -d "@$end" -Iseconds)"
api_id=$(dispatch "$selection" "${api_fields[@]}" -f approved_previous_floor_sha="$floor")
api_owner="$api_id-$(attempt "$api_id")"
gh run watch "$api_id" --exit-status
```

审批文本由 GitHub 原生运行标题、实际 workflow_dispatch、OIDC 身份、受保护的取证回执和当时最新 main 共同绑定。主机会重新取证，并在第一次围栏和 DDL 前以剩余时间与两次实测耗时复核预算。生产迁移、API 结清和 Web 切换属于同一窗口。API 返回 HOLD 时，记录原 run/attempt、公开结果及已完成阶段；避免重放迁移。原 API 已持久化 OPEN、仅终验中断时，既有数字 owner 续发入口可以在其合同允许范围内补终验，保留原 API owner 与回执。

## 4. 发布同版 Web 和补封

```bash
web_selection="web1123-$api_owner"
web_id=$(dispatch "$web_selection" -f mode=web)
gh run watch "$web_id" --exit-status
gh run view "$web_id" --json url,headSha,conclusion,jobs
```

Web 首次切换验证原 API 成功凭证、当前双镜像、专属候选、业务访问证据和维护窗口剩余时间。首次切换后，原 Web 在窗口内写入检查记录，标准部署状态机完成正式 SUCCESS，随后才封存。若主机进程或 CI 在标准 SUCCESS 与封存间中断，重新执行本节同一命令即可。新 run 在部署入口以当前双镜像、实际 active、原 Web 完整 SUCCESS 摘要、原 API 终验及原批准记录核对旧回执，只封存原 Web owner。这个动作允许跨窗，命中后提前结束，镜像和容器均不切换。途中留下未结交易、只有 SWITCHING、凭证被撤销或任一事实改变时继续 HOLD。

记录三次运行链接、API/Web 运行镜像与 OCI revision、三项迁移回执、原始审计 HOLD、默认关闭和试点状态。正式分次入库的业务开关保持关闭。

### 11 月 23 日围栏内的数据库取证

事故原运行 `45144287071-1` 保留 `FRESH_RECHECKED/HOLD`。公网 HTTP 和 HTTPS 的 Phoenix 虚拟主机于新加坡时间 19:26 排空旧 worker，首页、登录与健康路径均经外部复核返回 503。取证时须同时保有该配置和原生 inet、bridge 两道 API 围栏。

在主干运行 `production-modern-original-recovery.yml`，选择 `inspect_held_facts=true`、`approve_stopped_original=false`、`approve_forward_api=false`，输入原运行和它的完整目标 SHA。取证在新的数据库双锁租约下，用只读重复读快照核对原第 5 步封存的完整逐表及序列记录。输出 MATCH、DIFFERENCE 或 HOLD，含差异对象数或失败代码。成功后核实本次租约已退出。三个结果均保留停机状态。后续接管还须单独取得受控恢复、迁移和双端发布回执。

### 围栏内接管与 Web 验收

`45168560404-1` 取证成功，原租约与取证租约均已退出。主干上的 `production-modern-original-recovery.yml` 先选择 `rehearse_held_takeover=true`，其余操作均为 false。填写原运行、原目标和 `held_inspection_owner`。演练核验至状态变更前，保留原容器、围栏与后台清单，确认新租约已退出后产生 HANDOFF_REHEARSED。实际接管另开运行，选择 `approve_held_takeover=true` 并填写 `held_rehearsal_owner`。程序核对同一主干提交、原运行、取证和现场演练回执。新作业先核对原启动命令、容器启动纳秒时间、原 0–5 步、不存在后续 DDL 意图、停机时保护的数据库目录、业务事实和原生租约，再在新双锁下复测。内部后台清单只授予空任务列表。旧 API 同一次启动持续运行，外侧 503 和两道旧原生围栏持续有效。

在新目标的独立核验和主干构建均通过后，按本手册已有次序执行 inspect、approve、web。旧 native 围栏覆盖整个 API 发布和 Web 切换。Web 在正式候选 API 容器内核验就绪。封存同版 API 与 Web 成功回执后，才可按原 nft 身份撤下旧原生围栏。确认丢失时以相同 `web1123-<api-owner>` 查回，必须有正确的删除意图及双族状态。本次发布保留外层 Nginx 维护页，并持续验证公网 503。累计截止为 2026-11-24 05:07:52 新加坡时间。

延长只适用于承接已封存接管的直接后继版本。后继复核原接管及 18 个停机演练容器的精确凭证，单独完成同提交构建、独立验收及新取证，再使用同一累计截止发起正式批准。原启动取证和现场接管已结清，其原授权边界照常核验。


### 第二次排空后的受控收尾

原作业 `45228188093-1 / 3e2ea4ea` 在第 1 步 `DRAINED/HOLD` 结束。旧 API 同一次启动仍健康。本轮的两道新原生围栏、停机意图和 DDL 意图均缺席。首次审批及 720 分钟截止保持原记录。

合并专用续发后，在 `production-modern-original-recovery.yml` 分别运行 `rehearse_held_takeover` 和 `approve_held_takeover`。两次都填第二次失败 owner、目标完整 SHA 和 `held_inspection_owner=45168560404-1`。正式收尾还填同主干提交的 `held_rehearsal_owner`。使用新的双锁租约核验完整数据库事实、目录、旧启动和围栏，原租约及演练租约退出得到原生确认。正式收尾封存已消费的失败尝试，保留公网维护、旧双族规则和空后台授权。保留原失败记录及 31 个历史演练容器。

只有同 SHA 的主干构建、验收、现场演练及收尾成功后才能取证新目标。使用新取证摘要及两项 CI 运行号，在用户授权的新窗口独立发起 API 批准。单次 GitHub 作业仍限 360 分钟，按实际调度保留回执时间。Web 和原生撤栏继续遵守此窗口，外层维护在切换及验收期间持续有效。


若该已封存发布的 Docker 默认地址池无法再分配，专用网络修正提交只修改演练分配和相关来源校验。由本机路由与 Docker IPAM 实际盘点，在 10.254.113.0/24 中选择首个无重叠的 /28，创建 internal bridge 并核对原生 IPAM 回执。保留现有网络和容器，不修改 Docker 全机配置。网络修正仍需新主干镜像、验收和取证，原收尾回执保持同一 SHA。
