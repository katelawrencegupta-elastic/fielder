const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseIcs, parseDateValue, extractMeetUrl } = require("../services/ics");
const { matchAccount, eventsFromCalendarJson, assertCalendarRange, MAX_CALENDAR_RANGE_MS } = require("../services/calendar");

const accounts = [
  { key: "ge_vernova", label: "GE Vernova", long: "GE Vernova" },
  { key: "ge_aerospace", label: "GE Aerospace", long: "GE Aerospace" },
  { key: "dtcc", label: "DTCC", long: "DTCC" },
];

describe("parseIcs", () => {
  it("reads timed events and all-day events in the window", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:1
SUMMARY:GE Vernova standup
DTSTART:20260908T140000Z
DTEND:20260908T143000Z
LOCATION:https://meet.google.com/abc-defg-hij
END:VEVENT
BEGIN:VEVENT
UID:2
SUMMARY:Focus day
DTSTART;VALUE=DATE:20260909
DTEND;VALUE=DATE:20260910
END:VEVENT
BEGIN:VEVENT
UID:3
SUMMARY:Last week
DTSTART:20260901T140000Z
DTEND:20260901T150000Z
END:VEVENT
END:VCALENDAR
`;
    const from = Date.parse("2026-09-08T00:00:00-04:00");
    const to = Date.parse("2026-09-10T00:00:00-04:00");
    const events = parseIcs(ics, from, to);
    assert.deepEqual(
      events.map((e) => e.title),
      ["GE Vernova standup", "Focus day"]
    );
    assert.equal(events[0].meetUrl, "https://meet.google.com/abc-defg-hij");
    assert.equal(events[1].allDay, true);
  });

  it("expands a weekly RRULE into the window and skips cancelled", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:weekly
SUMMARY:Weekly AE sync
DTSTART:20260907T150000Z
DTEND:20260907T153000Z
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
END:VEVENT
BEGIN:VEVENT
UID:nope
SUMMARY:Cancelled
STATUS:CANCELLED
DTSTART:20260908T180000Z
DTEND:20260908T190000Z
END:VEVENT
END:VCALENDAR
`;
    const from = Date.parse("2026-09-08T00:00:00Z");
    const to = Date.parse("2026-09-10T00:00:00Z");
    const events = parseIcs(ics, from, to);
    assert.ok(events.length >= 2);
    assert.ok(events.every((e) => e.title === "Weekly AE sync"));
    assert.ok(events.every((e) => e.startMs >= from && e.startMs < to));
  });
});

describe("parseDateValue", () => {
  it("honors TZID wall time", () => {
    const { ms } = parseDateValue("20260908T090000", { TZID: "America/New_York" });
    assert.equal(new Date(ms).toISOString(), "2026-09-08T13:00:00.000Z");
  });
});

describe("matchAccount", () => {
  it("picks the longest account name present in the event text", () => {
    assert.equal(matchAccount("GE Aerospace observability review", accounts), "ge_aerospace");
    assert.equal(matchAccount("ge_vernova weekly", accounts), "ge_vernova");
    assert.equal(matchAccount("Lunch", accounts), "");
  });
});

describe("eventsFromCalendarJson", () => {
  it("maps fieldwork calendar.json rows and filters by window", () => {
    const rows = [
      {
        id: "a",
        title: "GE Vernova / Elastic - EC2 walkthrough",
        account: "ge vernova",
        start: "2026-09-17T06:30:00-04:00",
        end: "2026-09-17T07:15:00-04:00",
        joinLink: "https://elastic.zoom.us/j/1",
        calLink: "https://www.google.com/calendar/event?eid=abc",
      },
      {
        id: "b",
        title: "Next week",
        account: "dtcc",
        start: "2026-09-24T09:00:00-04:00",
        end: "2026-09-24T09:30:00-04:00",
        joinLink: "",
        calLink: "",
      },
    ];
    const from = Date.parse("2026-09-17T00:00:00-04:00");
    const to = Date.parse("2026-09-18T00:00:00-04:00");
    const events = eventsFromCalendarJson(rows, from, to);
    assert.equal(events.length, 1);
    assert.equal(events[0].id, "a");
    assert.equal(events[0].meetUrl, "https://elastic.zoom.us/j/1");
    assert.match(events[0].url, /google\.com\/calendar/);
    assert.equal(events[0].accountHint, "ge vernova");
  });
});

describe("extractMeetUrl", () => {
  it("finds a Zoom or Meet link", () => {
    assert.match(extractMeetUrl("join https://elastic.zoom.us/j/123?pwd=x now"), /zoom\.us/);
  });
});

const { parseSparkEventsOutput, ymdLocal, loadSparkEvents } = require("../services/sparkCalendar");

describe("parseSparkEventsOutput", () => {
  it("parses key/value event blocks", () => {
    const text = `
ID: ABC-123
Title: GE Vernova POC Tech Check-in
Start: 2026-09-18T08:30:00-04:00
End: 2026-09-18T09:00:00-04:00
Location: https://elastic.zoom.us/j/95511000467
Calendar: kate@elastic.co

ID: DEF-456
Title: Lunch
Start: 2026-09-18T12:00:00-04:00
End: 2026-09-18T12:30:00-04:00
`;
    const events = parseSparkEventsOutput(text);
    assert.equal(events.length, 2);
    assert.equal(events[0].id, "ABC-123");
    assert.equal(events[0].title, "GE Vernova POC Tech Check-in");
    assert.match(events[0].meetUrl, /zoom\.us/);
    assert.equal(events[1].title, "Lunch");
  });

  it("parses a JSON array of events", () => {
    const text = JSON.stringify([
      {
        id: "1",
        title: "DTCC Bi-Weekly",
        start: "2026-09-18T09:00:00-04:00",
        end: "2026-09-18T09:30:00-04:00",
        conference: "https://elastic.zoom.us/j/1",
      },
    ]);
    const events = parseSparkEventsOutput(text);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "DTCC Bi-Weekly");
    assert.match(events[0].meetUrl, /zoom\.us/);
  });

  it("parses a simple table", () => {
    const text = `ID	Start	End	Title
abc	2026-09-18T10:00:00-04:00	2026-09-18T10:30:00-04:00	Sizing Sync
`;
    const events = parseSparkEventsOutput(text);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Sizing Sync");
    assert.equal(ymdLocal(events[0].startMs), "2026-09-18");
  });

  it("parses Spark Desktop prose listing", () => {
    const text = `
Calendar Events (2026-09-21 00:00 – 2026-09-22 00:00)

── Monday, Sep 21, 2026 ────────────────────────────────────────

  Home
  ID: RDCALAPI.BASECLIENT.3:14677
  All day
  Calendar: kate@elastic.co

  02122427 - Travelers Migration
  ID: RDCALAPI.BASECLIENT.0:13150
  09:45 – 10:30
  Calendar: kate@elastic.co
  Meeting: https://meet.google.com/isu-pdfq-etg
  Notes:
    Reschedule note

  Kate / Tim - Weekly 1:1
  ID: RDCALAPI.BASECLIENT.3:9976
  15:30 – 16:00
  Calendar: kate@elastic.co
  Meeting: https://elastic.zoom.us/j/98260766604

8 event(s)
`;
    const events = parseSparkEventsOutput(text);
    assert.equal(events.length, 3);
    assert.equal(events[0].title, "Home");
    assert.equal(events[0].allDay, true);
    assert.equal(events[1].title, "02122427 - Travelers Migration");
    assert.equal(ymdLocal(events[1].startMs), "2026-09-21");
    assert.match(events[1].meetUrl, /meet\.google\.com/);
    assert.equal(events[2].title, "Kate / Tim - Weekly 1:1");
    const start = new Date(events[2].startMs);
    assert.equal(start.getHours(), 15);
    assert.equal(start.getMinutes(), 30);
  });
});

describe("loadSparkEvents", () => {
  it("reports unavailable when the spark binary is missing", async () => {
    const { EventEmitter } = require("events");
    function spawnFn() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        const err = new Error("spawn spark ENOENT");
        err.code = "ENOENT";
        child.emit("error", err);
      });
      return child;
    }
    const result = await loadSparkEvents(
      Date.parse("2026-09-18T00:00:00-04:00"),
      Date.parse("2026-09-19T00:00:00-04:00"),
      { spawnFn, bin: "spark-missing-for-test" }
    );
    assert.equal(result.available, false);
    assert.equal(result.events.length, 0);
  });

  it("parses successful spark stdout", async () => {
    const { EventEmitter } = require("events");
    function spawnFn(_bin, args) {
      assert.ok(args.includes("--start"));
      assert.ok(args.includes("--end"));
      // Spark --end is exclusive; [Sep 18, Sep 19) → --end 2026-09-19
      assert.equal(args[args.indexOf("--start") + 1], "2026-09-18");
      assert.equal(args[args.indexOf("--end") + 1], "2026-09-19");
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.stdout.emit(
          "data",
          Buffer.from(`Title: Live from Spark
Start: 2026-09-18T08:30:00-04:00
End: 2026-09-18T09:00:00-04:00
`)
        );
        child.emit("close", 0);
      });
      return child;
    }
    const result = await loadSparkEvents(
      Date.parse("2026-09-18T00:00:00-04:00"),
      Date.parse("2026-09-19T00:00:00-04:00"),
      { spawnFn, bin: "spark" }
    );
    assert.equal(result.available, true);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].title, "Live from Spark");
  });

  it("kills a hung spark process after timeout", async () => {
    const { EventEmitter } = require("events");
    let killed = null;
    function spawnFn() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = (sig) => {
        killed = sig;
        process.nextTick(() => child.emit("close", null, sig));
      };
      return child;
    }
    const result = await loadSparkEvents(
      Date.parse("2026-09-18T00:00:00-04:00"),
      Date.parse("2026-09-19T00:00:00-04:00"),
      { spawnFn, bin: "spark", timeoutMs: 40 }
    );
    assert.equal(killed, "SIGKILL");
    assert.equal(result.available, false);
    assert.match(result.error, /timed out/i);
  });
});

describe("assertCalendarRange", () => {
  it("rejects inverted or missing windows", () => {
    assert.throws(() => assertCalendarRange(NaN, 1), (err) => err.code === "BAD_RANGE");
    assert.throws(() => assertCalendarRange(5, 5), (err) => err.code === "BAD_RANGE");
  });

  it("rejects windows larger than 90 days", () => {
    const from = Date.parse("2026-01-01T00:00:00Z");
    assert.throws(
      () => assertCalendarRange(from, from + MAX_CALENDAR_RANGE_MS + 1),
      (err) => err.code === "RANGE_TOO_LARGE"
    );
    assert.doesNotThrow(() => assertCalendarRange(from, from + MAX_CALENDAR_RANGE_MS));
  });
});
