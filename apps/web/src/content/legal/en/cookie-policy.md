# DaFit Cookie Policy

> **Draft of 18 October 2026. Do not publish without review by a qualified lawyer in each target jurisdiction.** Prepared from the DaFit codebase and laws in force in October 2026. Points for the lawyer are marked "Counsel:".

Effective date: [EFFECTIVE DATE]

This policy explains which cookies and similar storage the Service uses in the web app at [DOMAIN] and in the Telegram Mini App. The Service is run by [OPERATOR FULL NAME], an individual, at [ADDRESS] ("DaFit", "we", "us"; contact: [CONTACT EMAIL]). For everything else about personal data, see the [Privacy Policy](privacy-policy.md).

## 1. What cookies are

1.1. A cookie is a small text file a website saves in your browser and reads back later. Browsers also offer "local storage" and "session storage", which work in a similar way. The law treats all of them alike, so this policy covers them all.

## 2. In short

2.1. DaFit uses only its own (first-party) cookies and storage: to sign you in, keep you signed in safely, and remember settings you chose (section 4). We use no advertising cookies, no third-party analytics or tracking cookies, no social media pixels and no third-party cookies. Our fonts are our own, so no font service sets anything either.

## 3. Cookies we use

| Name | What it does | How long | Type |
|---|---|---|---|
| `sb-<project>-auth-token` (may be split into several parts: `.0`, `.1` …) | Keeps you signed in. Holds your session from our sign-in system (Supabase). Readable only by our server | Up to 400 days, renewed while you use DaFit; removed when you sign out | Strictly necessary |
| `fit_tg_oidc` | Holds a one-time security code while you sign in with Telegram on the website, so the sign-in cannot be hijacked. Readable only by our server, used only on the sign-in pages | 10 minutes | Strictly necessary |
| `dafit-locale` | Remembers the language you chose (Russian or English) | 1 year | Functional (your preference) |
| `dafit-theme` | Remembers the theme you chose (light, dark or system), so the page does not flash the wrong colours while loading | 1 year | Functional (your preference) |
| `dafit-zone` | Remembers whether you last used DaFit as a trainer or as a client, so the app opens there | 1 year | Functional |
| `dafit-health-notice` | Remembers that you read the health notice shown before your first nutrition target, so it is not shown again | 1 year | Functional |

## 4. Local and session storage

| Key | What it does | How long | Type |
|---|---|---|---|
| Telegram launch parameters (`tapps/launchParams`) and Telegram colour scheme | Keep the data Telegram passes when it opens the Mini App, so that reloading a screen still works and shows the right theme | Until you close the tab | Strictly necessary |
| Start link and language reload markers | Stop the app from following the same bot link or reloading for your language twice in one tab | Until you close the tab | Strictly necessary |
| Time zone marker | Stops the app from sending your device's time zone to our server again on every screen | Until you close the tab | Functional |
| Seen milestones | Remembers which milestone celebrations you have already seen, so each plays only once | Until you clear your browser data | Functional |

Our server also records when you open the app and from which bot button, to see how DaFit is used. Nothing is stored on your device for this. You can switch it off in Settings, then "App opening count"; your past openings are deleted and new ones are not recorded.

> Counsel: the opening count no longer stores anything on the device, so Art. 5(3) of the ePrivacy Directive does not apply to it; the server-side record relies on legitimate interests with the opt-out above (privacy policy, section 5).

## 5. Why there is no cookie banner

5.1. EU and UK law (Art. 5(3) of the ePrivacy Directive as implemented in each EU country, and regulation 6 of the UK Privacy and Electronic Communications Regulations 2003) requires consent before storing or reading information on your device, except where:
- it is strictly necessary to provide the service you asked for. This covers the sign-in cookies, the security code during sign-in, and the Telegram launch data;
- it only remembers a choice you made about how the site looks or works, such as language or theme. EU regulators treat such user-interface preferences as part of the service you requested. In the UK, the 2025 reform added a specific exception for adapting a website to your preferences or improving its appearance or functionality, provided you get clear information (this policy) and can object (section 6).

5.2. DaFit uses nothing beyond these, so we do not show a consent banner. If we ever want to use a cookie that is not covered by these exceptions, for example for analytics or advertising, we will update this policy and ask for your consent first, with "Accept" and "Reject" equally easy, and we will not set it until you agree.

> Counsel: (1) `dafit-zone` is set automatically from the screen you open, not by an explicit choice; it is a functional convenience. Confirm that it falls under the strictly-necessary or UK appearance/functionality exception, or shorten its life. (2) The EU Digital Omnibus proposal would move cookie rules into the GDPR (new Art. 88a); it was still being negotiated in October 2026. Re-check before publication.

## 6. How to manage or object

6.1. You can delete cookies and site data at any time in your browser settings, or block them. If you block the strictly necessary cookies, you cannot sign in to DaFit on the web; inside Telegram, some Telegram apps may then ask you to open DaFit in the Telegram app on your phone or computer.

6.2. To object to a functional cookie or storage item, delete it in your browser or write to [CONTACT EMAIL]. You can also change your language and theme in the app at any time. Without these items DaFit still works, but it will not remember your choices.

## 7. Changes

7.1. We will update this policy and its effective date whenever we add, remove or change a cookie or storage item.
