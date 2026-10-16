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
  /** The trainer profile wizard and its result screen: /onboarding/trainer/[step] and /done (screens.md §3.1). */
  trainerWizard: {
    title: "Профиль тренера",
    /** "Шаг 2 из 7". */
    stepOf: "Шаг {step} из {total}",
    progress: "Профиль заполнен",
    next: "Далее",
    skip: "Пропустить",
    addMore: "Добавить ещё",
    failed: "Не получилось сохранить, попробуй ещё раз.",
    fillProfile: "Заполнить профиль",
    signedOutText: "Чтобы заполнить профиль тренера, войди через Telegram.",
    signIn: "Войти через Telegram",
    steps: {
      profile: {
        title: "Как тебя зовут",
        text: "Имя и фото увидят клиенты на витрине и в приложении. Фото берём из Telegram.",
        name: "Имя",
        nameError: "Напиши имя, до 64 символов",
        headline: "Коротко о себе",
        headlineHint: "Одна строка под именем, например: тренер по силовым, 8 лет в зале",
        bio: "О себе",
        bioHint: "Опыт, подход, с кем любишь работать. Можно заполнить позже.",
      },
      format: {
        title: "Чем ты занимаешься",
        text: "Это покажем на витрине, чтобы клиенту было проще понять, подходишь ли ты ему.",
        formatLabel: "Как ты работаешь",
        offline: "В зале",
        online: "Онлайн",
        formatError: "Выбери хотя бы один формат",
        specialtiesLabel: "Направления",
        city: "Город",
        cityHint: "Если работаешь только онлайн, можно не указывать",
      },
      locations: {
        title: "Где проходят занятия",
        text: "Зал или студия, куда приходят клиенты. Их выберешь при создании занятия.",
        onlineOnly: "Ты работаешь только онлайн, так что этот шаг можно пропустить.",
        added: "Уже добавлены",
        name: "Название",
        namePlaceholder: "Зал на Ленина",
        nameError: "Напиши название, до 80 символов",
        address: "Адрес",
        addressHint: "Клиенты увидят его в записи на занятие",
      },
      region: {
        title: "Часовой пояс и валюта",
        text: "По часовому поясу строим расписание, а в валюте показываем цены и долги.",
        timeZone: "Часовой пояс",
        timeZoneError: "Выбери часовой пояс из списка",
        useDevice: "Взять с телефона: {zone}",
        currency: "Валюта",
      },
      cancellation: {
        title: "Дедлайн отмены",
        text: "Если клиент отменит занятие позже этого срока, оно спишется с абонемента. Правило одно для всех твоих клиентов.",
        label: "Бесплатная отмена не позже чем за",
        hours: "{hours} ч",
        hint: "Обычно ставят 24 часа. Поменять можно в настройках.",
      },
      payment: {
        title: "Ссылка на оплату",
        text: "Клиенты увидят её рядом с абонементом и смогут заплатить сами. Подойдёт ссылка СБП, банка или сервиса самозанятого.",
        added: "Уже добавлены",
        linkTitle: "Название",
        linkTitlePlaceholder: "СБП Сбербанк",
        linkTitleError: "Напиши название, до 64 символов",
        url: "Ссылка",
        urlError: "Нужна ссылка, которая начинается с https://",
        kind: "Тип",
        kinds: {
          sbp: "СБП",
          self_employed: "Самозанятый",
          bank: "Банк",
          other: "Другое",
        },
      },
      certificates: {
        title: "Документы для проверки",
        text: "Дипломы и сертификаты нужны, чтобы на витрине появился значок проверенного тренера. Работать с клиентами можно и без него.",
        upload: "Загрузить документы",
        later: "Позже",
      },
    },
    specialties: {
      strength: "Силовые",
      weight_loss: "Похудение",
      functional: "Функциональный тренинг",
      rehab: "Восстановление после травм",
      stretching: "Растяжка",
      yoga: "Йога",
      pilates: "Пилатес",
      boxing: "Бокс",
      running: "Бег",
      crossfit: "Кроссфит",
      nutrition: "Питание",
      kids: "Дети",
    },
    done: {
      title: "Профиль готов",
      text: "Покажи клиенту QR или отправь ему ссылку. Когда он её откроет, он сразу появится у тебя в клиентах.",
      preview: "Так тебя видят клиенты",
      formats: {
        offline: "В зале",
        online: "Онлайн",
        both: "В зале и онлайн",
      },
      verification: {
        not_submitted: "Без значка",
        pending: "На проверке",
        verified: "Проверен",
        rejected: "Проверка не пройдена",
      },
      verificationHint: "Значок появится после проверки документов. Работать можно уже сейчас.",
      qr: "QR-код ссылки клиента",
      link: "Ссылка клиента",
      share: "Поделиться ссылкой",
      shareText: "Записывайся ко мне на тренировки в DaFit",
      copied: "Ссылка скопирована",
      copyFailed: "Не получилось скопировать ссылку",
      noLink: "Ссылку клиента создать не получилось.",
      createLink: "Создать ссылку",
      schedule: "Открыть расписание",
      edit: "Изменить профиль",
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
  },
  toast: {
    /** Screen reader name of the area where toasts appear. */
    region: "Уведомления",
  },
};

export type Dictionary = typeof ru;
