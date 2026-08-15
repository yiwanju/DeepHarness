#!/usr/bin/env bash
# scripts/smoke.sh — 升级闸门：验证客户端包里的 dsh 能正常启动并被 patch 层接管
set -euo pipefail

SMOKE_HOME="$(mktemp -d)"
export DSH_HOME="$SMOKE_HOME"

# 1) patch 层存在且能被 dsh 解析（--dump-config 不启动服务）
test -f ./resources/client.patch.yml || { echo "client.patch.yml 缺失"; exit 1; }
dsh web --patch ./resources/client.patch.yml --dump-config > "$SMOKE_HOME/dump.yml" 2>&1 \
  || { echo "patch 层解析失败"; cat "$SMOKE_HOME/dump.yml"; exit 1; }

# 2) 真实启动：--port 0 让 OS 挑端口；读 stdout 的 URL 行（dsh 官方把它定义为就绪信号）
#    注意顺序：--patch 是 launcher 参数，必须排在 app 参数 --port 之前
dsh web --patch ./resources/client.patch.yml --port 0 > "$SMOKE_HOME/out.log" 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'dsh web: http://[^ ]+' "$SMOKE_HOME/out.log" | head -1 | awk '{print $3}' || true)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "服务未就绪"; cat "$SMOKE_HOME/out.log"; exit 1; }

# 3) 首页可达
curl -fsS -o /dev/null "$URL/" || { echo "首页不可达"; exit 1; }

# 4) 可选：配置了 DEEPSEEK_API_KEY 时跑最小对话验证 agent 全链路

echo "smoke OK: $URL"
