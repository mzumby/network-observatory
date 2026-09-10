import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://connect.agentmarkit.com",
  ),
  title: "Connect Gmail | AgentMarkit",
  description:
    "Let your agent use who you emailed and when. It cannot read your messages.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Connect Gmail | AgentMarkit",
    description:
      "Let your agent use who you emailed and when. It cannot read your messages.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Network Observatory constellation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Connect Gmail | AgentMarkit",
    description:
      "Let your agent use who you emailed and when. It cannot read your messages.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
