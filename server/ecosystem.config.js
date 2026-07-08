module.exports = {
  apps: [
    {
      name: 'alambre-cables-api',
      script: 'src/index.js',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      error_file: 'logs/error.log',
      out_file: 'logs/output.log',
      merge_logs: true,
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 5000,
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
