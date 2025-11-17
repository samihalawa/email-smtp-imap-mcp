#!/bin/bash

echo "🔍 Verifying Email MCP Configuration"
echo ""

# Check if server is in config
if grep -q '"email"' ~/Library/Application\ Support/Claude/claude_desktop_config.json; then
    echo "✅ Email MCP found in Claude config"
else
    echo "❌ Email MCP NOT found in config"
    exit 1
fi

# Check if build exists
if [ -f "build/index.js" ]; then
    echo "✅ Build file exists"
else
    echo "❌ Build file missing - run: npm run build"
    exit 1
fi

# Check if .env exists
if [ -f ".env" ]; then
    echo "✅ .env file exists"
else
    echo "❌ .env file missing"
    exit 1
fi

echo ""
echo "🎉 Everything is configured!"
echo ""
echo "Next: Restart Claude Desktop (Cmd+Q then reopen)"
