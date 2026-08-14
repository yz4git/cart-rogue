import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.VOXEL_RALLY_PAGES === "1";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "voxel-rally";
const basePath = isGitHubPagesBuild ? `/${repositoryName}` : "";

const nextConfig: NextConfig = isGitHubPagesBuild
  ? {
      output: "export",
      trailingSlash: true,
      basePath,
      assetPrefix: `${basePath}/`,
      images: { unoptimized: true },
    }
  : {
      images: { unoptimized: true },
    };

export default nextConfig;
