/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server-only packages; keep them out of the client bundle / unbundled on server.
  serverExternalPackages: [
    "pdf-parse",
    "postgres",
    "mcp-handler",
    "@modelcontextprotocol/sdk",
  ],
};

export default nextConfig;
