#!/usr/bin/env bash
# 一鍵建立「FinMind 台股 30 年歷史資料」匯入環境（在 Cloud Shell 的專案資料夾執行）
#   1. 啟用需要的 Google Cloud API
#   2. 建立 Firestore 具名資料庫 stock-history（與學生資料完全分開）
#   3. 建立 Cloud Run 工作：stock-history-full（全量）、stock-history-daily（每日補資料）
#   4. 建立 Cloud Scheduler：交易日 19:00 自動執行每日補資料
#   5. 開始執行全量匯入（背景執行，約 1～2 小時）
#
# FinMind Token 會從現有服務 stock5000-claude 自動複製，不會顯示在畫面上。
set -euo pipefail

PROJECT="${PROJECT:-payfirebase}"
REGION="${REGION:-asia-east1}"
DB="${DB:-stock-history}"
SOURCE_SERVICE="${SOURCE_SERVICE:-stock5000-claude}"

gcloud config set project "$PROJECT" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "▶ 1/5 啟用 API（第一次可能需要 1～2 分鐘）…"
gcloud services enable firestore.googleapis.com bigquery.googleapis.com cloudscheduler.googleapis.com \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com >/dev/null

echo "▶ 2/5 建立 Firestore 資料庫 ${DB}…"
if gcloud firestore databases describe --database="$DB" >/dev/null 2>&1; then
  echo "  已存在，略過"
else
  gcloud firestore databases create --database="$DB" --location="$REGION" --type=firestore-native >/dev/null
  echo "  ✔ 已建立"
fi
# 日K陣列欄位不需要索引：關閉可省下大量索引儲存空間
for f in date open high low close volume amount adj_open adj_high adj_low adj_close; do
  gcloud firestore indexes fields update "$f" --collection-group=kline_daily --database="$DB" \
    --disable-indexes --async >/dev/null 2>&1 || true
done

echo "▶ 3/5 讀取 FinMind Token（從 ${SOURCE_SERVICE} 複製，不顯示）…"
TOKEN="$(gcloud run services describe "$SOURCE_SERVICE" --region "$REGION" --format=json | python3 -c '
import json, sys
env = json.load(sys.stdin)["spec"]["template"]["spec"]["containers"][0].get("env", [])
print(next((e.get("value", "") for e in env if e["name"] == "FINMIND_API_TOKEN"), ""))')"
if [ -z "$TOKEN" ]; then
  echo "✖ ${SOURCE_SERVICE} 沒有設定 FINMIND_API_TOKEN，請先設定再執行。"
  exit 1
fi
ENV_FILE="$(mktemp)"; trap 'rm -f "$ENV_FILE"' EXIT
python3 -c 'import json,sys; print("FINMIND_API_TOKEN: " + json.dumps(sys.argv[1])); print("GOOGLE_CLOUD_PROJECT: " + json.dumps(sys.argv[2])); print("FIRESTORE_DATABASE: " + json.dumps(sys.argv[3]))' \
  "$TOKEN" "$PROJECT" "$DB" > "$ENV_FILE"
unset TOKEN

echo "▶ 4/5 建立 Cloud Run 工作（建置映像檔約 3～5 分鐘）…"
gcloud run jobs deploy stock-history-full --source . --region "$REGION" \
  --command npx --args tsx,scripts/import-history.ts,--mode,full \
  --env-vars-file "$ENV_FILE" --task-timeout 12h --max-retries 2 --memory 2Gi --cpu 1 \
  --service-account "$SA" --quiet

IMAGE="$(gcloud run jobs describe stock-history-full --region "$REGION" --format='value(spec.template.spec.template.spec.containers[0].image)')"
gcloud run jobs deploy stock-history-daily --image "$IMAGE" --region "$REGION" \
  --command npx --args tsx,scripts/import-history.ts,--mode,daily \
  --env-vars-file "$ENV_FILE" --task-timeout 1h --max-retries 2 --memory 1Gi --cpu 1 \
  --service-account "$SA" --quiet

# 排程：週一到週五 19:00（FinMind 約 17:30 更新收盤資料；休市日程式會自動略過）
URI="https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/stock-history-daily:run"
if gcloud scheduler jobs describe stock-history-daily-trigger --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http stock-history-daily-trigger --location "$REGION" \
    --schedule "0 19 * * 1-5" --time-zone "Asia/Taipei" --uri "$URI" --http-method POST \
    --oauth-service-account-email "$SA" >/dev/null
else
  gcloud scheduler jobs create http stock-history-daily-trigger --location "$REGION" \
    --schedule "0 19 * * 1-5" --time-zone "Asia/Taipei" --uri "$URI" --http-method POST \
    --oauth-service-account-email "$SA" >/dev/null
fi
echo "  ✔ 每日排程：週一至週五 19:00（台北時間）"

echo "▶ 5/5 開始全量匯入（背景執行）…"
gcloud run jobs execute stock-history-full --region "$REGION" --async

echo
echo "✅ 設定完成。全量匯入約需 1～2 小時，可隨時關閉 Cloud Shell。"
echo "   查看進度：https://console.cloud.google.com/run/jobs/details/${REGION}/stock-history-full/executions?project=${PROJECT}"
