#!/usr/local/bin/bash
# 最新のデプロイIDを取得
LATEST=$(clasp deployments | tail -1)
ID=$(echo "$LATEST" | awk '{print $2}')

echo 'Latest deployments:'
echo "$LATEST"

if [[ -n "$ID" ]]; then
  # 確認用のプロンプトを出力
  read -p "Are you sure you want to deploy with ID $ID? (y/N): " CONFIRMATION

  if [[ "${CONFIRMATION,,}" == "y" ]]; then
    clasp deploy --deploymentId "$ID"
  else
    echo 'Deployment aborted'
  fi
else
  echo 'Not found deployment ID'
fi

