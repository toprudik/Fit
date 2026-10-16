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
        emptyAction: "Показать QR и ссылку",
        detail: "Здесь откроется карточка клиента",
      },
      money: {
        emptyTitle: "Оплат пока нет",
        emptyText: "Здесь появятся оплаты, долги и абонементы всех клиентов.",
        detail: "Здесь откроются подробности оплаты",
      },
      more: {
        links: "QR и ссылка",
        linksText: "Чтобы новые клиенты пришли к тебе сами",
        later: "Позже здесь появятся витрина и настройки тренера.",
      },
    },
    client: {
      home: {
        emptyTitle: "Занятий пока нет",
        emptyText: "Здесь будут ближайшее занятие, остаток абонемента и план на день.",
      },
      sessions: {
        emptyTitle: "Записей пока нет",
        emptyText: "Здесь появятся твои записи на занятия, предстоящие и прошедшие.",
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
        emptyText: "Тренер появится здесь, когда ты откроешь его ссылку или отсканируешь QR.",
        emptyAction: "Ввести код тренера",
        add: "Добавить тренера",
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
    trainerInvite: "У меня есть инвайт тренера",
    admin: "Админка",
  },
  /** Client link, QR and trainer code: /i/<token>, /join and /trainer/links (PRD wave-1 §2.3). */
  clientLinks: {
    landing: {
      title: "Приглашение тренера",
      lead: "Тренер приглашает тебя заниматься в DaFit: расписание, абонемент и прогресс будут в одном месте.",
      verified: "Проверен",
      offline: "Офлайн",
      online: "Онлайн",
      join: "Стать клиентом",
      joinHint: "Тренер сразу увидит тебя в клиентах, подтверждать ничего не нужно.",
      signedOutText: "Чтобы стать клиентом, войди через Telegram. Приглашение никуда не пропадёт.",
      openInTelegram: "Открыть в Telegram",
      signIn: "Войти через Telegram",
      failed: "Не получилось открыть приглашение. Обнови страницу.",
      joined: {
        title: "Ты уже занимаешься у этого тренера",
        action: "Открыть моих тренеров",
      },
      own: {
        title: "Это твоя ссылка",
        text: "Отправь её клиентам или покажи им QR. Стать клиентом самого себя нельзя.",
        action: "Открыть QR и ссылку",
      },
      invalid: {
        title: "Ссылка недействительна",
        text: "Возможно, тренер выпустил новую. Попроси у него свежую ссылку или код.",
        action: "Ввести код тренера",
      },
      unavailable: {
        title: "Тренер недоступен",
        text: "Сейчас к этому тренеру нельзя присоединиться.",
      },
    },
    join: {
      title: "Код тренера",
      text: "Введи код, который дал тренер, и ты окажешься у него в клиентах.",
      codeLabel: "Код тренера",
      codeHint: "6 букв и цифр",
      codeEmpty: "Введи код тренера",
      check: "Найти тренера",
      invalid: "Такого кода нет. Проверь его или попроси у тренера новый.",
      otherCode: "Ввести другой код",
      scan: "Сканировать QR",
      scanText: "Наведи камеру на QR тренера",
      scanFailed: "Это не QR тренера из DaFit",
      signedOutText: "Чтобы ввести код тренера, войди через Telegram.",
      signIn: "Войти через Telegram",
    },
    errors: {
      invalid: "Ссылка или код больше не работают. Попроси у тренера новые.",
      unavailable: "Сейчас к этому тренеру нельзя присоединиться.",
      own: "Это твоя ссылка, стать клиентом самого себя нельзя.",
      limit: "Тренер сейчас не может принять новых клиентов.",
      failed: "Не получилось, попробуй ещё раз.",
    },
    joinedToast: "Готово, ты в клиентах у тренера {name}",
    /** Subtitle of a pair in the clients and trainers lists. */
    since: "Вместе с {date}",
    trainer: {
      title: "QR и ссылка",
      text: "Клиент сканирует QR камерой телефона или открывает ссылку, входит через Telegram и сразу появляется у тебя в клиентах.",
      qr: "QR-код ссылки для клиентов",
      link: "Ссылка",
      code: "Код тренера",
      codeHint: "Если ссылки под рукой нет, клиент вводит этот код в DaFit.",
      copyLink: "Копировать ссылку",
      copyCode: "Копировать код",
      copied: "Скопировано",
      copyFailed: "Не получилось скопировать",
      share: "Поделиться",
      shareText: "Занимайся со мной в DaFit",
      showQr: "Показать QR крупно",
      showQrText: "Клиент наводит камеру телефона на экран.",
      uses: "Пришли по ссылке и коду",
      reissue: "Перевыпустить ссылку",
      reissueText: "Старая ссылка, QR и код сразу перестанут работать. Клиенты, которые уже с тобой, останутся.",
      reissueConfirm: "Перевыпустить",
      cancel: "Отмена",
      reissued: "Готово, ссылка новая",
      reissueFailed: "Не получилось перевыпустить ссылку, попробуй ещё раз.",
      signedOutText: "Войди через Telegram, и здесь появятся твой QR и ссылка для клиентов.",
      signIn: "Войти через Telegram",
      notTrainer: "Ссылка для клиентов есть только у тренеров.",
      failed: "Не получилось загрузить ссылку. Обнови страницу.",
    },
  },
  /** Redeeming a trainer invite: /onboarding/trainer (PRD wave-1 §2.2). */
  trainerInvite: {
    title: "Инвайт тренера",
    enterText: "Введи код из приглашения, и у тебя откроется зона «Тренер».",
    codeLabel: "Код инвайта",
    codeHint: "12 букв и цифр, тире и пробелы можно не ставить",
    codeEmpty: "Введи код из приглашения",
    check: "Проверить код",
    signedOutText: "Чтобы стать тренером, войди через Telegram. Код никуда не пропадёт.",
    signIn: "Войти через Telegram",
    become: "Стать тренером",
    otherCode: "Ввести другой код",
    openTrainer: "Открыть зону тренера",
    failed: "Не получилось, попробуй ещё раз.",
    status: {
      valid: {
        title: "Инвайт действует",
        text: "Нажми кнопку, и у тебя откроется зона «Тренер». Работать с клиентами можно сразу, документы для проверки отправишь позже.",
      },
      invalid: {
        title: "Такого инвайта нет",
        text: "Проверь код или попроси новый инвайт у того, кто его прислал.",
      },
      redeemed: {
        title: "Инвайт уже использован",
        text: "Каждый инвайт работает один раз. Попроси новый у того, кто его прислал.",
      },
      expired: {
        title: "Срок инвайта истёк",
        text: "Попроси новый инвайт у того, кто его прислал.",
      },
      revoked: {
        title: "Инвайт отозван",
        text: "Попроси новый инвайт у того, кто его прислал.",
      },
      alreadyTrainer: {
        title: "Ты уже тренер",
        text: "Зона «Тренер» у тебя уже есть, а этот инвайт остался неиспользованным.",
      },
    },
  },
  admin: {
    invites: {
      title: "Инвайты тренеров",
      create: {
        header: "Новый инвайт",
        noteLabel: "Для кого",
        noteHint: "Например, имя и зал. Видно только админам.",
        daysLabel: "Сколько дней действует",
        daysSuffix: "дн.",
        daysError: "Введи число от 1 до 90",
        submit: "Создать инвайт",
        failed: "Не получилось создать инвайт, попробуй ещё раз.",
      },
      created: {
        title: "Инвайт готов",
        text: "Отправь ссылку тренеру. Код виден только сейчас: потом его не посмотреть, можно только создать новый инвайт.",
        link: "Ссылка для Telegram",
        code: "Код",
        qr: "QR-код со ссылкой на инвайт",
        copyLink: "Скопировать ссылку",
        copyCode: "Скопировать код",
        copied: "Скопировано",
        copyFailed: "Не получилось скопировать, выдели текст вручную",
        done: "Готово",
      },
      list: {
        header: "Все инвайты",
        emptyTitle: "Инвайтов пока нет",
        emptyText: "Создай первый инвайт, и он появится здесь.",
        noNote: "Без комментария",
        active: "Код …{hint}, действует до {date}",
        expired: "Код …{hint}, истёк {date}",
        revoked: "Код …{hint}, отозван {date}",
        redeemed: "Использовал {name}, {date}",
        deletedAccount: "удалённый аккаунт",
      },
      status: {
        active: "Действует",
        redeemed: "Использован",
        expired: "Истёк",
        revoked: "Отозван",
      },
      revoke: {
        action: "Отозвать",
        confirm: "Да, отозвать",
        cancel: "Отмена",
        done: "Инвайт отозван",
        failed: "Не получилось отозвать инвайт, попробуй ещё раз.",
      },
    },
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
    description: "Пароль и почта не нужны, хватит аккаунта Telegram.",
    action: "Войти через Telegram",
    errors: {
      expired: "Время входа истекло, попробуй ещё раз.",
      denied: "Вход отменён в Telegram, попробуй ещё раз.",
      state: "Не удалось проверить вход, попробуй ещё раз.",
      failed: "Не удалось войти через Telegram, попробуй ещё раз.",
    },
  },
  telegram: {
    signInFailed: "Не удалось войти, открой приложение заново",
    signInExpired: "Данные для входа от Telegram устарели или не пришли. Закрой приложение и открой его снова.",
    /** The browser drops the app's cookies, as Telegram Web does with third-party cookies blocked. */
    cookiesBlocked: "Браузер не даёт сохранить вход. Открой DaFit в приложении Telegram на телефоне или компьютере.",
  },
  notFound: {
    title: "Такой страницы нет",
    text: "Возможно, ссылка устарела.",
    action: "Открыть главный экран",
  },
  /** Bot messages from the notification outbox, in the recipient's DaFit language (ADR 0006, Q66). */
  botMessages: {
    open: "Открыть DaFit",
    /** AUTH-7: the test message after the user allows the bot to write. */
    botTest: "Готово, теперь DaFit может писать тебе здесь. В этот чат придут напоминания о занятиях и другие уведомления.",
    /** Т7: someone became the trainer's client by link or code. */
    newClient: "Новый клиент: {name}",
    /** Т7a: someone joined while the trainer keeps cards of clients without an account. */
    newClientWithCards: "{name} теперь среди твоих клиентов. Проверь, нет ли у тебя карточки этого человека без аккаунта.",
    unnamedClient: "клиент без имени",
    openClients: "Открыть клиентов",
  },
  toast: {
    /** Screen reader name of the area where toasts appear. */
    region: "Уведомления",
  },
};

export type Dictionary = typeof ru;
