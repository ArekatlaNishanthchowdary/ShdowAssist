#!/bin/bash
# ShadowAssist — macOS Silent Stopper
# Double-click this file in Finder to stop all running app instances.

pkill -f "Electron" 2>/dev/null || true
pkill -f "node scripts/start.js" 2>/dev/null || true
