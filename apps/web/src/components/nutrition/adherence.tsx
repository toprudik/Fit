import { Minus, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { ADHERENCE_PERIODS, byAdherence, trendOf, type Adherence, type AdherencePeriod } from "@/lib/nutrition/adherence";
import { loadNutritionClients, loadPairAdherence } from "@/lib/nutrition/adherence-load";
import { formatDiaryDay } from "@/lib/nutrition/diary";

export const NUTRITION_CLIENTS_PATH = "/trainer/nutrition";

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

/** "60%", or why there is no percentage. */
function shareText(t: Dictionary, adherence: Adherence): string {
  const copy = t.adherence;
  if (adherence.share !== null) return interpolate(copy.share, { value: adherence.share });
  return adherence.hasTarget ? copy.noDays : copy.noTarget;
}

function Trend({ t, adherence }: { t: Dictionary; adherence: Adherence }) {
  const trend = trendOf(adherence);
  if (!trend) return null;
  const Icon = TREND_ICON[trend];
  return (
    <span className="text-ink-2" title={t.adherence.trend[trend]}>
      <Icon aria-hidden size={18} strokeWidth={1.75} />
      <span className="sr-only">{t.adherence.trend[trend]}</span>
    </span>
  );
}

function filledText(t: Dictionary, locale: Locale, adherence: Adherence, lastDay: string | null, today: string): string {
  const copy = t.adherence;
  const filled = interpolate(copy.filled, { logged: adherence.logged, days: adherence.days });
  const last = lastDay ? interpolate(copy.last, { date: formatDiaryDay(INTL_LOCALE[locale], lastDay, today) }) : copy.never;
  return `${filled}, ${last}`;
}

/** The trainer's «Питание клиентов» (wave-2 §5.5): adherence of every client who shares nutrition. */
export async function NutritionClients({ days }: { days: AdherencePeriod }) {
  const [t, locale, clients] = await Promise.all([getDictionary(), getLocale(), loadNutritionClients(days)]);
  if (!clients) return null;
  const copy = t.adherence;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-6">
      <ChipRow label={copy.periodsLabel}>
        {ADHERENCE_PERIODS.map((option) => (
          <Chip key={option} href={option === 7 ? NUTRITION_CLIENTS_PATH : `${NUTRITION_CLIENTS_PATH}?days=${option}`} selected={option === days}>
            {copy.periods[option]}
          </Chip>
        ))}
      </ChipRow>
      {clients.length ? (
        <ListGroup footer={copy.rule}>
          {byAdherence(clients, new Intl.Collator(INTL_LOCALE[locale])).map((client) => (
            <ListRow
              key={client.coachingId}
              avatar={{ name: client.name, src: client.photoUrl }}
              title={client.name}
              subtitle={filledText(t, locale, client.adherence, client.lastDay, today)}
              value={shareText(t, client.adherence)}
              trailing={<Trend t={t} adherence={client.adherence} />}
              href={`/trainer/clients/${client.coachingId}/nutrition`}
            />
          ))}
        </ListGroup>
      ) : (
        <EmptyState icon={Users} title={copy.emptyTitle} description={copy.emptyText} />
      )}
    </div>
  );
}

/** "Попадание в норму" on the pair's «Питание» tab: the last 7 and 30 full days. */
export async function PairAdherence({ coachingId }: { coachingId: string }) {
  const [t, adherence] = await Promise.all([getDictionary(), loadPairAdherence(coachingId)]);
  if (!adherence) return null;
  const copy = t.adherence;
  const row = (label: string, value: Adherence) => (
    <ListRow
      title={label}
      subtitle={interpolate(copy.filled, { logged: value.logged, days: value.days })}
      value={shareText(t, value)}
      trailing={<Trend t={t} adherence={value} />}
    />
  );
  return (
    <ListGroup header={copy.card.title} footer={copy.rule}>
      {row(copy.card.week, adherence.week)}
      {row(copy.card.month, adherence.month)}
    </ListGroup>
  );
}
