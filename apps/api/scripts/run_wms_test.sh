#!/bin/bash

echo "=== 启动 NestJS 后台服务 ==="
npm run start:dev &
NEST_PID=$!

echo "等待服务启动 (10秒)..."
sleep 10

echo "=== 执行仓储链路彩排 ==="
node scripts/test_wms_flow.js

echo "=== 彩排结束，关闭后台服务 ==="
kill $NEST_PID
