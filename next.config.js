const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  async redirects() {
    return [
      {
        source: '/',
        destination: '/togo',
        permanent: false,
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
