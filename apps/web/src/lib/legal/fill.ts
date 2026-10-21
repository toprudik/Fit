/** What the legal texts get filled with; a missing value leaves its placeholder as it is. */
export type LegalValues = {
  operatorName?: string;
  operatorAddress?: string;
  contactEmail?: string;
  /** Host of the web app, without the scheme: the texts write "https://[ДОМЕН]" and "[DOMAIN]/legal". */
  domain?: string;
  version: string;
};

/**
 * Puts the operator's details, the site and the text version into a document. They are not in the repository:
 * the name, address and mailbox come from the environment (lib/legal/load).
 */
export function fillPlaceholders(source: string, values: LegalValues): string {
  const replacements: [string[], string | undefined][] = [
    [["[ФИО ОПЕРАТОРА]", "[OPERATOR FULL NAME]"], values.operatorName],
    [["[АДРЕС]", "[ADDRESS]"], values.operatorAddress],
    [["[EMAIL ДЛЯ ОБРАЩЕНИЙ]", "[CONTACT EMAIL]"], values.contactEmail],
    [["[ДОМЕН]", "[DOMAIN]"], values.domain],
    [["[ВЕРСИЯ]"], values.version],
  ];
  let text = source;
  for (const [placeholders, value] of replacements) {
    if (!value) continue;
    for (const placeholder of placeholders) text = text.replaceAll(placeholder, value);
  }
  return text;
}

/** The host of an app URL ("https://dafit.app/" → "dafit.app"), or undefined when there is none. */
export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}
