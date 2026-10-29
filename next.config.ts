import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // PGlite loads its Postgres WebAssembly files from its own package folder: keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The policy files are read at runtime with fs; make sure they ship with the API routes.
  outputFileTracingIncludes: { "/api/chat": ["./policies/**"] },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.dummyjson.com", pathname: "/product-images/**" }],
  },
};

export default nextConfig;
