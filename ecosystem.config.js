module.exports = {
    apps: [
        {
            name: 'endoscopy-suite',
            script: 'node_modules/.bin/next',
            args: 'start -H 0.0.0.0 -p 3000',
            cwd: '/home/lm/loyalmed',
            env: {
                NODE_ENV: 'production',
                DATABASE_URL: 'file:/home/lm/loyalmed/prisma/dev.db',
                JWT_SECRET: 'endoscopy-suite-jwt-secret-change-in-production-to-random-string',
                JWT_REFRESH_SECRET: 'endoscopy-suite-refresh-secret-change-in-production-to-random-string',
                INTERNAL_STORAGE_PATH: './data',
                PORT: 3000,
            },
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/home/lm/loyalmed/logs/error.log',
            out_file: '/home/lm/loyalmed/logs/output.log',
        },
        {
            name: 'pi-capture-daemon',
            script: './scripts/pi_capture_daemon.js',
            cwd: '/home/lm/loyalmed',
            env: {
                VIDEO_DEVICE: '/dev/video0',
                WIDTH: '1920',
                HEIGHT: '1080',
                FRAMERATE: '30',
            },
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '128M',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/home/lm/loyalmed/logs/daemon_error.log',
            out_file: '/home/lm/loyalmed/logs/daemon_output.log',
        }
    ],
};
