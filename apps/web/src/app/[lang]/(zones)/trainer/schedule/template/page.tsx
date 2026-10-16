import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { WeekTemplateEditor } from "@/components/schedule/week-template-editor";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { loadScheduleOwner } from "@/lib/schedule/load";
import type { TemplateWindow } from "@/lib/schedule/template";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.templatePage.title };
}

async function Template() {
  const t = await getDictionary();
  const owner = await loadScheduleOwner();
  if (!owner) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={t.schedule.templatePage.title}
        description={t.schedule.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/trainer/schedule/template")}`}>{t.schedule.signIn}</Link>
          </Button>
        }
      />
    );
  }

  const { supabase, userId } = owner;
  const [template, places, trainer] = await Promise.all([
    supabase.from("week_templates").select("id, horizon_weeks, buffer_min").eq("trainer_id", userId).maybeSingle(),
    supabase.from("locations").select("id, name").eq("trainer_id", userId).is("archived_at", null).order("created_at"),
    supabase.from("trainer_profiles").select("works_offline").eq("user_id", userId).maybeSingle(),
  ]);
  if (template.error || places.error) {
    console.error("loading the week template failed", template.error?.code ?? places.error?.code);
    throw new Error("loading the week template failed");
  }

  let windows: TemplateWindow[] = [];
  if (template.data) {
    const { data, error } = await supabase
      .from("week_template_items")
      .select("iso_weekday, start_time, end_time, duration_min, mode, location_id, meeting_url")
      .eq("template_id", template.data.id)
      .order("iso_weekday")
      .order("start_time");
    if (error) throw new Error(`loading the template windows failed: ${error.code}`);
    windows = data.map((item) => ({
      isoWeekday: item.iso_weekday,
      start: item.start_time.slice(0, 5),
      end: item.end_time.slice(0, 5),
      durationMin: item.duration_min,
      mode: item.mode,
      locationId: item.location_id,
      meetingUrl: item.meeting_url,
    }));
  }

  return (
    <WeekTemplateEditor
      initialWindows={windows}
      initialHorizonWeeks={template.data?.horizon_weeks ?? 4}
      initialBufferMin={template.data?.buffer_min ?? 0}
      locations={places.data}
      defaultMode={trainer.data?.works_offline === false ? "online" : "offline"}
    />
  );
}

/**
 * "Шаблон недели" (screens.md /trainer/schedule/template, PRD 2.6.1): the trainer's working windows by
 * weekday, cut into slots for the weeks ahead. Saving replaces the free slots of the old template.
 */
export default async function WeekTemplatePage() {
  const t = await getDictionary();
  const copy = t.schedule.templatePage;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/schedule" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <p className="text-callout text-ink-2">{copy.text}</p>
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Template />
        </Suspense>
      </div>
    </Screen>
  );
}
