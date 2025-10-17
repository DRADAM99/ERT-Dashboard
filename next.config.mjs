import withPWA from "next-pwa";

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizeCss: true,
  },
  eslint: {
    // Disable ESLint during builds to avoid deployment failures
    ignoreDuringBuilds: true,
  },
};

export default withPWA({
  dest: "public",
  disable: false,
  swSrc: "worker/index.js",
})(nextConfig);
