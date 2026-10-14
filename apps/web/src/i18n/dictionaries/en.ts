import type { Dictionary } from "./ru";

/** English catalog. Same keys as ru.ts (the type enforces it); sentence case, no em dashes (docs/writing.md). */
export const en: Dictionary = {
  meta: {
    appName: "DaFit",
    description: "DaFit helps personal trainers run their schedule, passes, and client progress.",
  },
  common: {
    back: "Back",
    close: "Close",
    loading: "Loading",
    profile: "Profile",
    skipToContent: "Skip to content",
  },
  nav: {
    sections: "Sections",
  },
  zones: {
    label: "Zone",
    trainer: "Trainer",
    client: "Client",
  },
  tabs: {
    trainer: {
      today: "Today",
      schedule: "Schedule",
      clients: "Clients",
      money: "Money",
      more: "More",
    },
    client: {
      home: "Home",
      sessions: "Sessions",
      diary: "Diary",
      progress: "Progress",
      trainers: "Trainers",
    },
  },
  screens: {
    trainer: {
      today: {
        emptyTitle: "No sessions today",
        emptyText: "Today's sessions, booking requests, and clients whose passes are running out will show up here.",
      },
      schedule: {
        emptyTitle: "Your schedule is empty",
        emptyText: "Sessions and open slots for the day and the week will show up here.",
      },
      clients: {
        emptyTitle: "No clients yet",
        emptyText: "Send a client your link or show your QR code, and they'll appear here on their own.",
        detail: "A client's card will open here",
      },
      money: {
        emptyTitle: "No payments yet",
        emptyText: "Payments, debts, and passes for all your clients will show up here.",
        detail: "Payment details will open here",
      },
      more: {
        emptyTitle: "Your showcase and links will be here",
        emptyText: "This is where your showcase with a QR code, client links, and trainer settings will live.",
      },
    },
    client: {
      home: {
        emptyTitle: "No sessions yet",
        emptyText: "Your next session, pass balance, and goals for the day will show up here.",
      },
      sessions: {
        emptyTitle: "No bookings yet",
        emptyText: "Your past and upcoming session bookings will show up here.",
        detail: "Booking details will open here",
      },
      diary: {
        emptyTitle: "Your diary is empty",
        emptyText: "Your workouts will show up here, day by day.",
      },
      progress: {
        emptyTitle: "No measurements yet",
        emptyText: "Your weight, measurements, progress photos, and records will show up here.",
      },
      trainers: {
        emptyTitle: "You don't train with anyone yet",
        emptyText: "Ask your trainer for a link or QR code, and they'll appear here.",
        detail: "A trainer's card will open here",
      },
    },
  },
  profile: {
    title: "Profile",
    signedOutText: "Log in with Telegram to see your name and photo here.",
    signIn: "Log in with Telegram",
    settings: "Settings",
    signOut: "Log out",
  },
  settings: {
    title: "Settings",
    theme: {
      label: "Theme",
      system: "Auto",
      light: "Light",
      dark: "Dark",
      hint: "Auto follows Telegram, or your device settings on the website.",
    },
    language: {
      label: "Language",
    },
  },
  languages: {
    ru: "Русский",
    en: "English",
  },
  login: {
    title: "Log in",
    description: "We use your Telegram account, no passwords or email.",
    action: "Log in with Telegram",
    errors: {
      expired: "The login took too long. Try again.",
      denied: "The login was cancelled in Telegram.",
      state: "We couldn't verify the login request. Try again.",
      failed: "We couldn't log you in with Telegram.",
    },
  },
  telegram: {
    signInFailed: "We couldn't log you in with Telegram",
  },
  notFound: {
    title: "This page doesn't exist",
    text: "The link may be out of date.",
    action: "Go to the main screen",
  },
};
