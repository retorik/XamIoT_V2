/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'apixam.holiceo.com',
      },
      {
        protocol: 'https',
        hostname: 'api.xamiot.com',
      },
    ],
  },
};

export default nextConfig;
