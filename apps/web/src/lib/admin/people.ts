/** The name fields every profile has; any of them may be empty. */
export type PersonName = { first_name: string | null; last_name: string | null; username: string | null };

/** "Имя Фамилия", else "@username", else the fallback (a deleted account, a profile without a name). */
export function personName(person: PersonName | null | undefined, fallback: string): string {
  if (!person) return fallback;
  const fullName = [person.first_name, person.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
  return fullName || (person.username ? `@${person.username}` : fallback);
}
