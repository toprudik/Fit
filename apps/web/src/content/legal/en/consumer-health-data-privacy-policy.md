# DaFit Consumer Health Data Privacy Policy

> **Draft of 18 October 2026. Do not publish without review by a qualified lawyer in each target jurisdiction.** Prepared from the DaFit codebase and laws in force in October 2026. Points for the lawyer are marked "Counsel:".

Effective date: [EFFECTIVE DATE]

This policy is written for the Washington My Health My Data Act (RCW 19.373), Nevada's consumer health data law (SB 370, NRS 603A.400 to 603A.550) and the consumer health data provisions of the Connecticut Data Privacy Act. It applies to residents of those states and to anyone whose consumer health data DaFit collects there. It sits alongside our general [Privacy Policy](privacy-policy.md); where they differ for consumer health data, this policy applies.

> Counsel: Washington requires a prominent link to this policy on the homepage (RCW 19.373.020(1)(b)); Nevada requires a conspicuous link on the main website (NRS 603A.495(2)). The link must be separate from the general privacy policy link. Place it in the footer of the landing page and of every public showcase page, and in the app's Settings.

## 1. Who we are

1.1. The Service (the Telegram bot @fitconnection_bot, the web app at [DOMAIN] and the Telegram Mini App) is run by [OPERATOR FULL NAME], an individual, at [ADDRESS] ("DaFit", "we", "us"). Words such as user, trainer, client, pair, assistant, questionnaire and showcase have the meaning given in the [Terms of Service](terms-of-service.md), section 2.

1.2. Contact: [CONTACT EMAIL], or the feedback form in the app (Profile, then "Report a problem / idea").

## 2. What consumer health data we collect

"Consumer health data" means personal information that is linked or reasonably linkable to you and identifies your past, present or future physical or mental health status. In DaFit that is:

| Category | Examples |
|---|---|
| Questionnaire (the intake form) | Goals, health conditions, injuries, PAR-Q answers, and a flag that at least one PAR-Q answer is "yes" |
| Body measurements | Weight, girths |
| Progress photos | Photos of your body. Faces are blurred and location data removed on your device before upload |
| Body data used for nutrition | Sex, date of birth, height, activity level, goal, calculated calorie and macro targets |
| Food diary | Products, grams, calories, water; your trainer's comments on diary days |
| Sleep and activity | Sleep duration and quality, steps (also from an Apple Shortcuts import you set up) |
| Workouts | Workout logs: exercises, sets, repetitions, weights, times |
| Reports | Monthly progress reports you choose to send to your trainer |
| Inferences | Calculated targets and the PAR-Q flag, which DaFit derives from the data above |

2.1. We do **not** collect precise location, biometric data or genetic data. Face blurring runs only on your device; no face image, face geometry or template reaches us.

## 3. Where it comes from

3.1. From you, when you enter it in DaFit. Steps can also come from an Apple Shortcuts automation that you set up yourself with a personal token.

3.2. From your trainer, only their comments on your food diary days and notes they write about you.

## 4. Why we collect and use it

4.1. Only to provide the service you asked for:
- to store your entries and show them back to you, with charts and progress;
- to calculate your calorie and macro targets;
- to show the categories you choose to your trainer, so they can coach you;
- to send you reminders and notifications you have turned on;
- to produce your data export when you ask;
- to keep the service secure and to meet legal duties.

4.2. We do not use consumer health data for advertising, we do not sell it, and we do not use it to make decisions about you with legal or similar effects.

4.3. Our team does not read clients' health data. App statistics use only aggregated counts. Emergency access by an admin is exceptional, time-limited, needs a written reason, is logged and is notified to you ([Privacy Policy](privacy-policy.md), section 6.5).

## 5. Consent

5.1. **Collection.** Before you first enter consumer health data, we will ask for your consent in a separate screen that names the categories, the purpose, who may receive it and how to withdraw. We will collect it only after you agree.

> Team: not in the product yet, see product-changes. There is no separate health data consent screen; only beta-terms acceptance is recorded.

5.2. **Sharing with your trainer.** Sharing is a separate choice. For each trainer, on the screen "What your trainer sees", you decide which categories that trainer may see: nutrition, measurements, photos, steps, workouts and the questionnaire. The questionnaire is shown only after you answer "Show" on a dedicated screen with no preselected answer.

> Team: not in the product yet, see product-changes. Today nutrition, measurements, steps and workouts are visible to the trainer by default when a pair is created; only photos and the questionnaire start hidden.

5.3. **Withdrawal.** You can withdraw consent to collection by deleting the entries or your account, and consent to sharing by turning categories off in "What your trainer sees" or by ending the pair. The trainer stops seeing that data straight away.

5.4. Accepting our terms of service is not consent to collect or share consumer health data.

> Counsel: the current code does not yet meet 5.1 and 5.2. (1) There is no separate health data consent before collection; only beta-terms acceptance is recorded. (2) Nutrition, measurements, steps and workouts are shared with the trainer by default when a pair is created; MHMDA and Nevada require consent by a clear affirmative act, obtained before sharing, separate from the collection consent. Unless a lawyer concludes that sharing with a trainer the user chose is "necessary to provide a product or service that the consumer requested" (RCW 19.373.030(1)(b)(ii); NRS 603A.500(2)), the product must ask for each category with no preselection. Do not publish this policy until both changes ship, or rewrite 5.1 and 5.2 to describe the actual flow.

## 6. Who receives consumer health data

| Recipient | Why |
|---|---|
| Your trainer, for the categories you allow | To coach you. The trainer is responsible for how they use it |
| A trainer's assistants (including substitutes) | Only within what the trainer delegated; never money amounts |
| Supabase, Inc. (United States) | Our processor: database and file storage |
| Vercel Inc. (United States) | Our processor: hosting; data passes through its servers |
| Telegram (Telegram FZ-LLC, United Arab Emirates, and Telegram Messenger Inc.) | Delivers the bot messages you turned on. A reminder can mention, for example, a session or a homework task |
| Functional Software, Inc. (Sentry, United States), only if error reporting is on | Our processor: error reports, with user details, request bodies, cookies, headers and query strings removed |
| Authorities | Only when the law requires |

6.1. We have no affiliates that receive consumer health data. Open Food Facts receives only food search words and barcodes from our server, never data about you.

6.2. **Third-party tracking.** No third party tracks you over time across DaFit and other websites through DaFit. We use no advertising or analytics trackers. When your browser downloads the face-blurring model, jsDelivr and Google Cloud Storage see your IP address, as with any download; they receive no health data.

## 7. No sale

7.1. We do not sell consumer health data and do not offer it for sale. If that ever changed, we would first ask for a separate, signed authorization as RCW 19.373.070 requires, and we would never make the service conditional on it.

## 8. No geofencing

8.1. DaFit does not collect your device location and does not set up virtual boundaries (geofences) around health care facilities or any other place, so we do not track, message or advertise to anyone based on visits to such places.

## 9. Your rights

9.1. You have the right to:
- confirm whether we collect, share or sell your consumer health data, and access it, including a list of all third parties and affiliates with whom we shared or sold it, with an active email address or other online contact for each;
- withdraw consent to collection and to sharing;
- have your consumer health data deleted. We delete it from our systems and tell our processors and anyone we shared it with to delete it. Deleted data leaves our backups when they expire, within [BACKUP RETENTION].

9.2. We will not discriminate against you for using your rights.

## 10. How to use your rights

10.1. In the app:
- **Access and copy**: Settings, then Export. The bot sends you a link to an archive; it works for 7 days.
- **Withdraw sharing**: your trainer's card, then "What your trainer sees"; or end the pair.
- **Delete**: delete an entry, or Settings, then Delete account. Your account is deleted after a 30-day period in which you can cancel.

10.2. By message: write to [CONTACT EMAIL] with "Health data request" in the subject. We may ask you to confirm the request from your Telegram account. You do not need to create an account to make a request.

10.3. We answer within 45 days after we confirm the request. If we need more time, we can extend once by another 45 days and will tell you why within the first 45 days. Requests are free up to twice a year.

10.4. **Appeal.** If we refuse your request, you can appeal by writing to [CONTACT EMAIL] with "Appeal" in the subject within a reasonable time after our decision. We reply in writing within 45 days with what we did and why. If we deny the appeal, you can contact your state Attorney General:
- Washington: https://www.atg.wa.gov/file-complaint
- Nevada: https://ag.nv.gov/Complaints/File_Complaint/
- Connecticut: https://portal.ct.gov/ag/sections/privacy/the-connecticut-data-privacy-act

> Counsel: check the Attorney General links before publication.

## 11. Security

11.1. Access to consumer health data is limited to the people who need it, and the database itself enforces that each trainer sees only their own clients' allowed categories. Measures are listed in the [Privacy Policy](privacy-policy.md), section 12.

## 12. Changes

12.1. If we want to collect new categories of consumer health data, use it for new purposes or share it with new kinds of recipients, we will update this policy and ask for your consent before doing so.
