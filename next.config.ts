import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to THIS directory. A stray empty
  // `C:\Users\Hamza\package-lock.json` makes Next infer the home folder as the
  // root, which makes Turbopack watch/resolve the entire home directory (slow,
  // flaky HMR). `import.meta.dirname` is the folder holding this config.
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    // Serve modern formats; next/image negotiates the best one per browser.
    formats: ["image/avif", "image/webp"],
    // Remote hosts must be whitelisted or next/image throws at runtime.
    remotePatterns: [
      // Demo property photos — safe to remove once you use your own CDN.
      { protocol: "https", hostname: "images.unsplash.com" },
      // S3 listing images (any region/bucket).
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      { protocol: "https", hostname: "*.s3.*.amazonaws.com" },
    ],
  },
};

export default nextConfig;
