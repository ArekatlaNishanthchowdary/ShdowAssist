'use strict';

// Cross-platform replacement for `env -u ELECTRON_RUN_AS_NODE electron .`
// (`env -u` is Unix-only and fails under native Windows shells like
// PowerShell/cmd.exe, which npm uses by default on Windows).
// ELECTRON_RUN_AS_NODE must be cleared before the Electron binary starts,
// since Electron reads it at boot to decide whether to run as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const electron = require('electron');

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
