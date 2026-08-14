import type { Metadata } from "next";
import "./globals.css";

const isGitHubPagesBuild = process.env.VOXEL_RALLY_PAGES === "1";
const githubPagesBasePath = isGitHubPagesBuild
  ? `/${process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "cart-rogue"}`
  : "";

export const metadata: Metadata = {
  title: "Cart Rogue — Turbo Ram Roguelite",
  description: "iPhone Safari向けthree.js車両アクションローグライト。パステル広場を走り、Turbo RAMで敵を倒して次のエリアへ進む。",
  manifest: `${githubPagesBasePath}/manifest.json`,
  appleWebApp: {
    capable: true,
    title: "Cart Rogue",
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
