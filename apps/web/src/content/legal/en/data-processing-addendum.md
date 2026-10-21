# DaFit Data Processing Addendum for Trainers

> **Draft of 18 October 2026. Do not publish without review by a qualified lawyer in each target jurisdiction.** Prepared from the DaFit codebase and laws in force in October 2026. Points for the lawyer are marked "Counsel:".

Effective date: [EFFECTIVE DATE]

This Data Processing Addendum ("DPA") forms part of the agreement between [OPERATOR FULL NAME], an individual, at [ADDRESS] ("DaFit", "we", "us") and each trainer who uses the Service ("Trainer", "you") under the [Terms of Service](terms-of-service.md). It applies from the moment you add data covered by section 2.

> Team: trainers accept this addendum in the app (#188, consent kind `trainer_dpa`) before their first client card without an account and their first note. It is not re-asked when the text changes.

> Counsel: add an unticked checkbox "I accept the Data Processing Addendum" to trainer onboarding (before the first client card or note) and record the version in `consents`. GDPR Art. 28(9) allows electronic form.

## 1. Definitions

1.1. Terms such as "personal data", "processing", "controller", "processor", "data subject", "personal data breach" and "supervisory authority" have the meaning given in the EU General Data Protection Regulation 2016/679 ("GDPR") and the UK GDPR. "Data Protection Law" means every data protection law that applies to the processing, including the GDPR, the UK GDPR and the Data Protection Act 2018, the Swiss FADP, and US state privacy laws such as the CCPA and the Washington My Health My Data Act.

1.2. **Client**, **Pair**, **Pass**, **Assistant** (in some screens, a delegate) and **"What your trainer sees"** have the meaning given in the [Terms of Service](terms-of-service.md), section 2. In this DPA a client is a person the Trainer coaches, whether or not they have a DaFit account.

## 2. Scope and roles

2.1. You are the controller and DaFit is your processor for the following data ("Trainer Data"):
- **client cards** you keep for people who have no DaFit account: name, an optional contact as free text, notes, sessions and payments;
- **your notes** about clients, and your comments on clients' food diary days;
- **your records** of sessions, bookings, cancellations, waitlists, check-ins, passes, the pass ledger, payments, debts and assistants' shares, for all your clients.

2.2. This DPA does **not** cover:
- your own account data, which DaFit controls under the [Privacy Policy](privacy-policy.md);
- data that a client with a DaFit account enters about themselves. DaFit controls it. When the client allows you to see a category in "What your trainer sees", you receive it as a separate controller, for coaching that client.

2.3. Your duties as a controller for data you receive from a client's sharing are set out in section 13.

> Counsel: the client-shared data path is controller-to-controller, not processing. The [Terms of Service](terms-of-service.md), section 7.7, already limits use to coaching and bans onward disclosure; consider adding deletion of copies made outside DaFit when sharing ends.

## 3. Details of the processing (GDPR Art. 28(3))

| Item | Description |
|---|---|
| Subject matter | Hosting and organising the Trainer's client records in DaFit |
| Duration | For as long as the Trainer uses DaFit, then until deletion under section 11 |
| Nature | Storage, organisation, retrieval, display, export, deletion; sending notifications the Trainer or client triggers through the Telegram bot |
| Purpose | Letting the Trainer run their coaching business: schedule, passes, payments, notes |
| Data subjects | The Trainer's clients, with or without a DaFit account; the Trainer's assistants |
| Categories of data | Name, contact text, notes, session and booking records, cancellation reasons, pass and payment records (amount, currency, method). No card or bank details. DaFit does not receive or move money |
| Special categories | Only if the Trainer writes them into notes or client cards (for example an injury). DaFit treats all notes as possibly containing health data |

## 4. DaFit's obligations

4.1. **Instructions.** We process Trainer Data only on your documented instructions. This DPA, your use of DaFit's features and your settings are your instructions. If the law requires us to process Trainer Data otherwise, we will tell you first unless the law forbids it. We will tell you if we think an instruction breaks Data Protection Law.

4.2. **Confidentiality.** Everyone at DaFit who can access Trainer Data is bound by confidentiality. DaFit admins do not browse Trainer Data. Emergency access is exceptional, time-limited, needs a written reason and is recorded in the audit log.

4.3. **Security.** We apply the measures in Annex 2 (GDPR Art. 32).

4.4. **Subprocessors.** Section 6.

4.5. **Help with requests from data subjects.** We give you tools in the app to find, correct, export and delete Trainer Data. If a data subject contacts us about Trainer Data, we pass the request to you without undue delay and do not answer it ourselves unless you ask us to. We help you answer within your deadline.

4.6. **Help with compliance.** We help you, taking into account the nature of the processing and the information we have, with security, breach notification, data protection impact assessments and prior consultation (GDPR Arts. 32 to 36).

4.7. **Records.** We keep a record of processing activities carried out for controllers (GDPR Art. 30(2)).

## 5. Personal data breaches

5.1. We notify you without undue delay after becoming aware of a personal data breach affecting Trainer Data, and we aim to do so within 48 hours. We notify you through the bot and in the app. DaFit has no email channel.

5.2. The notice describes, as far as we know at the time: what happened, the categories and approximate number of data subjects and records, the likely consequences, and the measures taken or proposed. We send further information as we learn it.

5.3. You decide whether to notify the supervisory authority and data subjects. We will not notify your clients about Trainer Data on your behalf unless you ask us or the law requires it.

## 6. Subprocessors

6.1. You give general authorisation for DaFit to use subprocessors. The current subprocessors are:

| Subprocessor | Service | Location | Transfer safeguard |
|---|---|---|---|
| Supabase, Inc. | Database, sign-in, file storage | United States (us-east-1) | EU SCCs (2021/914) in Supabase's DPA; UK Addendum [to confirm] |
| Vercel Inc. | Hosting of the web app and the bot | United States | EU-U.S. Data Privacy Framework (with UK Extension and Swiss framework); EU SCCs and UK Addendum in Vercel's DPA |
| GitHub, Inc. | Encrypted nightly database backups, kept 7 days | United States | EU-U.S. Data Privacy Framework; EU SCCs in GitHub's Data Protection Agreement [to confirm] |
| Functional Software, Inc. (Sentry), only if error reporting is on | Error reports, with user details, request bodies, cookies, headers and query strings removed | United States | [to confirm] |

6.2. Telegram (Telegram FZ-LLC, United Arab Emirates, and Telegram Messenger Inc.) delivers bot messages and is an independent controller for its platform, not our subprocessor. Open Food Facts (France) receives only food search words and barcodes from our server; it receives no Trainer Data.

6.3. We impose on each subprocessor data protection terms that protect Trainer Data at least as well as this DPA. We remain responsible to you for our subprocessors.

6.4. We will tell you at least 30 days before adding or replacing a subprocessor, through the bot and on [DOMAIN]/legal/subprocessors. You can object on reasonable data protection grounds within that period. If we cannot resolve the objection, you can stop using DaFit for Trainer Data and delete it; this is your sole remedy for the objection.

> Team: not in the product yet, see product-changes. There is no subprocessors page and no notice mechanism for subprocessor changes.

> Counsel: for urgent replacements needed for security or continuity, consider a shorter notice period.

## 7. International transfers

7.1. Trainer Data is stored in the United States. Where Trainer Data subject to the GDPR is transferred to DaFit or our subprocessors in a country without an adequacy decision, the parties agree to the EU Standard Contractual Clauses (Commission Implementing Decision (EU) 2021/914), incorporated by reference:
- **Module 2** (controller to processor), where the Trainer is the exporter and DaFit the importer; **Module 3** (processor to processor) for DaFit's transfers to subprocessors;
- Clause 7 (docking clause) applies; Clause 9 option 2 (general authorisation, notice period as in section 6.4); Clause 11 optional language does not apply; Clause 13: the supervisory authority of the Trainer's EU member state, or of the member state of the EU representative [EU REPRESENTATIVE]; Clauses 17 and 18: the law and courts of [EU MEMBER STATE];
- Annex I is section 3 of this DPA and the parties' details; Annex II is Annex 2 of this DPA; Annex III is section 6.1.

7.2. For transfers subject to the UK GDPR, the International Data Transfer Addendum to the EU SCCs issued by the UK Information Commissioner (version B1.0, in force 21 March 2022, as amended) applies, with Table 1 completed with the parties' details, Table 2 selecting the modules above, Table 3 referring to this DPA, and Table 4 allowing either party to end it as Section 19 provides. For Swiss data, the SCCs apply with the adaptations required by the FDPIC.

7.3. Where a recipient is certified under the EU-U.S. Data Privacy Framework (or its UK Extension or the Swiss-U.S. framework), the parties may rely on that certification instead, for as long as the adequacy decision stays in force.

> Counsel: (1) if DaFit itself is outside the EEA, a Trainer in the EEA who uses DaFit makes a transfer, so the SCCs above are needed between Trainer and DaFit. If DaFit's operator is established in the EEA, Module 2 is not needed between the parties. (2) Confirm governing law and court for the SCCs. (3) Confirm whether Supabase's DPA includes the UK Addendum.

## 8. Audits

8.1. On request, we give you the information needed to show compliance with this DPA, including our subprocessors' current security reports (such as SOC 2 Type 2, under their confidentiality terms).

8.2. If that information is not enough, or a supervisory authority requires it, you may audit us, or have an independent auditor bound by confidentiality do so, once a year with at least 30 days' notice, during business hours and without access to other customers' data. Each party bears its own costs unless the audit finds a material breach by DaFit.

## 9. US state law terms (service provider and processor)

9.1. Where the California Consumer Privacy Act as amended by the CPRA ("CCPA") applies, DaFit is your service provider. We:
- process Trainer Data only for the business purposes in section 3;
- do not sell or share Trainer Data, as those terms are defined in the CCPA;
- do not retain, use or disclose Trainer Data outside our direct business relationship with you or for any purpose other than those in this DPA;
- do not combine Trainer Data with personal information we receive from other sources, except as the CCPA permits;
- comply with the CCPA and give the same level of privacy protection it requires;
- let you take reasonable steps to stop and remediate unauthorised use;
- tell you if we can no longer meet our obligations under the CCPA.

9.2. Where the Washington My Health My Data Act, Nevada's consumer health data law or another state privacy law applies, DaFit acts as your processor, processes Trainer Data only under this DPA, and helps you meet your obligations, including deletion requests.

## 10. Liability

10.1. Each party's liability under this DPA is subject to the limitations and exclusions in the [Terms of Service](terms-of-service.md), section 20, except where Data Protection Law does not allow liability towards data subjects to be limited.

## 11. Deletion and return

11.1. You can export your records at any time (Settings, then Export, and the trainer exports of clients and passes as CSV) and delete them in the app.

11.2. When you delete your trainer account, after the 30-day period in which you can cancel, we delete your trainer profile together with your pairs, client cards, passes and notes. Deleted data leaves our backups when they expire, within 7 days.

11.3. We keep Trainer Data after that only where the law requires us to, and then only for that purpose.

11.4. When a client with a DaFit account deletes their account, your records about that client (sessions, bookings, passes, ledger, payments) stay with you for your accounting, linked to "Deleted client" with no name and no contact.

## 12. Term

12.1. This DPA lasts as long as DaFit processes Trainer Data. Sections 5, 10 and 11 survive its end.

## 13. Your duties as controller

13.1. You are responsible for:
- having a lawful basis for the data you put into DaFit, and, for health data in notes or client cards, a valid condition such as explicit consent (GDPR Art. 9(2)(a));
- telling your clients, including those without a DaFit account, that you keep their data in DaFit, what for, for how long, and how to reach you (GDPR Arts. 13 and 14). You can link them to the [Privacy Policy](privacy-policy.md) for how DaFit works;
- answering your clients' requests about data you control, with the tools DaFit provides;
- using data that clients share with you only to coach them, keeping it confidential, and not copying it out of DaFit more than you need;
- not putting into DaFit data you have no right to hold, such as identity documents or medical records of clients;
- keeping your Telegram account secure and choosing assistants carefully. Assistants see what you allow them, never amounts of money;
- complying with health, consumer and tax laws that apply to your services. DaFit is not a party to your agreements with clients.

13.2. If you are a business subject to the GDPR outside the EU or UK, you may also need your own EU or UK representative. DaFit cannot act as your representative.

## Annex 1. Parties

| | Controller (Trainer) | Processor (DaFit) |
|---|---|---|
| Name | As in the Trainer's DaFit account | [OPERATOR FULL NAME] (an individual) |
| Address | As provided by the Trainer | [ADDRESS] |
| Contact | The Trainer's Telegram account | [CONTACT EMAIL] |
| Signature | Electronic acceptance in the app, with date and version | Electronic, by publication |

## Annex 2. Technical and organisational measures

**Access control**
- Sign-in only through Telegram, verified on the server (Mini App init data signature, or Telegram OpenID Connect on the web). No passwords are stored. Client-sent user identifiers are never trusted.
- Row-level security on every exposed database table: each trainer reaches only their own pairs, client cards and records; assistants reach only what the delegation allows; amounts of money are hidden from assistants. Each privacy rule has an automated isolation test.
- Some columns are hidden by database grants, so they cannot be read even through permitted rows.
- Admin access is limited to aggregates. Emergency access is time-limited, needs a reason, is logged in an append-only audit log, and the user is notified.
- Blocked users lose their session at the next page load.

**Data protection**
- Encryption in transit (HTTPS/TLS) and at rest (AES-256 at our subprocessors).
- Progress photos: faces blurred and EXIF/location removed on the user's device before upload; delivered through links valid for 300 seconds.
- Private storage buckets for photos, certificates and feedback screenshots.
- Calendar feed and step import tokens stored only as SHA-256 hashes; they can be reissued.
- The pass ledger is append-only, which protects the integrity of payment records.

**Secrets and environments**
- Secrets live only on the server and are validated at start-up; error messages name the variable, never its value. Separate keys for local, preview and production.
- Error reporting, if enabled, strips user details, request bodies, cookies, headers and query strings.

**Development and operations**
- Database changes only through reviewed migrations with automated tests; database lint and security advisors run in CI.
- Code review and automated tests before release.
- Subprocessors publish their own security attestations, such as SOC 2 Type 2 reports [to confirm per subprocessor, including whether each holds ISO 27001].

**Availability and recovery**
- Nightly database backups, encrypted with AES-256 before they leave the backup job and kept for 7 days with GitHub; each run restores the copy into an empty database and checks it. Files in storage are not in the backups. Hosting by Vercel.

**Incident response**
- A documented procedure to assess and contain incidents, and to notify controllers within the target in section 5.1.

> Counsel: the incident response procedure and a record of processing (Art. 30) are not yet written down; see the owner's to-do list.
