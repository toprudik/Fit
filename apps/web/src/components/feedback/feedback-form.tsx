"use client";

import { ImagePlus, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { useAccount } from "@/components/account/account-store";
import { useOptionalShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { prepareFeedback, sendFeedback } from "@/lib/feedback/actions";
import {
  DATA_REQUEST_TYPES,
  FEEDBACK_KINDS,
  MAX_FEEDBACK_LENGTH,
  MAX_SCREENSHOTS,
  platformLabel,
  screenshotProblem,
  type DataRequestType,
  type FeedbackKind,
} from "@/lib/feedback/input";
import { uploadToSignedUrl } from "@/lib/supabase/upload";
import { useInTelegram } from "@/lib/telegram/mini-app";
import { hapticSuccess } from "@/lib/telegram/mini-app";
import { useTheme } from "@/lib/theme/store";

type Screenshot = { file: File; url: string };

const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * "Обратная связь" (PRD wave-1 §2.13): kind, text and up to three screenshots. The context goes along on its own:
 * the screen the form was opened from (`from`), zone, surface, language and theme; never anything from that screen.
 * Screenshots go straight to Storage first, then the message is saved, which tells the team and files the issue.
 * "Мои данные" is a request about one's personal data (152-FZ arts. 20, 21): what it asks for, no screenshots,
 * an answer within 10 working days.
 */
export function FeedbackForm({ from, backHref }: { from: string | null; backHref: string }) {
  const { t, locale } = useI18n();
  const copy = t.feedback;
  const account = useAccount();
  const zone = useOptionalShell()?.zone ?? null;
  const inTelegram = useInTelegram();
  const { theme } = useTheme();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [requestType, setRequestType] = useState<DataRequestType | null>(null);
  const [body, setBody] = useState("");
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [errors, setErrors] = useState<{ body?: string; requestType?: string; screenshots?: string; form?: string }>({});
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Object URLs of the previews live as long as the screenshot does.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (screenshots.length + files.length > MAX_SCREENSHOTS) {
      setErrors((current) => ({ ...current, screenshots: copy.screenshotLimit }));
      return;
    }
    if (files.some((file) => screenshotProblem(file))) {
      setErrors((current) => ({ ...current, screenshots: copy.screenshotType }));
      return;
    }
    const added = files.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return { file, url };
    });
    setScreenshots((current) => [...current, ...added]);
    setErrors((current) => ({ ...current, screenshots: undefined }));
  }

  function remove(index: number) {
    setScreenshots((current) => {
      const gone = current[index];
      if (gone) {
        URL.revokeObjectURL(gone.url);
        urls.current.delete(gone.url);
      }
      return current.filter((_, i) => i !== index);
    });
    setErrors((current) => ({ ...current, screenshots: undefined }));
  }

  const dataRequest = kind === "data_request";

  function submit() {
    const text = body.trim();
    if (dataRequest && !requestType) return setErrors({ requestType: copy.dataRequest.typeEmpty });
    if (!text) return setErrors({ body: copy.bodyEmpty });
    if (text.length > MAX_FEEDBACK_LENGTH) return setErrors({ body: copy.bodyLong });
    setErrors({});
    const files = dataRequest ? [] : screenshots;
    startTransition(async () => {
      const prepared = await prepareFeedback(files.map(({ file }) => ({ type: file.type, size: file.size })));
      if (prepared.status !== "ready") {
        setErrors({ form: prepared.status === "invalid" ? copy.screenshotType : copy.failed });
        return;
      }
      for (const [index, upload] of prepared.uploads.entries()) {
        if (!(await uploadToSignedUrl("feedback", upload.path, upload.token, files[index].file))) {
          setErrors({ form: copy.failed });
          return;
        }
      }
      const result = await sendFeedback({
        id: prepared.id,
        kind,
        requestType: dataRequest ? requestType : null,
        body: text,
        route: from,
        zone,
        platform: platformLabel({ inTelegram, coarsePointer: window.matchMedia("(pointer: coarse)").matches }),
        locale,
        theme,
        screenshots: prepared.uploads.map((upload) => upload.path),
      });
      if (result.status !== "sent") {
        setErrors({ form: result.status === "rate-limited" ? copy.tooMany : copy.failed });
        return;
      }
      hapticSuccess();
      setSent(true);
    });
  }

  function again() {
    screenshots.forEach(({ url }) => URL.revokeObjectURL(url));
    urls.current.clear();
    setScreenshots([]);
    setBody("");
    setKind("bug");
    setRequestType(null);
    setSent(false);
  }

  if (account.status === "signed-out") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-body text-ink-2">{copy.signedOut}</p>
        <Button asChild>
          <Link href={`/login?next=${encodeURIComponent("/feedback")}`}>{copy.signIn}</Link>
        </Button>
      </div>
    );
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-lg bg-surface-1 px-6 py-10 text-center">
        <DaMark className="size-12" />
        <h2 className="text-title-3">{copy.sentTitle}</h2>
        <p className="text-body text-ink-2">{dataRequest ? copy.dataRequest.sentText : copy.sentText}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={backHref}>{copy.back}</Link>
          </Button>
          <Button variant="ghost" onClick={again}>
            {copy.another}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <p className="text-body text-ink-2">{copy.intro}</p>
      <SegmentedControl
        label={copy.kind}
        options={FEEDBACK_KINDS.map((value) => ({ value, label: copy.kinds[value] }))}
        value={kind}
        onValueChange={(next) => {
          setKind(next);
          setErrors({});
        }}
      />
      {dataRequest ? (
        <fieldset aria-describedby={errors.requestType ? "data-request-error" : "data-request-hint"}>
          <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.dataRequest.type}</legend>
          <div className="flex flex-wrap gap-2">
            {DATA_REQUEST_TYPES.map((value) => (
              <ChipRadio
                key={value}
                name="request-type"
                value={value}
                checked={requestType === value}
                onChange={() => {
                  setRequestType(value);
                  setErrors((current) => ({ ...current, requestType: undefined }));
                }}
              >
                {copy.dataRequest.types[value]}
              </ChipRadio>
            ))}
          </div>
          {errors.requestType ? (
            <p id="data-request-error" className="mt-2 px-1 text-footnote text-danger">
              {errors.requestType}
            </p>
          ) : (
            <p id="data-request-hint" className="mt-2 px-1 text-footnote text-ink-2">
              {copy.dataRequest.hint}
            </p>
          )}
        </fieldset>
      ) : null}
      <TextArea
        label={copy.body}
        placeholder={copy.placeholders[kind]}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          if (errors.body) setErrors((current) => ({ ...current, body: undefined }));
        }}
        error={errors.body}
        maxLength={MAX_FEEDBACK_LENGTH}
        rows={6}
      />
      {dataRequest ? null : (
        <div className="flex flex-col gap-2">
          <span className="px-1 text-footnote text-ink-2">{copy.screenshots}</span>
          {screenshots.length ? (
            <ul className="flex flex-wrap gap-3">
              {screenshots.map((shot, index) => (
                <li key={shot.url} className="relative">
                  {/* A local preview of the user's own file: next/image has nothing to optimise here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot.url}
                    alt={interpolate(copy.screenshotAlt, { n: index + 1 })}
                    className="size-24 rounded-md bg-surface-2 object-cover"
                  />
                  <IconButton
                    icon={X}
                    variant="secondary"
                    label={interpolate(copy.removeScreenshot, { n: index + 1 })}
                    onClick={() => remove(index)}
                    className="absolute -top-3 -right-3"
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {screenshots.length < MAX_SCREENSHOTS ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={ImagePlus}
              className="self-start"
              onClick={() => fileInput.current?.click()}
            >
              {copy.addScreenshot}
            </Button>
          ) : null}
          <p className={errors.screenshots ? "px-1 text-footnote text-danger" : "px-1 text-footnote text-ink-2"}>
            {errors.screenshots ?? copy.screenshotsHint}
          </p>
          <input ref={fileInput} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
        </div>
      )}
      <p className="px-1 text-footnote text-ink-2">{copy.context}</p>
      {errors.form ? (
        <p role="alert" className="text-subhead text-danger">
          {errors.form}
        </p>
      ) : null}
      <Button type="submit" icon={Send} loading={pending} className="w-full md:w-fit">
        {copy.send}
      </Button>
    </form>
  );
}
