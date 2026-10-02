import { describe, expect, it } from "vitest";
import { calendarDateIn, daysBetween, parseIsoDate } from "../time/calendar";
import { ageOn, isAdult } from "./age";

describe("parseIsoDate", () => {
  it("rejects malformed and impossible dates", () => {
    expect(() => parseIsoDate("2027-2-1")).toThrow(RangeError);
    expect(() => parseIsoDate("2027-02-30")).toThrow(RangeError);
    expect(() => parseIsoDate("2026-02-29")).toThrow(RangeError);
    expect(parseIsoDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });
});

describe("ageOn", () => {
  it("counts a year only once the birthday is reached", () => {
    expect(ageOn("2008-10-02", "2026-10-01")).toBe(17);
    expect(ageOn("2008-10-02", "2026-10-02")).toBe(18);
  });

  it("makes people born on 29 February one year older on 1 March", () => {
    expect(ageOn("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageOn("2008-02-29", "2026-03-01")).toBe(18);
    expect(ageOn("2008-02-29", "2028-02-29")).toBe(20);
  });

  it("refuses anyone under 18", () => {
    expect(isAdult("2008-10-03", "2026-10-02")).toBe(false);
    expect(isAdult("2008-10-02", "2026-10-02")).toBe(true);
    expect(isAdult("2030-01-01", "2026-10-02")).toBe(false);
  });
});

describe("calendar helpers", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2027-03-01", "2027-02-01")).toBe(-28);
  });

  it("uses the campus time zone, not UTC", () => {
    const lateEvening = new Date("2026-10-02T22:30:00Z");
    expect(calendarDateIn("Europe/Paris", lateEvening)).toBe("2026-10-03");
    expect(calendarDateIn("UTC", lateEvening)).toBe("2026-10-02");
  });
});
