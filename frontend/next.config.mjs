/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  // Production: static export served same-origin by FastAPI (build output in ./out).
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
  // Development only: proxy /api/* to the FastAPI backend. Rewrites are ignored
  // (and would warn) in a static export, so only register them under `next dev`.
  ...(isDev
    ? {
        async rewrites() {
          const target = process.env.BACKEND_URL || "http://localhost:8000";
          return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
        },
      }
    : {}),
};

export default nextConfig;
