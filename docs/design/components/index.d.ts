// DaFit — типы компонентов window.DaFit (документация; бандл — обычный React 18 без TypeScript).
import type * as React from "react";

/** Имя иконки Lucide из набора системы (`DaFit.icons`). */
export type IconName =
  | "activity" | "bell" | "calendar" | "calendar-days" | "calendar-plus" | "camera" | "chart-column" | "chart-line"
  | "check" | "chevron-left" | "chevron-right" | "circle-alert" | "clock" | "droplet" | "dumbbell" | "ellipsis"
  | "flame" | "footprints" | "house" | "info" | "lock" | "map-pin" | "message-circle" | "moon" | "plus" | "qr-code"
  | "ruler" | "search" | "settings" | "sliders-horizontal" | "sparkles" | "trending-up" | "trophy" | "user" | "users"
  | "utensils" | "video" | "wallet" | "x";

/** Состояние занятия: определяет форму кольца DaRing. */
export type SessionState = "scheduled" | "progress" | "done" | "missed" | "cancelled";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` — заливка accent, одна на экран; `secondary` — surface-2; `ghost` — текст accent-ink; `destructive` — danger-soft + danger. */
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  /** 36 / 44 / 52 px. `lg` — нижняя кнопка экрана. */
  size?: "sm" | "md" | "lg";
  /** На всю ширину контейнера. */
  block?: boolean;
  /** Спиннер вместо иконки; кнопка недоступна, ширина не меняется. */
  loading?: boolean;
  /** Иконка слева от текста. */
  icon?: IconName;
  children?: React.ReactNode;
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Обязательная подпись для экранного диктора. */
  label: string;
  /** `ghost` по умолчанию; `secondary` — круглая подложка surface-2. */
  variant?: "ghost" | "secondary";
}

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Видимая подпись над полем. */
  label?: string;
  /** Подсказка под полем. */
  hint?: string;
  /** Текст ошибки: заменяет подсказку, красит рамку в danger. */
  error?: string;
  /** Единица справа: «кг», «₽», «мин». */
  suffix?: string;
}

export interface SegmentedOption { value: string; label: string }
export interface SegmentedControlProps {
  /** 2–4 варианта. */
  options: SegmentedOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Имя группы для диктора. */
  label?: string;
  className?: string;
}

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Подпись (для диктора или видимая при showLabel). */
  label?: string;
  /** Показать подпись строкой слева — для списков настроек. */
  showLabel?: boolean;
  disabled?: boolean;
}

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Выбран: inverse + галочка. */
  selected?: boolean;
  /** Иконка, когда чип не выбран. */
  icon?: IconName;
  children?: React.ReactNode;
}

export interface BadgeProps {
  /** Тон метки; `pro` и `premium` без текста подписываются сами. */
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "pro" | "premium";
  icon?: IconName;
  children?: React.ReactNode;
  className?: string;
}

export interface TierLockProps {
  /** Тариф, который открывает функцию. */
  tier?: "pro" | "premium";
  /** Название функции. */
  title: string;
  /** Что функция даёт — одним предложением. */
  description?: string;
  /** Текст кнопки; по умолчанию «Запросить доступ». */
  actionLabel?: string;
  onRequest?: () => void;
  /** Запрос уже отправлен: кнопка «Запрос отправлен», недоступна. */
  requested?: boolean;
  className?: string;
}

export interface DaRingProps {
  state?: SessionState;
  /** Доля 0–1 для state="progress". */
  value?: number;
  /** Диаметр в px; 28 в строке, 64+ в герое. */
  size?: number;
  /** Подпись для диктора; по умолчанию — название состояния. */
  label?: string;
  /** Проиграть Да-момент при монтировании (иначе он играет при переходе в done). */
  animate?: boolean;
  className?: string;
}

export interface StatTileProps {
  label: string;
  /** Значение, уже отформатированное по локали: «38 400», «72,4». */
  value: string | number;
  /** Единица: «₽», «кг». */
  unit?: string;
  /** Изменение со знаком: «+12%», «−1,4 кг». */
  delta?: string;
  /** Направление стрелки; по умолчанию — по знаку delta. */
  deltaDirection?: "up" | "down";
  /** Хорошо это или плохо: `up` — success, `down` — danger, `flat` — ink-2. Для веса при цели «похудеть» снижение — `up`. */
  deltaTone?: "up" | "down" | "flat";
  /** Пояснение к изменению: «к прошлой неделе». */
  caption?: string;
  className?: string;
}

export interface PassCardProps {
  /** Название абонемента: «Персональные, 10 занятий». */
  title: string;
  /** Тренер или клиент. */
  subtitle?: string;
  /** Занятий в абонементе. */
  total: number;
  /** Осталось занятий. */
  left: number;
  /** Занятий в долг (показывается бейдж «Долг: N»). */
  debt?: number;
  /** Срок: «до 12 декабря». */
  expires?: string;
  /** Цена занятия: «3 500 ₽ за занятие». */
  price?: string;
  /** Бейдж статуса, когда нет долга. */
  status?: string;
  statusTone?: BadgeProps["tone"];
  className?: string;
}

export interface ListGroupProps {
  /** Подпись над группой. */
  header?: React.ReactNode;
  /** Пояснение под группой. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export interface ListRowProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Значение справа: «7 из 10». */
  value?: React.ReactNode;
  /** Иконка в плашке 30×30 слева. */
  icon?: IconName;
  iconTone?: "neutral" | "accent";
  /** Имя человека: аватар 40 px слева. */
  avatar?: string;
  /** Фото для аватара. */
  avatarSrc?: string;
  /** Метка статуса справа: «Долг: 1», «Осталось 2». */
  badge?: string;
  badgeTone?: BadgeProps["tone"];
  badgeIcon?: IconName;
  /** Свой элемент слева. */
  leading?: React.ReactNode;
  /** Свой элемент справа (переключатель). */
  trailing?: React.ReactNode;
  /** Строка-кнопка с шевроном. */
  onClick?: () => void;
  /** Строка-ссылка с шевроном. */
  href?: string;
}

export interface SessionRowProps {
  /** «08:00». */
  time: string;
  /** «60 мин». */
  duration?: string;
  /** Клиент или группа. */
  title: string;
  /** Локация, «Онлайн», «6 из 8 мест». */
  subtitle?: string;
  format?: "offline" | "online";
  state?: SessionState;
  /** Доля для state="progress". */
  value?: number;
  onClick?: () => void;
}

export interface AvatarProps {
  /** Имя: из него инициалы и подпись для диктора. */
  name: string;
  /** Фото из Telegram. */
  src?: string;
  /** Диаметр, px; 32 в шапке, 40 в строке. */
  size?: number;
  className?: string;
}

export interface LargeTitleProps {
  title: string;
  /** Контекст: дата, имя клиента, «на проверке». */
  subtitle?: string;
  /** Имя: аватар-кнопка «Профиль» слева, на корне вкладки. */
  avatar?: string;
  avatarSrc?: string;
  onAvatar?: () => void;
  /** Подпись кнопки «Назад» слева на вложенном экране сайта: «Клиенты». В Telegram — системная BackButton. */
  back?: string;
  onBack?: () => void;
  /** Свой элемент слева вместо avatar/back. */
  leading?: React.ReactNode;
  /** Справа: до двух IconButton (или дочерние элементы). */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export interface TabBarItem { id: string; label: string; icon: IconName }
export interface TabBarProps {
  /** До 5 вкладок зоны. */
  items: TabBarItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** Имя навигации для диктора; по умолчанию «Разделы». */
  label?: string;
  className?: string;
}

export interface SheetProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
  /** Кнопки внизу, столбиком: главная сверху. */
  actions?: React.ReactNode;
  className?: string;
}

export interface ToastProps {
  /** Тон определяет иконку: success — галочка, danger — восклицательный знак, info — «i». */
  tone?: "success" | "danger" | "info";
  icon?: IconName;
  /** 2–4 слова тем же глаголом, что на кнопке. */
  title: string;
  /** Действие, обычно «Отменить». */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export interface EmptyStateProps {
  icon?: IconName;
  /** Что здесь появится. */
  title: string;
  /** Как это получить. */
  description?: string;
  /** Одна кнопка (или дочерний элемент). */
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export interface SkeletonProps {
  rows?: number;
  /** Подпись для диктора; по умолчанию «Загрузка». */
  label?: string;
  className?: string;
}

export interface IconProps {
  name: IconName;
  /** 16 / 20 / 24. */
  size?: number;
  /** 1.75 по умолчанию. */
  strokeWidth?: number;
  /** Подпись, если иконка без текста несёт смысл. */
  label?: string;
  className?: string;
}

export declare const Button: React.FC<ButtonProps>;
export declare const IconButton: React.FC<IconButtonProps>;
export declare const TextField: React.FC<TextFieldProps>;
export declare const SegmentedControl: React.FC<SegmentedControlProps>;
export declare const Switch: React.FC<SwitchProps>;
export declare const Chip: React.FC<ChipProps>;
export declare const Badge: React.FC<BadgeProps>;
export declare const TierLock: React.FC<TierLockProps>;
export declare const DaRing: React.FC<DaRingProps>;
export declare const StatTile: React.FC<StatTileProps>;
export declare const PassCard: React.FC<PassCardProps>;
export declare const ListGroup: React.FC<ListGroupProps>;
export declare const ListRow: React.FC<ListRowProps>;
export declare const SessionRow: React.FC<SessionRowProps>;
export declare const Avatar: React.FC<AvatarProps>;
export declare const LargeTitle: React.FC<LargeTitleProps>;
export declare const TabBar: React.FC<TabBarProps>;
export declare const Sheet: React.FC<SheetProps>;
export declare const Toast: React.FC<ToastProps>;
export declare const EmptyState: React.FC<EmptyStateProps>;
export declare const Skeleton: React.FC<SkeletonProps>;
export declare const Icon: React.FC<IconProps>;
/** Имена всех иконок набора. */
export declare const icons: IconName[];
