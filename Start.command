#!/bin/bash
# ShadowAssist — macOS Silent Launcher
# Double-click this file in Finder to launch the app without keeping a terminal open.

# Resolve the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Include standard macOS Node.js paths (Homebrew Apple Silicon & Intel, NVM, default)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Kill any stale Electron process to prevent single-instance lock deadlocks
pkill -f "Electron" 2>/dev/null || true

# Launch npm start silently in the background
nohup npm start > /dev/null 2>&1 &
