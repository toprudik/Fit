import type { Metadata, Viewport } from "next";
import { lang } from "next/root-params";
import { Suspense } from "react";
import { AccountLoader } from "@/components/account/account-loader";
import { NavigationTracker } from "@/components/shell/navigation-tracker";
import { TelegramProvider } from "@/components/telegram/telegram-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { onest, tekturNarrow } from "@/fonts";
import { I18nProvider } from "@/i18n/client";
import { isLocale, LOCALES } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { themeInitScript } from "@/lib/theme/init-script";
import "../globals.css";

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ lang: locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: { default: t.meta.appName, template: `%s | ${t.meta.appName}` },
    description: t.meta.description,
    applicationName: t.meta.appName,
    icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "48x48" }], apple: "/apple-icon.png" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Browser chrome follows the system scheme; the app itself may be pinned to a theme in settings.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#f2f3f5" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const value = await lang();
  const locale = isLocale(value) ? value : LOCALES[0];

  return (
    <html lang={locale} data-theme="dark" className={`${onest.variable} ${tekturNarrow.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets data-theme before the first paint; the static HTML always ships the dark default. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <I18nProvider locale={locale}>
          <TelegramProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </TelegramProvider>
          <Toaster />
          <NavigationTracker />
          {/* The only per-request part of the page: who is signed in. Everything else is prerendered. */}
          <Suspense fallback={null}>
            <AccountLoader />
          </Suspense>
        </I18nProvider>
      </body>
    </html>
  );
}
