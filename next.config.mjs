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
  disable: process.env.NODE_ENV === "development",
})(nextConfig);
