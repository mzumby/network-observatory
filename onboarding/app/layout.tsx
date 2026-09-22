import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://connect.agentmarkit.com",
  ),
  title: "Gmail metadata | AgentMarkit",
  description:
    "Let your agent use who you emailed and when. It cannot read your messages.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Gmail metadata | AgentMarkit",
    description:
      "Let your agent use who you emailed and when. It cannot read your messages.",
    type: "website",
    images: [
      {
        url: "/agentmarkit-mark.svg",
        width: 128,
        height: 128,
        alt: "AgentMarkit",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Gmail metadata | AgentMarkit",
    description:
      "Let your agent use who you emailed and when. It cannot read your messages.",
    images: ["/agentmarkit-mark.svg"],
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
