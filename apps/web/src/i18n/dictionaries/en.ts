import type { Dictionary } from "./ru";

/** English catalog. Same keys as ru.ts (the type enforces it); sentence case, no em dashes (docs/writing.md). */
export const en: Dictionary = {
  meta: {
    appName: "DaFit",
    description: "DaFit helps personal trainers manage their schedule and keep track of client passes and progress.",
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
        emptyText: "Your sessions and open slots will show up here, by day or by week.",
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
        emptyTitle: "No showcase yet",
        emptyText: "Your showcase with its QR code, client links, and trainer settings will show up here.",
      },
    },
    client: {
      home: {
        emptyTitle: "No sessions yet",
        emptyText: "Your next session, pass balance, and plan for the day will show up here.",
      },
      sessions: {
        emptyTitle: "No bookings yet",
        emptyText: "Your upcoming and past bookings will show up here.",
        detail: "Booking details will open here",
      },
      diary: {
        emptyTitle: "Your diary is empty",
        emptyText: "Your workouts will show up here, day by day.",
      },
      progress: {
        emptyTitle: "No measurements yet",
        emptyText: "Your weight, measurements, progress photos, and personal records will show up here.",
      },
      trainers: {
        emptyTitle: "You don't have a trainer yet",
        emptyText: "Your trainer will appear here once you open their link or scan their QR code.",
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
    description: "You don't need a password or email, just your Telegram account.",
    action: "Log in with Telegram",
    errors: {
      expired: "The login took too long. Try again.",
      denied: "The login was canceled in Telegram. Try again.",
      state: "We couldn't verify the login. Try again.",
      failed: "We couldn't log you in with Telegram. Try again.",
    },
  },
  telegram: {
    signInFailed: "Couldn't log you in. Reopen the app.",
    signInExpired: "The login data from Telegram has expired or never arrived. Close the app and open it again.",
    cookiesBlocked: "This browser won't let us keep you logged in. Open DaFit in the Telegram app on your phone or computer.",
  },
  notFound: {
    title: "This page doesn't exist",
    text: "The link may be out of date.",
    action: "Go to the main screen",
  },
  toast: {
    region: "Notifications",
  },
};
