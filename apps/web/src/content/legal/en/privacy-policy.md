# DaFit Privacy Policy

> **Draft of 18 October 2026. Do not publish without review by a qualified lawyer in each target jurisdiction.** Prepared from the DaFit codebase and laws in force in October 2026. Points for the lawyer are marked "Counsel:".

Effective date: [EFFECTIVE DATE]

This policy explains what personal data DaFit collects, why, who can see it, how long we keep it and how you control it. It covers the DaFit Telegram bot @fitconnection_bot, the DaFit web app at [DOMAIN] and the DaFit Telegram Mini App (together, the "Service").

Related documents: [Terms of Service](terms-of-service.md), [Subscription Terms](subscription-terms.md), [Community Guidelines](community-guidelines.md), [Health Disclaimer](health-disclaimer.md), [Cookie Policy](cookie-policy.md), [Consumer Health Data Privacy Policy](consumer-health-data-privacy-policy.md) (for residents of Washington, Nevada and Connecticut) and [Data Processing Addendum](data-processing-addendum.md) (for trainers).

## 1. Who we are and how to reach us

1.1. The Service is run by [OPERATOR FULL NAME], an individual, at [ADDRESS] ("DaFit", "we", "us").

1.2. Privacy questions, requests and complaints: [CONTACT EMAIL], or the feedback form in the app (Profile, then "Report a problem / idea"). Write "Privacy" at the start of your message so it reaches the right person.

1.3. EU representative (GDPR Art. 27): [EU REPRESENTATIVE].
UK representative (UK GDPR Art. 27): [UK REPRESENTATIVE].

> Counsel: the operator appears to be established outside the EU and UK and offers the Service to people there, so GDPR Art. 3(2) and UK GDPR Art. 3(2) apply. The Art. 27(2) exemption covers only occasional processing that does not include large-scale special-category data. DaFit processes health data continuously, so we recommend appointing both representatives before EU/UK users are admitted. Also assess whether a DPO is required (Art. 37(1)(c)) once processing of health data becomes large scale.

## 2. What DaFit is, and the roles involved

2.1. DaFit connects fitness trainers and their clients: scheduling and booking, passes and a record of payments, workouts and homework, a food diary, body measurements, progress photos, steps, sleep, water, a health questionnaire, challenges, reviews and a public trainer showcase.

2.2. Words we use. These have the same meaning as in the [Terms of Service](terms-of-service.md), section 2:
- **User**: anyone who signs in to the Service.
- **Trainer**: a fitness professional who uses DaFit to work with clients.
- **Client**: a person who trains with a trainer.
- **Pair**: the coaching relationship between one trainer and one client. A client can be in several pairs.
- **Assistant** (in some screens, a delegate): a person a trainer lets help with their work, for example an assistant or a substitute for a session.
- **Pass**: a package of sessions a client buys from a trainer.
- **Questionnaire**: the health and goals form a client fills in for a trainer (shown in the app as the intake form): goals, health, injuries, PAR-Q answers.
- **Showcase**: a trainer's public page at [DOMAIN]/trainers/[slug].
- **"What your trainer sees"**: the screen on each trainer's card where the client chooses which categories of their data that trainer can see.

2.3. Who is responsible for which data:
- **We are the controller** for your account and for the data you enter about yourself (for example your food diary, measurements and photos).
- **Your trainer becomes a separate controller** for the categories you allow them to see in "What your trainer sees". They use that data to coach you, under their own responsibility. Their agreement with you is between the two of you; DaFit is not a party to it.
- **We act as a processor for the trainer** for client cards a trainer keeps for people who have no DaFit account, for the trainer's notes about clients, and for the trainer's records of sessions, passes and payments. For that data the trainer is the controller and the [Data Processing Addendum](data-processing-addendum.md) applies. If your trainer keeps such data about you, ask the trainer first; we will help them answer.
- **Telegram is a separate controller** for its own platform. When you use DaFit through Telegram, Telegram's privacy policy also applies.

> Counsel: confirm the split for trainer records about clients who do have an account (sessions, bookings, passes, ledger, payments). We treat them as the trainer's records processed by us on the trainer's behalf, which is why they survive the client's account deletion in anonymised form (section 9).

## 3. Who can use DaFit

3.1. DaFit is for people aged 18 or over, both trainers and clients. We do not knowingly collect data from anyone under 18. If you believe a minor uses DaFit, write to [CONTACT EMAIL] and we will delete the account.

> Team: not in the product yet, see product-changes. The code has no age gate today; the nutrition calculator refuses users under 18, nothing else does.

## 4. What data we collect

| Category | What exactly | Where it comes from |
|---|---|---|
| Telegram account data | Telegram user ID, first and last name, username, link to your Telegram profile photo, language. Updated from Telegram every time you sign in. | Telegram, when you open the Mini App or sign in on the web |
| Account settings | Display name, your own avatar if you upload one, time zone, theme, language, active role (trainer or client), notification settings, whether you started or blocked the bot, last time you were active. Our sign-in system also holds a technical address of the form `tg<ID>@…` that is not a real email and is never used to write to you. | You; your device (time zone); Telegram (bot status) |
| Body and nutrition | Sex, date of birth, height, activity level, goal, calculated calorie and macro targets, food diary entries (products, grams, calories), your own products, water, sleep (minutes and quality 1-5), steps | You. Steps can also arrive from an Apple Shortcuts automation you set up with a personal token |
| Health data | The questionnaire (goals, health conditions, injuries, PAR-Q answers and a flag that at least one PAR-Q answer is "yes"), body measurements (weight, girths), progress photos, workouts and workout logs | You |
| Pair data | Pair status, your sharing choices per category, the trainer's private nickname for you, the trainer's comments on your food diary days, monthly reports you choose to send to your trainer, trainer notes about you (hidden from you unless the trainer makes a note visible) | You and your trainer |
| Client cards without an account | Name, an optional contact written as free text, notes, sessions and payments | The trainer (we process this for the trainer, section 2.3) |
| Schedule | Sessions, bookings, cancellations with reasons, waitlist, QR check-ins | You and your trainer |
| Money records | Passes, the pass ledger (it cannot be edited, only added to), payment records (amount, currency, method: cash, bank transfer, SBP, card or the trainer's own payment link), debts, an assistant's share. The client can mark "I paid" and the trainer confirms | You and your trainer. **DaFit never receives or sends money and stores no card or bank details** |
| Trainer profile | City, specialisations, places of work with address and map coordinates, prices, description, certificates and documents uploaded for verification | The trainer |
| Showcase | Name, photo, description, prices and reviews whose authors agreed to publication | The trainer; review authors |
| Reviews and surveys | Rating, review text, the trainer's reply, short surveys after sessions | You |
| Challenges | Taking part, your score under a pseudonym, photos for the challenge | You |
| Invitations | Referral and trial-session links: the token and who invited whom | You and the person who invited you |
| Calendar feed | A secret link to your schedule as a calendar feed (ICS). Events show the other person's name, the time and the place | Generated by us when you turn it on |
| Story card | The items you pick to share as an image card behind a link | You |
| Contact requests | When one side of a pair asks the other to get in touch and that person agrees, Telegram sends their phone number, signed by Telegram. We put it only into the bot message to the other person; we do not store it in your profile or anywhere else. The request itself keeps only its status | You, through Telegram's "share contact" button |
| Feedback and reports | Your message, the screen you were on, platform and app version, up to 3 screenshots; reports about content or users | You |
| App usage | Records that you opened the app: who, when, and from which bot button | Your device, when the app loads |
| Admin audit log | Records of admin actions such as granting plans, bans, decisions on reports, emergency access and opening a trainer's analytics | Our team's actions |
| Technical data | IP address, browser and device type, request logs kept by our hosting provider; error reports if error reporting is on (section 7) | Your device |

4.1. We do not collect your Telegram messages, contacts or chats. We do not collect precise location from your device. Trainers enter addresses of their places of work themselves.

4.2. **Progress photos.** Before a photo leaves your device, DaFit blurs faces on the device and removes EXIF data, including location. The original never leaves your phone or computer. To blur faces, your browser downloads a face-detection model (MediaPipe) from our own domain; no third party is involved. No face geometry or biometric template is stored by us. Photos are delivered through links that expire after 300 seconds.

> Counsel: the product team plans to self-host the face-detection model so that no third party receives the user's IP address (see product-changes). Update 4.2 when that ships.

## 5. Why we use your data and our legal bases

This table gives the legal bases under the EU GDPR and the UK GDPR. United States laws are covered in sections 14 and 15.

| Purpose | Data | Legal basis |
|---|---|---|
| Create your account, sign you in through Telegram, keep you signed in | Telegram account data, account settings | Contract (Art. 6(1)(b)) |
| Run the service: schedule, bookings, passes, payment records, homework, reminders | Schedule, money records, pair data | Contract (Art. 6(1)(b)) |
| Store your health and body data and show it back to you, including charts and calculated nutrition targets | Body and nutrition, health data | Your explicit consent (Art. 6(1)(a) and Art. 9(2)(a)) |
| Show the categories you choose to your trainer | The categories you turn on in "What your trainer sees" | Your explicit consent (Art. 6(1)(a) and Art. 9(2)(a)) |
| Send you notifications through the Telegram bot | Telegram ID, notification content | Contract (Art. 6(1)(b)); you can turn each kind off |
| Pass a contact request to the other person | Phone number you choose to share | Your consent (Art. 6(1)(a)) |
| Publish a trainer's showcase | Trainer profile, showcase | Contract with the trainer (Art. 6(1)(b)) |
| Show reviews to the trainer and our team; publish a review only if its author agrees | Reviews | Legitimate interests in helping trainers improve and keeping reviews honest (Art. 6(1)(f)); publication on your consent (Art. 6(1)(a)) |
| Leaderboards in challenges (off by default, under a pseudonym) | Challenge data | Your consent (Art. 6(1)(a)) |
| Story cards and calendar feeds you create | What you pick | Contract, at your request (Art. 6(1)(b)) |
| Verify trainers | Certificates and documents | Legitimate interests in letting clients trust trainer profiles (Art. 6(1)(f)) |
| Invitations and trial-session links | Tokens, who invited whom | Contract (Art. 6(1)(b)) |
| Understand how DaFit is used and improve it (counts of app openings, which bot buttons people use) | App usage | Legitimate interests in improving the Service (Art. 6(1)(f)). Aggregates only; our team does not read your health data for this. You can switch it off in Settings, then "App opening count", and your past openings are deleted |
| Support, feedback, bug fixing | Feedback, technical data, error reports | Legitimate interests (Art. 6(1)(f)) |
| Security, abuse prevention, moderation, bans, audit log | Technical data, reports, audit log | Legitimate interests in a safe service (Art. 6(1)(f)); legal obligation where one applies (Art. 6(1)(c)) |
| Emergency access by an admin (section 6.5) | Only the categories needed for the case | Legitimate interests (Art. 6(1)(f)); for health data, Art. 9(2)(f) (legal claims) or Art. 9(2)(c) (vital interests) where they apply |
| Record your acceptance of our terms and your consents | Consent records | Legal obligation to prove consent (Art. 7(1)); legitimate interests |
| Comply with the law and answer lawful requests | Any, as required | Legal obligation (Art. 6(1)(c)) |

5.1. Where we rely on legitimate interests, you can object (section 10). We have balanced our interests against yours; ask us for details.

5.2. We do not sell personal data, show ads, use advertising or analytics trackers, or make decisions about you based solely on automated processing that have legal or similarly significant effects. The PAR-Q flag only shows your trainer a warning so they can suggest you see a doctor; it decides nothing.

> Counsel: under the UK Data (Use and Access) Act 2025 some purposes may qualify as "recognised legitimate interests" (UK GDPR Art. 6(1)(ea)), for example crime prevention or safeguarding. We have kept Art. 6(1)(f) for simplicity; adjust if useful.

## 6. Health data and who sees what

6.1. **Your consent comes first.** Health data is special-category data under the GDPR and consumer health data under several US state laws. We will ask for your explicit consent before you first enter it. You can withdraw consent at any time by deleting the entries or your account; withdrawing does not affect what we did before.

> Team: not in the product yet, see product-changes. The code records only acceptance of the beta terms today (consent kind `beta_terms`); there is no separate health data consent screen.

> Counsel: a separate, unticked health data consent at first entry, with the consent version stored, is a required product change. Health data must not be collected on the beta terms alone.

6.2. **Each pair is private.** Everything personal sits inside a pair and the database itself enforces it, not only the screens. A trainer sees only their own clients and only the categories each client allows. A trainer never sees data you keep with another trainer.

6.3. **"What your trainer sees".** For each trainer separately you choose whether they see: nutrition, measurements, photos, steps, workouts and the questionnaire. Unless you change them, nutrition, measurements, steps and workouts are visible to the trainer, while photos and the questionnaire are hidden. The questionnaire is shown to a trainer only after you answer "Show" on a separate screen when you join that trainer; the screen has no preselected answer and you can choose "Decide later". You can change any of these at any time, and you can end the pair. When you turn a category off, the trainer stops seeing it straight away. Data the trainer already copied outside DaFit is the trainer's responsibility.

> Counsel: measurements are health data and are visible to the trainer by default. A default-on setting is not explicit consent under GDPR Art. 9(2)(a), and Washington and Nevada require a separate affirmative consent for sharing. We recommend that the product ask the client to confirm each category with no preselection when the pair is created, as it already does for the questionnaire (listed in product-changes). Until then this paragraph describes the current behaviour accurately but may not meet the consent standard.

6.4. **Assistants** (a trainer's assistants or substitutes) see only what the trainer's delegation allows, never amounts of money.

6.5. **Our team.** DaFit admins cannot read clients' nutrition, measurements, photos or questionnaires; admin analytics show only aggregates. Admins see trainers' certificates when checking them, reviews, and reports sent to us. In exceptional cases (for example a credible safety or legal matter) an admin can open time-limited emergency access. It requires a written reason, is recorded in the audit log, and you are notified.

6.6. **Public data.** A trainer's showcase is public to anyone with the link. An avatar you upload is stored at a public link. A story card is visible to anyone who has its link, shows only what you chose and stops working after 30 days. On leaderboards you appear only if you opt in, under a pseudonym; challenge photos are seen only by you and the trainer.

6.7. **Calendar feed.** If you subscribe to your DaFit calendar in Google Calendar, Apple Calendar, Outlook or similar, that calendar provider fetches the feed and processes it under its own terms. Anyone with the secret link can see the feed, so keep it private; you can reissue the link in Settings, then Calendar, and the old link stops working at once.

6.8. DaFit is not a medical service and trainers are not doctors. See the [Health Disclaimer](health-disclaimer.md).

## 7. Who we share data with

We share personal data only as described here.

| Recipient | Role | What they receive | Where |
|---|---|---|---|
| Supabase, Inc. | Processor: database, sign-in, file storage | All data stored in DaFit | United States (us-east-1) |
| Vercel Inc. | Processor: hosting of the web app and the bot | Requests passing through, request logs (IP address, browser, URL) | United States |
| Telegram (Telegram FZ-LLC, UAE, and Telegram Messenger Inc.) | Independent controller | Sign-in data it gives us, bot messages we send you (which may include names, times and places of sessions and, for contact requests, a phone number), the Mini App platform, profile photos at t.me | United Arab Emirates and Telegram's other locations |
| Functional Software, Inc. (Sentry), only if we turn error reporting on | Processor: error reports | Error type and message, technical context. We switch off user details, request bodies, cookies, headers and query strings | United States |
| Open Food Facts | Food database | Search words and barcodes, sent from our server. No personal data | France |
| Your trainer | Independent controller | The categories you allow (section 6) | Wherever the trainer is |
| Calendar apps you subscribe with | Independent controllers, chosen by you | Your calendar feed | Their own locations |
| Authorities, courts, advisers | As required | What the law requires or our advisers need | As applicable |
| A buyer or successor of DaFit | New controller | Data needed to continue the Service, under this policy | As applicable |

7.1. The exercise library (wger) runs inside DaFit and receives nothing. We use our own fonts, not Google Fonts. We do not send email newsletters; all messages come through the Telegram bot.

7.2. When you send feedback, our team also gets a short notice with an excerpt of it in a private Telegram group of DaFit admins; your name is not in that notice. We will not forward feedback to any public issue tracker.

> Counsel: the code can forward feedback to GitHub Issues if `GITHUB_FEEDBACK_TOKEN` and `GITHUB_FEEDBACK_REPO` are set, and the repository is public. Today they are not set. Keep it that way, or forward only to a private repository and add GitHub to this table.

## 8. International transfers

8.1. We store DaFit data in the United States with Supabase and Vercel. If you are in the EEA, the UK or Switzerland, your data travels outside your country.

8.2. Safeguards:
- **Vercel** states that it is certified under the EU-U.S. Data Privacy Framework, including the UK Extension and the Swiss-U.S. framework, and its Data Processing Addendum also includes the EU Standard Contractual Clauses and the UK Addendum.
- **Supabase** transfers data under the EU Standard Contractual Clauses (Commission Implementing Decision (EU) 2021/914) included in its Data Processing Addendum, with the UK Addendum for UK data. [Counsel to confirm.]
- **Sentry**, if enabled: [DPF certification or SCCs, to be confirmed].
- We have assessed the laws of the United States for these transfers, including the measures in the Data Privacy Framework that also benefit transfers under the SCCs.

8.3. You can ask us for a copy of the safeguards at [CONTACT EMAIL].

> Counsel: (1) the EU-U.S. Data Privacy Framework stands: the General Court upheld it on 3 September 2025 (T-553/23, Latombe), and the appeal C-703/25 P was still pending at the Court of Justice in October 2026. Keep the SCCs in place as a fallback. (2) We could not confirm that Supabase is listed on dataprivacyframework.gov; its public FAQ names SCCs only. Check the list and the current Supabase DPA. (3) If the operator itself is outside the EEA/UK, data collected directly from users may not be a "transfer" in the sense of Chapter V (EDPB Guidelines 05/2021), but the operator's onward transfers to US processors still need safeguards. (4) For Russian users see the separate Russian-law documents; data localisation under Federal Law 152-FZ is outside this draft.

## 9. How long we keep data

| Data | How long |
|---|---|
| Your account and everything you entered | While your account exists. You can delete single entries at any time |
| After you ask to delete your account | 30 days in which you can cancel the deletion; during this time you can open only the deletion and export screens. Then we delete your profile, settings, questionnaire, measurements, photos, food diary, activity, goals, targets, your own logs, trainer notes about you, tokens, calendar feed, your reviews and challenge participation. The bot tells you "Deletion complete" |
| Trainer's records about a client who deleted their account (sessions, bookings, passes, ledger, payments) | Kept by the trainer for their accounting, but linked to "Deleted client" with no name and no contact |
| A trainer's account | Deleted in the same way. With the trainer profile we delete the trainer's pairs, client cards, passes and notes |
| Data export archive | The download link works for 7 days |
| Bot notifications, including messages carrying a phone number for a contact request | Deleted 90 days after sending |
| Contact requests | Expire after 7 days; we keep only the status |
| Story card link | 30 days |
| Links to view a progress photo | 300 seconds |
| Feedback and reports | [FEEDBACK RETENTION]. After account deletion they stay without any link to you |
| App usage records | [APP USAGE RETENTION, proposed 13 months] |
| Admin audit log | [AUDIT LOG RETENTION]. After your account is deleted it keeps only the fact of deletion, with no personal data |
| Hosting request logs (Vercel) | [VERCEL LOG RETENTION] |
| Database backups (Supabase) | [BACKUP RETENTION]. Deleted data disappears from backups when they expire |
| Consent records | While the account exists and for [LIMITATION PERIOD] after, to prove consent |

> Counsel: retention for feedback, app usage, the audit log, hosting logs and backups is not set in the code. The owner must choose periods and the code must enforce them before publication.

## 10. Your rights and how to use them

10.1. Depending on where you live, you have the right to: access your data and get a copy; correct it; delete it; restrict or object to some uses; receive it in a portable format; withdraw consent at any time; not be subject to solely automated decisions with legal or similar effect (we make none); and complain to a regulator.

10.2. Most of this you can do yourself in the app:

| What you want | Where |
|---|---|
| Get a copy of all your data | Settings, then Export. We prepare an archive in the background and the bot sends you a link that works for 7 days |
| Delete your account | Settings, then Delete account. You have 30 days to change your mind |
| Choose what a trainer sees, or stop sharing | Your trainer's card, then "What your trainer sees". You can also end the pair |
| Correct your data | Edit the entry. Your name and username come from Telegram: change them in Telegram and they update at your next sign-in, or set a display name in DaFit |
| Stop notifications | Settings, then Notifications, per kind. Blocking the bot stops all messages |
| Stop us counting your app openings | Settings, then App opening count. Past openings are deleted |
| Withdraw consent for health data | Delete the entries or your account |

10.3. For anything else, write to [CONTACT EMAIL]. We may ask you to confirm the request from your Telegram account so that nobody else can make it in your name. We answer within one month; if a request is complex we can extend this by up to two more months and will tell you why within the first month. Requests are free unless they are clearly unfounded or excessive.

10.4. If your request concerns data a trainer keeps as controller (section 2.3), we will pass it to the trainer and help them answer.

## 11. Complaints

11.1. Please write to us first at [CONTACT EMAIL] or through the feedback form, starting with "Privacy complaint". We acknowledge every complaint within 30 days, look into it without undue delay, keep you informed and tell you the outcome.

11.2. You can also complain to a data protection authority at any time:
- in the EEA, the authority in the country where you live or work, or where the issue happened (list at edpb.europa.eu);
- in the UK, the Information Commissioner's Office (ico.org.uk). The ICO usually expects you to raise the complaint with us first;
- in Switzerland, the FDPIC;
- elsewhere, your local authority.

> Counsel: the UK complaints duty (UK GDPR Art. 164A, inserted by the Data (Use and Access) Act 2025) applies from 19 June 2026: a way to complain, acknowledgment within 30 days, response without undue delay, outcome reported. The product needs an easy route (a "Privacy complaint" option in feedback) and an internal log.

## 12. Security

12.1. We protect data with measures that include:
- sign-in only through Telegram, verified on our server; we store no passwords;
- row-level security in the database, so each person can reach only their own data and each trainer only the data of their pairs, tested automatically;
- encryption in transit (HTTPS) and at rest by our hosting providers;
- face blurring and removal of photo metadata on your device before upload; short-lived links to photos;
- private storage for photos, certificates and feedback screenshots;
- secrets kept only on the server, separate keys for each environment;
- tokens for calendar feeds and step imports stored only as hashes; you can replace them;
- an append-only audit log of admin actions, and no admin access to clients' health data except audited emergency access.

12.2. No system is perfectly secure. Keep your Telegram account safe (two-step verification helps), and do not share your calendar link or export link.

## 13. Data breaches

13.1. If a breach is likely to put your rights at risk, we notify the competent authority within 72 hours of becoming aware of it where the law requires (GDPR and UK GDPR Art. 33). If the risk to you is high, we tell you without undue delay through the bot (Art. 34). Where US state laws or the FTC Health Breach Notification Rule apply, we notify you and regulators within the deadlines they set.

> Counsel: the FTC Health Breach Notification Rule (16 CFR Part 318, amended effective 29 July 2024) covers vendors of personal health records, including apps that can draw health data from more than one source (DaFit takes data from the user and from an Apple Shortcuts import). A "breach" includes unauthorised disclosure, not only hacks. Notice to individuals and, for 500 or more people, to the FTC is due without unreasonable delay and within 60 calendar days. Confirm whether DaFit is covered once it serves US users.

## 14. United States privacy rights

14.1. Several US states give residents rights over their personal data, and many treat health data as sensitive data that may be processed only with opt-in consent. Where such a law applies to us, you can:
- confirm whether we process your data and access it;
- correct it;
- delete it;
- get a portable copy;
- opt out of sale, targeted advertising and profiling with significant effects. We do none of these, so there is nothing to opt out of;
- give or refuse consent before we process sensitive data, and withdraw it later;
- appeal if we refuse your request. Write to [CONTACT EMAIL] with "Appeal" in the subject. We decide within the period set by your state's law (usually 45 or 60 days) and, if we refuse, tell you how to contact your state Attorney General.

14.2. Use the in-app tools in section 10 or write to [CONTACT EMAIL]. You can use an authorised agent; we may ask the agent for proof and ask you to confirm the request from your Telegram account. We will not treat you differently for using your rights.

14.3. Residents of Washington, Nevada and Connecticut, and anyone whose consumer health data we collect in those states, have additional rights described in the [Consumer Health Data Privacy Policy](consumer-health-data-privacy-policy.md).

> Counsel: by October 2026 comprehensive state laws are in force in about 20 states. Most apply only above volume thresholds (for example 100,000 or 35,000 consumers), which DaFit is far below. Exceptions to check: Connecticut (from 1 July 2026 the CTDPA applies to any controller processing sensitive data, regardless of volume), Texas and Nebraska (no volume threshold, but small businesses under the SBA definition are exempt except that they must get consent before selling sensitive data), and Washington's and Nevada's consumer health data laws (no revenue or volume threshold for coverage).

## 15. California notice at collection

15.1. This section applies if and when DaFit becomes a "business" under the California Consumer Privacy Act, as amended by the CPRA. Today we are below its thresholds (for example, annual gross revenue above US$26,625,000 as adjusted for 2025, or buying, selling or sharing the personal information of 100,000 or more consumers or households).

15.2. Categories we collect (section 4), mapped to the CCPA: identifiers (Telegram ID, username, IP address); personal information under Cal. Civ. Code § 1798.80 (name, phone number in a contact request); characteristics of protected classifications (sex, age from date of birth); internet activity (app openings, request logs); sensory information (progress photos); professional information (trainer certificates and specialisations); inferences (calculated nutrition targets, the PAR-Q flag); and **sensitive personal information**: health data (questionnaire, measurements, photos, food diary, sleep, workouts) and account log-in through Telegram.

15.3. Purposes: section 5. Retention: section 9. We use sensitive personal information only to provide the service you ask for, as allowed by Cal. Code Regs. tit. 11, § 7027(m), so the right to limit its use does not need a separate link.

15.4. We do not sell or share personal information for cross-context behavioural advertising, and we have not done so in the past 12 months. We do not knowingly sell or share the personal information of consumers under 16.

15.5. California residents can use the rights in section 14 (to know, delete, correct, and to limit use of sensitive personal information).

## 16. Changes to this policy

16.1. We will post changes here with a new effective date. If a change is significant, for example a new purpose for health data or a new kind of recipient, we will tell you in the bot or the app before it takes effect and, where the law requires, ask for your consent again.
