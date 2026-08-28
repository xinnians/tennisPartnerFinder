import { TAIPEI_TIME_ZONE } from "./config.ts";

type DateInput = Date | number | string | null | undefined;

interface TaipeiDateTimeLocalOptions {
  includeMilliseconds?: boolean;
  includeSeconds?: boolean;
}

export const TAIPEI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

const padTwo = (value: unknown) => String(value).padStart(2, "0");

export function validDate(value: DateInput) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function taipeiParts(value: DateInput) {
  const date = validDate(value);
  if (!date) return null;
  const taipei = new Date(date.getTime() + TAIPEI_UTC_OFFSET_MS);
  return {
    year: taipei.getUTCFullYear(),
    month: taipei.getUTCMonth() + 1,
    day: taipei.getUTCDate(),
    hour: taipei.getUTCHours(),
    minute: taipei.getUTCMinutes(),
    second: taipei.getUTCSeconds(),
    millisecond: taipei.getUTCMilliseconds(),
    weekday: taipei.getUTCDay(),
  };
}

export function taipeiClock(value: DateInput) {
  const parts = taipeiParts(value);
  return parts ? `${padTwo(parts.hour)}:${padTwo(parts.minute)}` : "";
}

export function taipeiHourRange(startAt: DateInput, rangeEnd: DateInput) {
  const start = taipeiParts(startAt);
  if (!start) return "";
  const end = taipeiParts(rangeEnd);
  return end ? `${start.hour}–${end.hour}` : taipeiClock(startAt);
}

export function taipeiDateKey(value: DateInput) {
  const parts = taipeiParts(value);
  return parts ? `${parts.year}-${padTwo(parts.month)}-${padTwo(parts.day)}` : null;
}

export function isTaipeiWeekend(value: DateInput) {
  const weekday = taipeiParts(value)?.weekday;
  return weekday === 0 || weekday === 6;
}

export function taipeiDateTime(value: DateInput) {
  const date = validDate(value);
  if (!date) return "時間待確認";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIPEI_TIME_ZONE,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function taipeiLocalDateTimeToIso(value: unknown) {
  const match = String((value as string | null | undefined) ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
  );
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0", millisecondText = "0"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText.padEnd(3, "0"));
  const localUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const local = new Date(localUtcMs);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second ||
    local.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }
  return new Date(localUtcMs - TAIPEI_UTC_OFFSET_MS).toISOString();
}

export function taipeiDateTimeLocalValue(
  value: DateInput = new Date(),
  { includeMilliseconds = false, includeSeconds = false }: TaipeiDateTimeLocalOptions = {}
) {
  const parts = taipeiParts(value);
  if (!parts) return "";
  const minuteValue = `${parts.year}-${padTwo(parts.month)}-${padTwo(parts.day)}T${padTwo(parts.hour)}:${padTwo(parts.minute)}`;
  const secondValue = `${minuteValue}:${padTwo(parts.second)}`;
  return includeMilliseconds
    ? `${secondValue}.${String(parts.millisecond).padStart(3, "0")}`
    : includeSeconds
      ? secondValue
      : minuteValue;
}
