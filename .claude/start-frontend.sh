#!/bin/bash
export PATH="/Users/macbookpro/.nvm/versions/node/v24.8.0/bin:$PATH"
cd "$(dirname "$0")/../frontend"
exec npx next dev --port "${PORT:-3001}"
