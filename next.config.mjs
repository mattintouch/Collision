/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are enabled by default in 14.2; kept explicit for clarity.
  },
  async headers() {
    return [
      {
        // PWA manifest + service worker need permissive caching control.
        source: "/manifest.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
