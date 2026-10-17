import "server-only";
import type { ScheduleOwner } from "@/lib/schedule/load";

/** A charge of a booking the trainer can still forgive, with the pass it would return to (null for a debt). */
export type BookingCharge = { bookingId: string; chargeId: string; passTitle: string | null };

/**
 * The charges of these bookings that have no waiver yet (PRD 2.6.6-4): "Простить" on the session page, also opened
 * from the late-cancellation message. RLS limits the rows to the trainer's own pairs.
 */
export async function loadBookingCharges(owner: ScheduleOwner, bookingIds: string[]): Promise<BookingCharge[]> {
  if (bookingIds.length === 0) return [];
  const { supabase } = owner;
  const { data: charges, error } = await supabase
    .from("ledger_entries")
    .select("id, booking_id, pass_id")
    .in("booking_id", bookingIds)
    .eq("entry_type", "charge");
  if (error) throw new Error(`loading booking charges failed: ${error.code}`);
  if (charges.length === 0) return [];
  const chargeIds = charges.map((charge) => charge.id);
  const passIds = [...new Set(charges.map((charge) => charge.pass_id).filter((id): id is string => Boolean(id)))];
  const [waivers, passes] = await Promise.all([
    supabase.from("ledger_entries").select("related_entry_id").eq("entry_type", "waiver").in("related_entry_id", chargeIds),
    passIds.length ? supabase.from("passes").select("id, title").in("id", passIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (waivers.error) throw new Error(`loading waivers failed: ${waivers.error.code}`);
  const waived = new Set(waivers.data.map((row) => row.related_entry_id));
  const titles = new Map((passes.data ?? []).map((pass) => [pass.id, pass.title]));
  return charges
    .filter((charge) => charge.booking_id && !waived.has(charge.id))
    .map((charge) => ({
      bookingId: charge.booking_id as string,
      chargeId: charge.id,
      passTitle: charge.pass_id ? (titles.get(charge.pass_id) ?? null) : null,
    }));
}
