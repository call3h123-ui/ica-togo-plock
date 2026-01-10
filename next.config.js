/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
module.exports = nextConfig;
