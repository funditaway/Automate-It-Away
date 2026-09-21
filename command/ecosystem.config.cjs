/**
 * PM2 process file for the sovereign command center.
 * One fork, loopback only, dry-run dispatch. Start with ./start.sh
 * or `pm2 start ecosystem.config.cjs` from this directory.
 */
module.exports = {
  apps: [
    {
      name: 'aia-command',
      script: 'server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        AIA_PORT: '3000',
        AIA_BIND: '127.0.0.1',
        AIA_DISPATCH_DRY_RUN: '1',
      },
    },
  ],
}
