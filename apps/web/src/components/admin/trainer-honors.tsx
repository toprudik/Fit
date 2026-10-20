import { TrainerHonorRow } from "@/components/admin/trainer-honor-row";
import { ListGroup } from "@/components/ui/list";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TRAINER_HONORS } from "@/lib/trainer-honors/honors";

/**
 * "Отметки на витрине" on a trainer's user card (ambassador programme §3, marketing backlog item 8): founder and
 * ambassador, when and why each was granted, and a button to grant or take it back with a reason.
 */
export async function TrainerHonors({ trainerId, timeZone }: { trainerId: string; timeZone: string }) {
  const [t, locale, supabase] = await Promise.all([getDictionary(), getLocale(), createSupabaseServerClient()]);
  const copy = t.trainerHonors.admin;
  const { data, error } = await supabase.rpc("admin_trainer_honors", { p_trainer_id: trainerId });
  if (error) throw new Error(`loading trainer honors failed: ${error.code}`);
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "long", timeZone });

  return (
    <ListGroup header={copy.header} footer={copy.footer} headingLevel={2}>
      {TRAINER_HONORS.map((honor) => {
        const held = data.find((row) => row.honor === honor);
        return (
          <TrainerHonorRow
            key={honor}
            trainerId={trainerId}
            honor={honor}
            held={Boolean(held)}
            title={t.trainerHonors.names[honor]}
            subtitle={held ? `${interpolate(copy.since, { date: date.format(new Date(held.granted_at)) })}. ${held.reason}` : undefined}
          />
        );
      })}
    </ListGroup>
  );
}
