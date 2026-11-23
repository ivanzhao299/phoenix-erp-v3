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

以下估算包含两次完整取证耗时、一次额外演练、实测恢复与旧 API 就绪时间的 125%、150 秒恢复余量、180 秒 Web 余量及 10 分钟调度余量。按分钟向上取整。协调人在此步骤通过其真实账号提交精确的开始和结束时间。若估算超过 180 分钟，保持 HOLD 并检查实测耗时。

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
test "$minutes" -le 180
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
