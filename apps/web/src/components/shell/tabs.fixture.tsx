import type { Locale } from "@/i18n/config";
import type { Zone } from "@/lib/navigation/zones";

/*
 * Expected tab labels and links per zone for the tab bar and side menu tests, written out here (from
 * docs/architecture/screens.md §2.1–2.2) so the tests don't trust the code they check.
 */
export const EXPECTED_TABS: Record<Locale, Record<Zone, readonly (readonly [label: string, href: string])[]>> = {
  ru: {
    trainer: [
      ["Сегодня", "/trainer"],
      ["Расписание", "/trainer/schedule"],
      ["Клиенты", "/trainer/clients"],
      ["Деньги", "/trainer/money"],
      ["Ещё", "/trainer/more"],
    ],
    client: [
      ["Главная", "/client"],
      ["Занятия", "/client/sessions"],
      ["Дневник", "/client/diary"],
      ["Прогресс", "/client/progress"],
      ["Тренеры", "/client/trainers"],
    ],
  },
  en: {
    trainer: [
      ["Today", "/trainer"],
      ["Schedule", "/trainer/schedule"],
      ["Clients", "/trainer/clients"],
      ["Money", "/trainer/money"],
      ["More", "/trainer/more"],
    ],
    client: [
      ["Home", "/client"],
      ["Sessions", "/client/sessions"],
      ["Diary", "/client/diary"],
      ["Progress", "/client/progress"],
      ["Trainers", "/client/trainers"],
    ],
  },
};

export const SECTIONS_LABEL: Record<Locale, string> = { ru: "Разделы", en: "Sections" };

/** next/link stand-in: a plain <a> that reports a plain click as a client-side navigation (onNavigate). */
export function MockLink({
  href,
  children,
  onNavigate,
  onClick,
  ...props
}: React.ComponentProps<"a"> & { href: string; onNavigate?: (event: { preventDefault: () => void }) => void }) {
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        onNavigate?.({ preventDefault: () => event.preventDefault() });
      }}
      {...props}
    >
      {children}
    </a>
  );
}
