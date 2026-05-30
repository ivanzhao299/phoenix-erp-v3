#!/bin/bash
# 一键暂存所有变动并提交推送
# 用法：bash commit.sh "你的提交信息"
#       bash commit.sh          （不带参数则自动生成带时间戳的消息）

MSG="${1:-"chore: auto-commit $(date '+%Y-%m-%d %H:%M:%S')"}"
git add -A
git commit -m "$MSG"
git push
echo "✅ 已推送：$MSG"
# post-commit hook installed: 2026-05-30
