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
  const d1 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const d2 = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const gapMs = d2 - d1;
  if (gapMs <= 0) return 0;
  // Use ceiling so any fraction of a day or different calendar day counts as at least 1
  return Math.ceil(gapMs / (1000 * 60 * 60 * 24));
}

function diffDaysAbs(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  const d1 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const d2 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  const gapMs = Math.abs(d2 - d1);
  if (gapMs === 0) return 0;
  return Math.max(1, Math.ceil(gapMs / (1000 * 60 * 60 * 24)));
}

function utcDateOnlyMs(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}



// NWR LOOPS 
function calculateNwrLoops(
  sorted: Array<{
    designationNorm: string;
    designationRaw: string;
    department: string;
    at: Date;
  }>
) {
  const relevant = sorted.filter(
    (x) =>
      (x.department === "NWR" ||
        x.designationRaw.toUpperCase().includes("/NWR")) &&
      (
        x.designationNorm === "CEPD" ||
        x.designationRaw.toUpperCase().includes("FA")
      )
  );

  const totalCepd = relevant.filter(
    (x) => x.designationNorm === "CEPD"
  ).length;

  // Rule: if CEPD <= 1 → ignore
  if (totalCepd <= 1) return [];

  let loops: {
    cepdDate: string;
    faDate: string;
    delayDays: number;
  }[] = [];

  let currentCepd: Date | null = null;

  for (const row of relevant) {
    const isCepd = row.designationNorm === "CEPD";
    const isFa = row.designationRaw.toUpperCase().includes("FA");

    if (isCepd) {
      currentCepd = row.at; // overwrite latest
    }

    if (isFa && currentCepd) {
      const delayDays = diffDays(currentCepd, row.at);

      loops.push({
        cepdDate: currentCepd.toISOString(),
        faDate: row.at.toISOString(),
        delayDays,
      });

      currentCepd = null; // reset after pairing
    }
  }

  return loops;
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

  //  NWR LOOPS
  const nwrLoops = calculateNwrLoops(sorted);
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
  // CHANGED: Specific logic for CEPD/NWR (taking the last time he appears)
  const cepdRows = sorted.filter((x) => {
    const isCepd = x.designationNorm === "CEPD" || x.designationRaw.toUpperCase().includes("CEPD/NWR");
    const isNwr = x.department === "NWR" || x.designationRaw.toUpperCase().includes("/NWR");
    return isCepd && isNwr;
  });

  const nwrBeforeLastAt = cepdRows.length
    ? cepdRows[cepdRows.length - 1].at // Strictly take the LAST time CEPD appeared
    : null;

  // Fallback to general NWR only if CEPD is not found at all
  if (!nwrBeforeLastAt) {
    const nwrRowsFallback = sorted.filter((x) => {
      const isNwr = x.department === "NWR" || x.designationRaw.toUpperCase().includes("/NWR");
      const isBeforeLast = (x.sequenceNo || 0) < lastSequenceNo;
      return isNwr && isBeforeLast;
    });
    if (nwrRowsFallback.length) {
      (nwrBeforeLastAt as any) = nwrRowsFallback[nwrRowsFallback.length - 1].at;
    }
  }

  return {
    totalCycleDays: diffDays(firstDesignation, lastDesignation),
    executiveDelayDays: diffDaysAbs(firstDesignation, gmApprovalAt), // Restored for Averaging
    financeDelayDays: diffDaysAbs(drmLastAt, srdfmLastAt),          // Restored for Averaging
    hqDelayDays: diffDays(nwrBeforeLastAt, lastDesignation),         // Restored for Averaging
    // NWR LOOPS
    nwrLoops,
    nwrLoopCount: nwrLoops.length,
    markers: {
      firstDesignationAt: firstDesignation.toISOString(),
      firstDesignationDate: `${String(firstDesignation.getUTCDate()).padStart(2, '0')}/${String(firstDesignation.getUTCMonth() + 1).padStart(2, '0')}/${firstDesignation.getUTCFullYear()}`,
      lastDesignationAt: lastDesignation.toISOString(),
      lastDesignationDate: `${String(lastDesignation.getUTCDate()).padStart(2, '0')}/${String(lastDesignation.getUTCMonth() + 1).padStart(2, '0')}/${lastDesignation.getUTCFullYear()}`,
      gmApprovalAt: gmApprovalAt ? gmApprovalAt.toISOString() : null,
      gmApprovalDateFormatted: gmApprovalAt ? `${String(gmApprovalAt.getUTCDate()).padStart(2, '0')}/${String(gmApprovalAt.getUTCMonth() + 1).padStart(2, '0')}/${gmApprovalAt.getUTCFullYear()}` : null,
      drmLastAt: drmLastAt ? drmLastAt.toISOString() : null,
      drmLastDate: drmLastAt ? `${String(drmLastAt.getUTCDate()).padStart(2, '0')}/${String(drmLastAt.getUTCMonth() + 1).padStart(2, '0')}/${drmLastAt.getUTCFullYear()}` : null,
      srdfmLastAt: srdfmLastAt ? srdfmLastAt.toISOString() : null,
      srdfmLastDate: srdfmLastAt ? `${String(srdfmLastAt.getUTCDate()).padStart(2, '0')}/${String(srdfmLastAt.getUTCMonth() + 1).padStart(2, '0')}/${srdfmLastAt.getUTCFullYear()}` : null,
      nwrBeforeLastAt: nwrBeforeLastAt ? nwrBeforeLastAt.toISOString() : null,
    },
  };
}


