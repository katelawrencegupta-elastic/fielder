import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountsWithCalls,
  compareTodoTasks,
  catalogMeetingsByAccount,
  extractNotesSummary,
  groupHitsByDay,
  groupMeetingsByAccount,
  groupTasksByAccount,
  isMeetingOnDay,
  meetingAccountKey,
  meetingCallSummary,
  meetingListLabels,
  meetingTopic,
  meetingsForDay,
  meetingsInAgendaRange,
  recordedHitForCalendarEvent,
  todoTasks,
} from "./report/dailySummary.js";

const range = { startYmd: "2026-09-08", endYmd: "2026-09-08" };

const accounts = [
  { key: "ge_vernova", label: "GE Vernova" },
  { key: "ge_aerospace", label: "GE Aerospace" },
];

const hits = [
  {
    rel_path: "ge_vernova/GEVernova_Observability/2026-09-08T13-13-25.txt",
    account: "ge_vernova",
    poc: "GEVernova_Observability",
    started_at: "2026-09-08T13:13:25",
  },
  {
    rel_path: "ge_aerospace/GEAerospace_Observability/2026-09-08T12-00-37.txt",
    account: "ge_aerospace",
    started_at: "2026-09-08T12:00:37",
  },
  {
    rel_path: "ge_vernova/live-captions/2026-09-04T16-16-19.txt",
    account: "ge_vernova",
    started_at: "2026-09-04T16:16:19",
  },
  {
    rel_path: "mystery/call/2026-09-08T09-00-00.txt",
    started_at: "2026-09-08T09:00:00",
  },
];

describe("meetingAccountKey", () => {
  it("prefers the account field, else the first path segment", () => {
    assert.equal(meetingAccountKey(hits[0]), "ge_vernova");
    assert.equal(meetingAccountKey({ rel_path: "travelers/Demo/a.txt" }), "travelers");
    assert.equal(meetingAccountKey({}), "");
  });
});

describe("meetingsForDay", () => {
  it("keeps meetings on the selected local calendar day, earliest first", () => {
    const day = meetingsForDay(hits, range);
    assert.deepEqual(
      day.map((h) => h.started_at),
      ["2026-09-08T09:00:00", "2026-09-08T12:00:37", "2026-09-08T13:13:25"]
    );
    assert.equal(isMeetingOnDay(hits[2], range), false);
  });
});

describe("accountsWithCalls", () => {
  it("lists only folders that have meetings, and can filter by AE", () => {
    const withAe = [
      { key: "ge_vernova", label: "GE Vernova", ae: "Alex" },
      { key: "ge_aerospace", label: "GE Aerospace", ae: "Sam" },
      { key: "empty_co", label: "Empty Co", ae: "Alex" },
    ];
    const listed = accountsWithCalls(hits, withAe);
    assert.deepEqual(
      listed.map((g) => g.key),
      ["ge_vernova", "ge_aerospace", "mystery"]
    );
    assert.deepEqual(
      accountsWithCalls(hits, withAe, "Alex").map((g) => g.key),
      ["ge_vernova"]
    );
  });
});

describe("extractNotesSummary", () => {
  it("returns the Summary section and ignores transcript excerpts", () => {
    const notes = [
      "## Summary",
      "Covered architecture and next steps.",
      "",
      "## Follow-ups",
      "- Send the recap",
      "",
      "## Transcript excerpt",
      "raw caption text should not appear",
    ].join("\n");
    assert.equal(extractNotesSummary(notes), "Covered architecture and next steps.");
  });

  it("falls back to a snippet when notes have no summary", () => {
    assert.equal(
      meetingCallSummary({ snippet: "Indexed blurb." }, ""),
      "Indexed blurb."
    );
  });
});

describe("meetingTopic / meetingListLabels", () => {
  it("uses search topic and labels when present", () => {
    const hit = {
      topic: "Log attributes missing in CloudWatch",
      labels: ["CloudWatch", "ingest", "2 decisions", "1 follow-up"],
    };
    assert.equal(meetingTopic(hit), "Log attributes missing in CloudWatch");
    assert.deepEqual(meetingListLabels(hit), [
      "CloudWatch",
      "ingest",
      "2 decisions",
      "1 follow-up",
    ]);
  });

  it("falls back to the first snippet sentence", () => {
    assert.match(
      meetingTopic({
        snippet:
          "* The attendees are discussing an issue with log attributes not being found. * Next point.",
      }),
      /log attributes not being found/i
    );
  });
});

describe("catalogMeetingsByAccount", () => {
  it("groups every folder, newest account and newest meeting first", () => {
    const catalog = catalogMeetingsByAccount(hits, accounts);
    assert.deepEqual(
      catalog.map((g) => g.key),
      ["ge_vernova", "ge_aerospace", "mystery"]
    );
    assert.equal(catalog[0].meetings[0].started_at, "2026-09-08T13:13:25");
    assert.equal(catalog[0].meetings[1].started_at, "2026-09-04T16:16:19");
    assert.equal(catalog[2].account.label, "mystery");
  });

  it("renames curated meeting-folder keys for display", () => {
    const catalog = catalogMeetingsByAccount(
      [
        {
          account: "1-1-with-tim",
          rel_path: "1-1-with-tim/2026-09-21T15-29-27.txt",
          started_at: "2026-09-21T15:29:27",
        },
        {
          account: "corey-s-pod",
          rel_path: "corey-s-pod/2026-09-20T10-00-00.txt",
          started_at: "2026-09-20T10:00:00",
        },
        {
          account: "iko-1-1",
          rel_path: "iko-1-1/2026-09-10T16-38-48.txt",
          started_at: "2026-09-10T16:38:48",
        },
        {
          account: "pete-1-1",
          rel_path: "pete-1-1/2026-09-09T12-00-00.txt",
          started_at: "2026-09-09T12:00:00",
        },
      ],
      accounts
    );
    const byKey = Object.fromEntries(catalog.map((g) => [g.key, g.account.label]));
    assert.equal(byKey["1-1-with-tim"], "tim-1:1");
    assert.equal(byKey["corey-s-pod"], "corey-1:1");
    assert.equal(byKey["iko-1-1"], "Iko-1:1");
    assert.equal(byKey["pete-1-1"], "pete-1:1");
  });
});

describe("groupHitsByDay", () => {
  it("buckets newest days first with date labels", () => {
    const days = groupHitsByDay(hits.filter((h) => h.account === "ge_vernova"));
    assert.deepEqual(
      days.map((d) => d.ymd),
      ["2026-09-08", "2026-09-04"]
    );
    assert.match(days[0].label, /Sep/);
    assert.equal(days[0].meetings.length, 1);
  });

  it("orders every meeting newest to oldest across accounts", () => {
    const days = groupHitsByDay(hits);
    assert.deepEqual(
      days.flatMap((d) => d.meetings.map((h) => h.started_at)),
      [
        "2026-09-08T13:13:25",
        "2026-09-08T12:00:37",
        "2026-09-08T09:00:00",
        "2026-09-04T16:16:19",
      ]
    );
  });
});

describe("groupMeetingsByAccount", () => {
  it("groups aligned hits and leaves unknown accounts unaligned", () => {
    const day = meetingsForDay(hits, range);
    const { groups, unaligned } = groupMeetingsByAccount(day, accounts);
    assert.deepEqual(
      groups.map((g) => g.key),
      ["ge_aerospace", "ge_vernova"]
    );
    assert.equal(groups[0].meetings.length, 1);
    assert.equal(groups[1].meetings.length, 1);
    assert.equal(unaligned.length, 1);
    assert.equal(meetingAccountKey(unaligned[0]), "mystery");
  });
});

describe("meetingsInAgendaRange", () => {
  it("keeps meetings on any day in the agenda window", () => {
    const agenda = {
      startYmd: "2026-09-08",
      nextYmd: "2026-09-09",
      days: ["2026-09-08", "2026-09-09", "2026-09-10"],
    };
    const windowHits = [
      ...hits,
      {
        rel_path: "ge_vernova/x/2026-09-09T10-00-00.txt",
        account: "ge_vernova",
        started_at: "2026-09-09T10:00:00",
      },
      {
        rel_path: "ge_vernova/x/2026-09-10T10-00-00.txt",
        account: "ge_vernova",
        started_at: "2026-09-10T10:00:00",
      },
      {
        rel_path: "ge_vernova/x/2026-09-11T10-00-00.txt",
        account: "ge_vernova",
        started_at: "2026-09-11T10:00:00",
      },
    ];
    const found = meetingsInAgendaRange(windowHits, agenda);
    assert.deepEqual(
      found.map((h) => h.started_at).sort(),
      [
        "2026-09-08T09:00:00",
        "2026-09-08T12:00:37",
        "2026-09-08T13:13:25",
        "2026-09-09T10:00:00",
        "2026-09-10T10:00:00",
      ].sort()
    );
  });
});

describe("recordedHitForCalendarEvent", () => {
  it("picks the same-account recording closest to the calendar start", () => {
    const event = {
      account: "ge_vernova",
      start: "2026-09-08T13:10:00",
      startMs: Date.parse("2026-09-08T13:10:00"),
    };
    const hit = recordedHitForCalendarEvent(event, hits);
    assert.equal(hit.rel_path, "ge_vernova/GEVernova_Observability/2026-09-08T13-13-25.txt");
  });

  it("returns null when account or day does not match", () => {
    assert.equal(
      recordedHitForCalendarEvent({ account: "dtcc", start: "2026-09-08T13:10:00" }, hits),
      null
    );
    assert.equal(
      recordedHitForCalendarEvent(
        { account: "ge_vernova", start: "2026-09-01T13:10:00" },
        hits
      ),
      null
    );
  });
});

describe("todoTasks", () => {
  it("is the Kanban in_progress column", () => {
    const tasks = [
      { id: 1, title: "A", stage: "in_progress", dueDate: "2026-09-10" },
      { id: 2, title: "B", stage: "backlog", dueDate: "2026-09-01" },
      { id: 3, title: "C", stage: "in_progress", dueDate: "2026-09-02" },
    ];
    const todo = todoTasks(tasks).sort(compareTodoTasks);
    assert.deepEqual(
      todo.map((t) => t.id),
      [3, 1]
    );
  });
});

describe("groupTasksByAccount", () => {
  it("groups To Do cards under known accounts", () => {
    const tasks = [
      { id: 1, title: "Late", account: "ge_vernova", dueDate: "2026-09-01" },
      { id: 2, title: "Soon", account: "ge_aerospace", dueDate: "2026-09-09" },
      { id: 3, title: "Orphan", account: "unknown", dueDate: "2026-09-08" },
    ];
    const { groups, unaligned } = groupTasksByAccount(tasks, accounts);
    assert.deepEqual(
      groups.map((g) => g.key),
      ["ge_aerospace", "ge_vernova"]
    );
    assert.equal(unaligned[0].id, 3);
  });
});

describe("getAgendaRange", () => {
  it("covers the selected local day plus tomorrow (two calendar days)", async () => {
    const { getAgendaRange, splitAgendaDays, AGENDA_DAYS } = await import("./report/dailySummary.js");
    const range = getAgendaRange(new Date(2026, 8, 8, 18, 35, 0));
    assert.equal(AGENDA_DAYS, 2);
    assert.equal(range.startYmd, "2026-09-08");
    assert.equal(range.nextYmd, "2026-09-09");
    assert.equal(range.dayCount, 2);
    assert.deepEqual(range.days, ["2026-09-08", "2026-09-09"]);
    assert.equal(range.endMs - range.startMs, 2 * 24 * 60 * 60 * 1000);
    const { days, today, tomorrow } = splitAgendaDays(
      [
        { title: "Morning", start: "2026-09-08T14:00:00.000Z" },
        { title: "Next day", start: "2026-09-09T14:00:00.000Z" },
        { title: "Later", start: "2026-09-10T14:00:00.000Z" },
        { title: "Next week", start: "2026-09-15T14:00:00.000Z" },
      ],
      range
    );
    assert.deepEqual(
      today.map((e) => e.title),
      ["Morning"]
    );
    assert.deepEqual(
      tomorrow.map((e) => e.title),
      ["Next day"]
    );
    assert.equal(days.find((d) => d.ymd === "2026-09-10"), undefined);
    assert.equal(days.find((d) => d.ymd === "2026-09-15"), undefined);
  });
});
