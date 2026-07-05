import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@modelcontextprotocol/sdk', 'openai']
};

export default nextConfig;
