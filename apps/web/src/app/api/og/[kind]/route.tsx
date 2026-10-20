import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { loadLinkPreview } from "@/lib/og/load";
import { isPreviewKind, PREVIEW_SIZE, previewText } from "@/lib/og/preview";

/** Dark colors of docs/design/tokens.json (bg, surface-1, ink, ink-2, accent, accent-ink), as on the story cards. */
const COLORS = { bg: "#000000", surface: "#131418", ink: "#f5f6f7", ink2: "#a9adb4", accent: "#3d63ff", accentInk: "#8099ff" } as const;

// Static TTF cuts of the app fonts (src/fonts/story): the image renderer reads neither woff2 nor variable fonts.
const fonts = Promise.all(["onest-500.ttf", "onest-700.ttf"].map((file) => readFile(join(process.cwd(), "src/fonts/story", file))));

/**
 * The 1200×630 picture a chat shows under a shared link (marketing §5.6): `GET /api/og/<kind>?id=<token>&lang=ru`.
 * Chats fetch it without a session; it prints only what the link's landing page shows anyone, the trainer's name
 * and headline, and a generic picture for an unknown or closed link.
 */
export async function GET(request: Request, context: RouteContext<"/api/og/[kind]">) {
  const { kind } = await context.params;
  if (!isPreviewKind(kind)) return new NextResponse("Not found", { status: 404 });
  const search = new URL(request.url).searchParams;
  const lang = search.get("lang");
  const t = dictionaries[isLocale(lang) ? lang : "ru"];
  const preview = await loadLinkPreview(kind, search.get("id"));
  const text = previewText(t, preview);
  // A trainer's own line; otherwise what the link offers.
  const subtitle = preview.trainer?.headline?.slice(0, 90) ?? text.description;
  const [onest500, onest700] = await fonts;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: COLORS.bg,
          color: COLORS.ink,
          fontFamily: "Onest",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: COLORS.accentInk }}>{t.meta.appName}</div>
          {/* The Da-mark (components/brand/da-mark.tsx): the image renderer takes inline SVG, not components. */}
          <svg width={80} height={80} viewBox="0 0 48 48" fill="none" stroke={COLORS.accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M38.72 15.5A17 17 0 1 1 28.4 7.58" />
            <path d="M15.5 25L22 31.5L35.5 11" />
          </svg>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            padding: "48px 56px",
            borderRadius: 48,
            backgroundColor: COLORS.surface,
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 500, color: COLORS.ink2 }}>{text.kicker}</div>
          <div style={{ fontSize: text.title.length > 34 ? 60 : 72, fontWeight: 700, lineHeight: 1.1 }}>{text.title}</div>
          <div style={{ fontSize: 34, fontWeight: 500, color: COLORS.ink2, lineHeight: 1.25 }}>{subtitle}</div>
        </div>
      </div>
    ),
    {
      ...PREVIEW_SIZE,
      fonts: [
        { name: "Onest", data: onest500, weight: 500, style: "normal" },
        { name: "Onest", data: onest700, weight: 700, style: "normal" },
      ],
      headers: { "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" },
    },
  );
}
