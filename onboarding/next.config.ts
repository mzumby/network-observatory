import type { NextConfig } from "next";

const privateBrowserHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/", headers: privateBrowserHeaders },
      { source: "/connected", headers: privateBrowserHeaders },
      { source: "/gmail/:path*", headers: privateBrowserHeaders },
    ];
  },
};

export default nextConfig;
