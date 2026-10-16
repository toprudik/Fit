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
        emptyTitle: "Витрины пока нет",
        emptyText: "Здесь будут твоя витрина с QR, ссылки для клиентов и настройки тренера.",
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
    verification: "Верификация",
    verificationQueue: "Очередь верификации",
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
  /** Trainer verification: /trainer/verification for the trainer, /admin/verification for admins (PRD wave-1 §2.2, §4). */
  verification: {
    title: "Верификация",
    status: {
      not_submitted: "Не отправлена",
      pending: "На проверке",
      verified: "Пройдена",
      rejected: "Отклонена",
    },
    statusText: {
      not_submitted: "Загрузи дипломы и сертификаты, и мы их проверим. После проверки на витрине появится значок. С клиентами можно работать уже сейчас.",
      pending: "Документы на проверке. Когда проверим, напишем в бот. С клиентами можно работать как обычно.",
      verified: "Документы проверены, на твоей витрине есть значок.",
      rejected: "Проверку пройти не получилось. Пока витрина скрыта, но ссылка клиента и пробное работают. Поправь документы и отправь их снова.",
    },
    statusHeader: "Статус",
    reason: "Причина",
    documents: {
      header: "Документы",
      footer: "До 5 файлов JPG, PNG или PDF, каждый до 10 МБ. Их видят только ты и админы DaFit.",
      empty: "Документов пока нет",
      add: "Добавить документ",
      titleLabel: "Что это за документ",
      titleHint: "Например, диплом тренера или сертификат курса",
      titleEmpty: "Напиши, что это за документ",
      file: "Файл",
      choose: "Выбрать файл",
      chooseOther: "Выбрать другой",
      fileEmpty: "Выбери файл",
      upload: "Загрузить",
      cancel: "Отмена",
      wrongType: "Подойдёт JPG, PNG или PDF",
      tooBig: "Файл больше 10 МБ",
      emptyFile: "Файл пустой",
      limit: "Уже 5 документов. Чтобы добавить новый, удали один из старых.",
      uploaded: "Документ загружен",
      uploadFailed: "Не получилось загрузить файл, попробуй ещё раз.",
      remove: "Удалить",
      removeConfirm: "Да, удалить",
      removed: "Документ удалён",
      removeFailed: "Не получилось удалить документ, попробуй ещё раз.",
    },
    submit: {
      first: "Отправить на проверку",
      again: "Отправить снова",
      done: "Документы отправлены на проверку",
      needDocuments: "Сначала добавь хотя бы один документ",
      failed: "Не получилось отправить, попробуй ещё раз.",
    },
    /** On the trainer's Today screen until the documents are verified (screens.md §3.1). */
    banner: {
      not_submitted: { title: "Пройди верификацию", text: "Загрузи документы для значка" },
      pending: { title: "Документы на проверке", text: "Работать с клиентами уже можно" },
      rejected: { title: "Верификация отклонена", text: "Посмотри, что исправить" },
    },
    admin: {
      title: "Верификация тренеров",
      queue: "На проверке",
      emptyTitle: "Очередь пуста",
      emptyText: "Когда тренер отправит документы, он появится здесь.",
      sentOn: "Документы от {date}",
      noDocuments: "Тренер удалил все документы",
      openDocument: "Открыть «{title}»",
      verify: "Верифицировать",
      reject: "Отклонить",
      reasonLabel: "Причина отказа",
      reasonHint: "Тренер увидит её в приложении и в боте",
      reasonEmpty: "Напиши причину отказа",
      confirmReject: "Отклонить",
      cancel: "Отмена",
      verified: "Тренер верифицирован",
      rejected: "Верификация отклонена",
      alreadyDecided: "Другой админ уже принял решение",
      failed: "Не получилось сохранить решение, попробуй ещё раз.",
      history: "Последние решения",
      historyVerified: "Верифицирован {date}",
      historyRejected: "Отклонён {date}",
      deletedAccount: "Удалённый аккаунт",
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
    /** С3: the admin decided (PRD §3). */
    verificationVerified: "Верификация пройдена, на твоей витрине теперь есть значок.",
    verificationRejected: "Верификацию пройти не получилось, причина: «{reason}». Поправь документы и отправь их снова.",
    openVerification: "Открыть верификацию",
    /** А1: to the closed admin group. */
    verificationSubmitted: "Новая заявка на верификацию: {name}, документов: {count}.",
    openQueue: "Открыть очередь",
  },
  toast: {
    /** Screen reader name of the area where toasts appear. */
    region: "Уведомления",
  },
};

export type Dictionary = typeof ru;
