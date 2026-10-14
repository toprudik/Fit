/**
 * Russian catalog, the source of truth for keys. Every interface string lives here and in en.ts;
 * copy follows docs/writing.md and the voice rules in docs/design/brand.md.
 */
export const ru = {
  meta: {
    appName: "DaFit",
    description: "DaFit помогает персональному тренеру вести расписание, абонементы и прогресс клиентов.",
  },
  common: {
    back: "Назад",
    close: "Закрыть",
    loading: "Загрузка",
    profile: "Профиль",
    skipToContent: "Перейти к содержимому",
  },
  nav: {
    sections: "Разделы",
  },
  zones: {
    label: "Зона",
    trainer: "Тренер",
    client: "Клиент",
  },
  tabs: {
    trainer: {
      today: "Сегодня",
      schedule: "Расписание",
      clients: "Клиенты",
      money: "Деньги",
      more: "Ещё",
    },
    client: {
      home: "Главная",
      sessions: "Занятия",
      diary: "Дневник",
      progress: "Прогресс",
      trainers: "Тренеры",
    },
  },
  screens: {
    trainer: {
      today: {
        emptyTitle: "Сегодня занятий нет",
        emptyText: "Здесь появятся занятия на сегодня, запросы на запись и клиенты, у которых заканчивается абонемент.",
      },
      schedule: {
        emptyTitle: "Расписание пока пустое",
        emptyText: "Здесь будут занятия и свободные слоты на день и на неделю.",
      },
      clients: {
        emptyTitle: "Клиентов пока нет",
        emptyText: "Отправь клиенту ссылку или покажи QR, и он появится здесь сам.",
        detail: "Здесь откроется карточка клиента",
      },
      money: {
        emptyTitle: "Оплат пока нет",
        emptyText: "Здесь появятся оплаты, долги и абонементы всех клиентов.",
        detail: "Здесь откроются подробности оплаты",
      },
      more: {
        emptyTitle: "Витрина и ссылки появятся здесь",
        emptyText: "Здесь будут твоя витрина с QR, ссылки для клиентов и настройки тренера.",
      },
    },
    client: {
      home: {
        emptyTitle: "Занятий пока нет",
        emptyText: "Здесь будут ближайшее занятие, остаток абонемента и цели на день.",
      },
      sessions: {
        emptyTitle: "Записей пока нет",
        emptyText: "Здесь появятся твои записи на занятия, прошедшие и предстоящие.",
        detail: "Здесь откроются подробности записи",
      },
      diary: {
        emptyTitle: "Дневник пока пустой",
        emptyText: "Здесь будут твои тренировки по дням.",
      },
      progress: {
        emptyTitle: "Замеров пока нет",
        emptyText: "Здесь будут вес, замеры, фото прогресса и рекорды.",
      },
      trainers: {
        emptyTitle: "Ты пока не занимаешься у тренера",
        emptyText: "Попроси у тренера ссылку или QR, и он появится здесь.",
        detail: "Здесь откроется карточка тренера",
      },
    },
  },
  profile: {
    title: "Профиль",
    signedOutText: "Войди через Telegram, и здесь появятся твоё имя и фото.",
    signIn: "Войти через Telegram",
    settings: "Настройки",
    signOut: "Выйти",
  },
  settings: {
    title: "Настройки",
    theme: {
      label: "Тема",
      system: "Авто",
      light: "Светлая",
      dark: "Тёмная",
      hint: "Авто берёт тему из Telegram, а на сайте из настроек устройства.",
    },
    language: {
      label: "Язык",
    },
  },
  /** Language names are written in their own language, so they stay the same in every catalog. */
  languages: {
    ru: "Русский",
    en: "English",
  },
  login: {
    title: "Вход",
    description: "Входим через твой аккаунт Telegram, без паролей и почты.",
    action: "Войти через Telegram",
    errors: {
      expired: "Время входа истекло, попробуй ещё раз.",
      denied: "Вход отменён в Telegram.",
      state: "Не удалось проверить запрос входа, попробуй ещё раз.",
      failed: "Не удалось войти через Telegram.",
    },
  },
  telegram: {
    signInFailed: "Не удалось войти через Telegram",
  },
  notFound: {
    title: "Такой страницы нет",
    text: "Возможно, ссылка устарела.",
    action: "На главный экран",
  },
  toast: {
    /** Screen reader name of the area where toasts appear. */
    region: "Уведомления",
  },
};

export type Dictionary = typeof ru;
