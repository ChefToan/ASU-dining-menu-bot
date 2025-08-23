module.exports = {
  apps: [
    {
      name: 'asu-dining-bot',
      script: './dist/index.js',
      cwd: '/home/ubuntu/asu-dining-menu-bot',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      },
      log_file: '/home/ubuntu/asu-dining-menu-bot/logs/combined.log',
      out_file: '/home/ubuntu/asu-dining-menu-bot/logs/out.log',
      error_file: '/home/ubuntu/asu-dining-menu-bot/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],
      env_file: '/home/ubuntu/asu-dining-menu-bot/.env'
    }
  ]
};