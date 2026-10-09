#!/usr/bin/env bash
# 建立一個「新的、獨立的」Cloud Run 服務，不影響原本 AI Studio 部署的 stock5000。
# 會從原服務複製環境變數（Gemini 金鑰等），並以隱藏輸入的方式設定新的 FinMind Token。
#
# 用法（在 Cloud Shell 的專案資料夾內）：
#   bash scripts/deploy-new-service.sh [新服務名稱] [原服務名稱] [區域]
set -euo pipefail

NEW_SERVICE="${1:-stock5000-claude}"
SOURCE_SERVICE="${2:-stock5000}"
REGION="${3:-asia-east1}"
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT

echo "▶ 從 ${SOURCE_SERVICE} 複製環境變數…"
SECRETS="$(gcloud run services describe "$SOURCE_SERVICE" --region "$REGION" --format=json | python3 -c '
import json, sys
env_file = sys.argv[1]
svc = json.load(sys.stdin)
env = svc["spec"]["template"]["spec"]["containers"][0].get("env", [])
skip = {"FINMIND_API_TOKEN", "FINMIND_TOKEN", "PORT"}
plain, secrets = [], []
for e in env:
    name = e["name"]
    if name in skip:
        continue
    if "value" in e:
        plain.append(name + ": " + json.dumps(e["value"], ensure_ascii=False))
    elif "valueFrom" in e and "secretKeyRef" in e["valueFrom"]:
        ref = e["valueFrom"]["secretKeyRef"]
        secrets.append(name + "=" + ref["name"] + ":" + ref.get("key", "latest"))
with open(env_file, "w") as f:
    f.write("\n".join(plain) + ("\n" if plain else ""))
print(",".join(secrets))
names = [p.split(":")[0] for p in plain] + [s.split("=")[0] for s in secrets]
print("  複製的變數：" + (", ".join(names) or "（無）"), file=sys.stderr)
' "$ENV_FILE")"

echo
read -r -s -p "請貼上新的 FinMind Token（輸入時不會顯示），按 Enter：" FINMIND_TOKEN
echo
if [ -z "$FINMIND_TOKEN" ]; then
  echo "✖ 沒有輸入 Token，已取消。"
  exit 1
fi
python3 -c 'import json,sys; print("FINMIND_API_TOKEN: " + json.dumps(sys.argv[1]))' "$FINMIND_TOKEN" >> "$ENV_FILE"
unset FINMIND_TOKEN

ARGS=(run deploy "$NEW_SERVICE" --source . --region "$REGION" --env-vars-file "$ENV_FILE" --allow-unauthenticated --memory 1Gi)
if [ -n "$SECRETS" ]; then
  ARGS+=(--set-secrets "$SECRETS")
fi

echo "▶ 開始建置並部署 ${NEW_SERVICE}（約 3～6 分鐘）…"
gcloud "${ARGS[@]}"

echo
echo "✔ 完成。原本的 ${SOURCE_SERVICE} 沒有任何變動。"
gcloud run services describe "$NEW_SERVICE" --region "$REGION" --format='value(status.url)'
