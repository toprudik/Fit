import type { Metadata } from "next";
import { linkPreviewMetadata } from "@/lib/og/load";

/** The link's preview in chats (marketing §5.6); the page keeps its own title and noindex. */
export async function generateMetadata({ params }: LayoutProps<"/[lang]/r/[code]">): Promise<Metadata> {
  const { code } = await params;
  return linkPreviewMetadata("referral", code);
}

export default function Layout({ children }: LayoutProps<"/[lang]/r/[code]">) {
  return children;
}
