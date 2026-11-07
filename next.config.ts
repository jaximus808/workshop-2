import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      new URL("https://avatars.githubusercontent.com/**"),
      new URL("https://github.com/**"),
    ],
  },
};

export default nextConfig;
