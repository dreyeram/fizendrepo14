/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    reactStrictMode: false,
    experimental: {
        serverActions: {
            bodySizeLimit: '100mb',
        },
    },
    webpack: (config, { dev, isServer }) => {
        config.resolve.alias = {
            ...config.resolve.alias,
            sharp: false,
            "onnxruntime-node": false
        };
        if (dev) {
            config.watchOptions = {
                ...config.watchOptions,
                ignored: [
                    '**/node_modules',
                    '**/.git',
                    '**/.wwebjs_auth',
                    '**/whatsapp-debug.log',
                    '**/.wwebjs_auth/**',
                ],
            };
        }
        return config;
    },
};
export default nextConfig;