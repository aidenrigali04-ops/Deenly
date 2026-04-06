#!/bin/bash
export PATH="/Users/macbookpro/.nvm/versions/node/v24.8.0/bin:$PATH"
cd "$(dirname "$0")/../mobile"
exec npx expo start --port "${PORT:-8082}"
