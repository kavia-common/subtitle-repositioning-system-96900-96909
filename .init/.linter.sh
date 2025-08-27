#!/bin/bash
cd /home/kavia/workspace/code-generation/subtitle-repositioning-system-96900-96909/subtitle_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

