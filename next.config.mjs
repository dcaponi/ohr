/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse and postgres are server-only; keep them out of the client bundle.
  serverExternalPackages: ["pdf-parse", "postgres"],
};

export default nextConfig;
