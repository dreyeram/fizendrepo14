// =============================================================================
//  ecosystem.config.js  ·  PM2 process configuration  ·  SURGICAL GRADE v4.1
//
//  BEFORE STARTING — install dependencies once:
//    cd ~/loyalmed && npm install ws
//
//  START / RESTART:
//    pm2 delete all
//    pm2 start ecosystem.config.js
//    pm2 save
//    pm2 logs --lines 40
//
//  VERIFY CAPTURE MODE:
//    curl -s http://localhost:5555/status | python3 -m json.tool
//    # Look for: "mode": "ffmpeg"  ← direct V4L2 → WebSocket pipe
// =============================================================================

module.exports = {
    apps: [

        // ── 1. Next.js application server ──────────────────────────────────
        {
            name: 'endoscopy-suite',
            script: 'node_modules/.bin/next',
            args: 'start',
            interpreter: 'none',

            cwd: '/home/lm/loyalmed',
            instances: 1,
            exec_mode: 'fork',

            // Give Next.js time to compile and listen before PM2 marks it running
            wait_ready: false,
            listen_timeout: 60000,

            restart_delay: 3000,
            max_restarts: 10,
            kill_timeout: 8000,

            env: {
                NODE_ENV: 'production',
                PORT: '3000',
                HOSTNAME: '0.0.0.0',

                // ── Prisma / Database ──
                DATABASE_URL: 'file:./prisma/prod.db',

                // ── SECURITY: Move these to a .env file — do NOT commit real values ──
                // Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
                JWT_SECRET: 'REPLACE_WITH_64_BYTE_HEX_SECRET',
                JWT_REFRESH_SECRET: 'REPLACE_WITH_DIFFERENT_64_BYTE_HEX_SECRET',

                // ── Daemon connection (used by Next.js API routes) ──
                CAPTURE_DAEMON_URL: 'http://localhost:5555',
            },

            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/home/lm/loyalmed/logs/nextjs-error.log',
            out_file: '/home/lm/loyalmed/logs/nextjs-out.log',
        },

    ],
};
```