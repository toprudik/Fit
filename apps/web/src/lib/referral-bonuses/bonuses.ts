/**
 * Trainer referral bonuses in the beta (marketing backlog 7, decisions Q50 as changed 20.10.2026): a month of Pro
 * for a colleague active four weeks in a row, given by an admin to start after the beta. The database decides what
 * is due (admin_trainer_referral_bonuses); this only sorts the list.
 */

/** Weeks in a row with 3 or more held sessions that make a bonus due (private.trainer_active_weeks). */
export const ACTIVE_WEEKS_NEEDED = 4;

/** The first day after the beta, which runs 24.11.2026–31.01.2027 (marketing plan): the month's default start. */
export const BONUS_DEFAULT_START = "2027-02-01";

export type ReferralBonusRow = {
  bonus_id: string;
  bonus_status: "pending" | "granted" | "void";
  referral_status: "pending" | "qualified" | "void";
  due: boolean;
};

export type ReferralBonusGroups<T extends ReferralBonusRow> = { due: T[]; waiting: T[]; granted: T[] };

/** Due ones first, then the rest still pending, then the given ones; void bonuses are left out. */
export function groupReferralBonuses<T extends ReferralBonusRow>(rows: readonly T[]): ReferralBonusGroups<T> {
  const groups: ReferralBonusGroups<T> = { due: [], waiting: [], granted: [] };
  for (const row of rows) {
    if (row.bonus_status === "granted") groups.granted.push(row);
    else if (row.bonus_status === "pending") (row.due ? groups.due : groups.waiting).push(row);
  }
  return groups;
}
