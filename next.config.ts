import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // pdfmake's transitive font/layout engines read data.trie and font metrics
  // relative to their installed modules. Bundling loses those runtime paths.
  serverExternalPackages: ["pdfmake"],
  async redirects() {
    return [
      {
        source: "/",
        has: [
          {
            type: "host",
            value: "mocksadmin.keystoneacademia.com",
          },
        ],
        destination: "/staff/login",
        permanent: false,
      },
      {
        source: "/",
        has: [
          {
            type: "host",
            value: "mocks.keystoneacademia.com",
          },
        ],
        destination: "/student/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
