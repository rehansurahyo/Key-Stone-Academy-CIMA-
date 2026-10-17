import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // pdfmake's transitive font/layout engines read data.trie and font metrics
  // relative to their installed modules. Bundling loses those runtime paths.
  serverExternalPackages: ["pdfmake"],
};

export default nextConfig;
