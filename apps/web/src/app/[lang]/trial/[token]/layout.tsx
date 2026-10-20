import type { Metadata } from "next";
import { linkPreviewMetadata } from "@/lib/og/load";

/** The link's preview in chats (marketing §5.6); the page keeps its own title and noindex. */
export async function generateMetadata({ params }: LayoutProps<"/[lang]/trial/[token]">): Promise<Metadata> {
  const { token } = await params;
  return linkPreviewMetadata("trial", token);
}

export default function Layout({ children }: LayoutProps<"/[lang]/trial/[token]">) {
  return children;
}
