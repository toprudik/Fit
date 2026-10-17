import type { Locale } from "@/i18n/config";
import { localParts } from "@/lib/schedule/time";

/**
 * CSV exports of «Аналитика» (PRD wave-2 §7 rule 10): UTF-8 with a BOM so Excel reads Cyrillic, ";" with a decimal
 * comma for Russian (what Excel expects in that locale) and "," with a decimal point for English, rows ending in
 * CRLF. Sums are in major units with their currency in a column of their own.
 */

export const EXPORT_KINDS = ["clients", "sessions", "payments", "passes"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function isExportKind(value: unknown): value is ExportKind {
  return EXPORT_KINDS.includes(value as ExportKind);
}

export type Cell = string | number | null | undefined;

export function csvSeparator(locale: Locale): string {
  return locale === "ru" ? ";" : ",";
}

function escape(cell: Cell, separator: string): string {
  const text = cell === null || cell === undefined ? "" : String(cell);
  return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][], locale: Locale): string {
  const separator = csvSeparator(locale);
  const lines = [header, ...rows].map((row) => row.map((cell) => escape(cell, separator)).join(separator));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Minor units as major units with two decimals: "10000,50" in Russian, "10000.50" in English. */
export function majorUnits(minor: number, locale: Locale): string {
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  const text = `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
  return locale === "ru" ? text.replace(".", ",") : text;
}

/** An instant as ISO 8601 in the trainer's zone, with its offset: "2026-10-31T23:30:00+03:00". */
export function isoInZone(instant: string | Date, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const { day, minutes } = localParts(date, timeZone);
  const seconds = date.getUTCSeconds();
  const offset = Math.round((Date.parse(`${day}T00:00:00Z`) + minutes * 60_000 + seconds * 1000 - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  const sign = offset < 0 ? "-" : "+";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:${pad(seconds)}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

/** "dafit-payments-2026-10-01-2026-10-31.csv": the period's last day is inclusive in the name. */
export function exportFileName(kind: ExportKind, from: string, lastDay: string): string {
  return `dafit-${kind}-${from}-${lastDay}.csv`;
}
