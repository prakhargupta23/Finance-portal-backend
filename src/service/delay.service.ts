type DelayInputItem = {
  designation?: string | null;
  department?: string | null;
  sequenceNo?: number | null;
  actionDate?: string | null;
  actionTime?: string | null;
  date?: string | null;
  time?: string | null;
};

function parseDateTime(dateValue?: string | null, timeValue?: string | null): Date | null {
  const dateRaw = String(dateValue || "").trim();
  if (!dateRaw) return null;

  const timeRaw = String(timeValue || "").trim();
  const normalizedTime = normalizeTime(timeRaw) || "00:00:00";
  const parts = normalizedTime.split(":");
  const hh = Number(parts[0] || 0);
  const mm = Number(parts[1] || 0);
  const ss = Number(parts[2] || 0);

  const dmy = dateRaw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const dt = new Date(Date.UTC(year, month - 1, day, hh, mm, ss));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const ymd = dateRaw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    const dt = new Date(Date.UTC(year, month - 1, day, hh, mm, ss));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function normalizeTime(timeValue?: string | null): string | null {
  const raw = String(timeValue || "").trim();
  if (!raw || raw.toLowerCase() === "n/a") return null;

  const isoTime = raw.match(/T(\d{2}:\d{2}:\d{2})/);
  if (isoTime?.[1]) {
    return isoTime[1];
  }

  const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = ampm[2];
    const second = ampm[3] || "00";
    const marker = ampm[4].toUpperCase();
    if (marker === "PM" && hour < 12) hour += 12;
    if (marker === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}:${second}`;
  }

  const hms = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hms) {
    const hour = String(parseInt(hms[1], 10)).padStart(2, "0");
    const minute = hms[2];
    const second = hms[3] || "00";
    return `${hour}:${minute}:${second}`;
  }

  return null;
}

function normalizeDesignation(designation?: string | null): string {
  const base = String(designation || "").split("/")[0];
  return base
    .toUpperCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function extractDepartment(item: DelayInputItem): string {
  const depFromField = String(item.department || "").trim().toUpperCase();
  if (depFromField) return depFromField;

  const rawDesignation = String(item.designation || "");
  const parts = rawDesignation.split("/");
  return String(parts[1] || "").trim().toUpperCase();
}

function diffDays(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  );
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const ms = endUtc - startUtc;
  if (ms <= 0) return 0;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function diffDaysAbs(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round(Math.abs(bUtc - aUtc) / (1000 * 60 * 60 * 24));
}

function utcDateOnlyMs(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function calculateBucketDelay(
  flowItems: DelayInputItem[],
  gmApprovalDate?: string | null,
  gmApprovalTime?: string | null
) {
  const normalized = (flowItems || [])
    .map((item) => {
      const actionDate = item.actionDate ?? item.date ?? null;
      const actionTime = item.actionTime ?? item.time ?? null;
      return {
        raw: item,
        sequenceNo:
          typeof item.sequenceNo === "number"
            ? item.sequenceNo
            : Number(item.sequenceNo || 0),
        designationRaw: String(item.designation || "").trim(),
        designationNorm: normalizeDesignation(item.designation),
        department: extractDepartment(item),
        at: parseDateTime(actionDate, actionTime),
      };
    })
    .filter((x) => x.at !== null) as Array<{
    raw: DelayInputItem;
    designationRaw: string;
    designationNorm: string;
    department: string;
    sequenceNo: number;
    at: Date;
  }>;

  if (!normalized.length) {
    return {
      totalCycleDays: 0,
      executiveDelayDays: 0,
      financeDelayDays: 0,
      hqDelayDays: 0,
      markers: {
        firstDesignationAt: null,
        lastDesignationAt: null,
        gmApprovalAt: null,
        drmLastAt: null,
        srdfmLastAt: null,
        nwrBeforeLastAt: null,
      },
    };
  }

  const sorted = [...normalized].sort((a, b) => {
    if ((a.sequenceNo || 0) !== (b.sequenceNo || 0)) {
      return (a.sequenceNo || 0) - (b.sequenceNo || 0);
    }
    return a.at.getTime() - b.at.getTime();
  });

  const firstSequenceNo = sorted[0].sequenceNo || 0;
  const lastSequenceNo = sorted[sorted.length - 1].sequenceNo || 0;

  const firstSequenceRows = sorted.filter((x) => (x.sequenceNo || 0) === firstSequenceNo);
  const lastSequenceRows = sorted.filter((x) => (x.sequenceNo || 0) === lastSequenceNo);

  const firstDesignation = firstSequenceRows[0].at;
  const lastDesignation = lastSequenceRows[lastSequenceRows.length - 1].at;
  const gmApprovalAt = parseDateTime(gmApprovalDate || null, gmApprovalTime || null);

  const drmRows = sorted.filter((x) => x.designationNorm === "DRM");
  const srdfmRows = sorted.filter((x) => x.designationNorm === "SRDFM");
  const nwrRows = sorted.filter(
    (x) => x.department === "NWR" || x.designationRaw.toUpperCase().includes("/NWR")
  );

  const drmLastAt = drmRows.length ? drmRows[drmRows.length - 1].at : null;
  const srdfmLastAt = srdfmRows.length ? srdfmRows[srdfmRows.length - 1].at : null;
  const nwrBeforeLastRows = sorted.filter((x) => {
    const isNwr =
      x.department === "NWR" || x.designationRaw.toUpperCase().includes("/NWR");
    const isBeforeLast = (x.sequenceNo || 0) < lastSequenceNo;
    const isBeforeLastDate = utcDateOnlyMs(x.at) < utcDateOnlyMs(lastDesignation);
    return isNwr && isBeforeLast && isBeforeLastDate;
  });
  const nwrBeforeLastAt = nwrBeforeLastRows.length
    ? nwrBeforeLastRows[nwrBeforeLastRows.length - 1].at
    : null;

  return {
    totalCycleDays: diffDays(firstDesignation, lastDesignation),
    executiveDelayDays: diffDays(gmApprovalAt, firstDesignation),
    financeDelayDays: diffDaysAbs(drmLastAt, srdfmLastAt),
    hqDelayDays: diffDays(nwrBeforeLastAt, lastDesignation),
    markers: {
      firstDesignationAt: firstDesignation.toISOString(),
      lastDesignationAt: lastDesignation.toISOString(),
      gmApprovalAt: gmApprovalAt ? gmApprovalAt.toISOString() : null,
      drmLastAt: drmLastAt ? drmLastAt.toISOString() : null,
      srdfmLastAt: srdfmLastAt ? srdfmLastAt.toISOString() : null,
      nwrBeforeLastAt: nwrBeforeLastAt ? nwrBeforeLastAt.toISOString() : null,
    },
  };
}


