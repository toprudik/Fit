import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { clientEnv } from "@/env/client";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { cardText } from "@/lib/monthly-report/card-text";
import { isCardId, isMomentKind, storyCardFrom } from "@/lib/monthly-report/report";
import { showcaseUrl } from "@/lib/showcase/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Colors of docs/design/tokens.json for the two themes (bg, surface-1, ink, ink-2, accent, accent-ink). */
const COLORS = {
  dark: { bg: "#000000", surface: "#131418", ink: "#f5f6f7", ink2: "#a9adb4", accent: "#3d63ff", accentInk: "#8099ff" },
  light: { bg: "#f2f3f5", surface: "#ffffff", ink: "#0e0f11", ink2: "#52575f", accent: "#2f5be8", accentInk: "#2149d4" },
} as const;

// Static TTF cuts of the app fonts (src/fonts/story): the image renderer reads neither woff2 nor variable fonts.
const fonts = Promise.all(
  ["onest-500.ttf", "onest-700.ttf", "tektur-700.ttf"].map((file) => readFile(join(process.cwd(), "src/fonts/story", file))),
);

/**
 * A story card of a monthly report or of a milestone or badge (marketing backlog 4) as a 1080×1920 PNG (PRD wave-3
 * §4-4, §4-8): `GET /api/story/<id>?theme=dark&lang=ru`.
 * Telegram's story editor and the browser fetch it without a session; public.story_card() gives only what the
 * card prints, and an unknown or expired id answers 404.
 */
export async function GET(request: Request, context: RouteContext<"/api/story/[id]">) {
  const { id } = await context.params;
  if (!isCardId(id)) return new NextResponse("Not found", { status: 404 });
  const search = new URL(request.url).searchParams;
  const lang = search.get("lang");
  const locale = isLocale(lang) ? lang : "ru";
  const colors = COLORS[search.get("theme") === "light" ? "light" : "dark"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("story_card", { p_id: id });
  if (error) {
    console.error("reading a story card failed", error.code);
    return new NextResponse("Unavailable", { status: 503 });
  }
  const card = storyCardFrom(data);
  if (!card) return new NextResponse("Not found", { status: 404 });

  const t = dictionaries[locale];
  const text = cardText(t, locale, card);
  const [onest500, onest700, tektur700] = await fonts;
  // The trainer's showcase (§4-7): dark modules on white in both themes, which scanners read best.
  const showcase = card.data.slug ? showcaseUrl(card.data.slug, clientEnv.NEXT_PUBLIC_APP_URL) : null;
  const qr = showcase
    ? await QRCode.toDataURL(showcase, { margin: 2, width: 280, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "160px 96px",
          backgroundColor: colors.bg,
          color: colors.ink,
          fontFamily: "Onest",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 56, fontWeight: 700, color: colors.accentInk }}>{t.meta.appName}</div>
          <div style={{ fontSize: 48, fontWeight: 500, color: colors.ink2 }}>{text.month}</div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 32,
            padding: "96px 72px",
            borderRadius: 64,
            backgroundColor: colors.surface,
          }}
        >
          <div style={{ fontFamily: "Tektur Narrow", fontSize: text.figure.length > 6 ? 220 : 320, fontWeight: 700, color: colors.accent, lineHeight: 1 }}>
            {text.figure}
          </div>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.15 }}>{text.label}</div>
          {text.detail ? <div style={{ fontSize: 48, fontWeight: 500, color: colors.ink2, lineHeight: 1.25 }}>{text.detail}</div> : null}
        </div>
        {showcase && qr ? (
          <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the image renderer draws plain <img> only. */}
            <img src={qr} width={280} height={280} alt="" style={{ borderRadius: 24 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
              <div style={{ fontSize: 44, fontWeight: 700 }}>{t.monthlyReport.card.showcase}</div>
              <div style={{ fontSize: 36, fontWeight: 500, color: colors.ink2, wordBreak: "break-all" }}>
                {showcase.replace(/^https?:\/\//, "")}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 40, fontWeight: 500, color: colors.ink2 }}>
            {isMomentKind(card.kind) ? t.monthlyReport.card.momentText : t.monthlyReport.stories.storyText}
          </div>
        )}
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: [
        { name: "Onest", data: onest500, weight: 500, style: "normal" },
        { name: "Onest", data: onest700, weight: 700, style: "normal" },
        { name: "Tektur Narrow", data: tektur700, weight: 700, style: "normal" },
      ],
      headers: { "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" },
    },
  );
}
