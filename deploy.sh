#!/bin/bash
# 最新のデプロイIDを取得
ID=`clasp deployments | tail -1 | awk '{print $2}'`

if [ -n "$ID" ];then
  clasp deploy --deploymentId $ID
else
  echo 'not found deployment ID'
fi

