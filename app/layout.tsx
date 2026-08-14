import type { Metadata } from "next";
import "./globals.css";

const isGitHubPagesBuild = process.env.VOXEL_RALLY_PAGES === "1";
const githubPagesBasePath = isGitHubPagesBuild
  ? `/${process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "voxel-rally"}`
  : "";

export const metadata: Metadata = {
  title: "Voxel Rally — Arcade Terrain Racing",
  description: "iPhone Safari向けthree.jsボクセル地形アーケードレースゲーム。",
  manifest: `${githubPagesBasePath}/manifest.json`,
  appleWebApp: {
    capable: true,
    title: "Voxel Rally",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: { "codex-preview": "development" },
  icons: {
    icon: `${githubPagesBasePath}/favicon.svg`,
    shortcut: `${githubPagesBasePath}/favicon.svg`,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
