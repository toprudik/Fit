import type { Metadata } from "next";
import { linkPreviewMetadata } from "@/lib/og/load";

/** The trainer invite's preview in chats (marketing §5.6): the same for every code, which the preview does not read. */
export async function generateMetadata(): Promise<Metadata> {
  return linkPreviewMetadata("trainer-invite", null);
}

export default function Layout({ children }: LayoutProps<"/[lang]/onboarding/trainer">) {
  return children;
}
