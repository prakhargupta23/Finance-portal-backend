import GmApprovalData from "../Model/GmApprovalData.models";
import sequelize from "../config/sequelize";

export type GmDbWriteResult = {
  saved: boolean;
  gmApprovalDate?: string | null;
  gmApprovalTime?: string | null;
  caseUuid?: string;
  error?: string;
};

function toSqlDate(dateValue: string | null | undefined): string | null {
  const raw = String(dateValue || "").trim();
  if (!raw || raw.toLowerCase() === "n/a") return null;

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${month}-${day}`;
  }

  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, "0");
    const day = ymd[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return null;
}

function extractHeaderGmDate(rawText: string | null | undefined): string | null {
  const text = String(rawText || "");
  if (!text.trim()) return null;

  // Common format in letters:
  // Headquarters Office
  // Jaipur
  // Date-30.10.2025
  const hqPattern =
    /headquarters\s*office[\s\S]{0,120}?date\s*[-:]\s*([0-3]?\d[\/.-][01]?\d[\/.-]\d{2,4})/i;
  const hqMatch = text.match(hqPattern);
  if (hqMatch?.[1]) return hqMatch[1];

  // Generic fallback for lines like "Date-30.10.2025"
  const dateLinePattern = /\bdate\s*[-:]\s*([0-3]?\d[\/.-][01]?\d[\/.-]\d{2,4})\b/i;
  const dateLineMatch = text.match(dateLinePattern);
  if (dateLineMatch?.[1]) return dateLineMatch[1];

  return null;
}

function toSqlTime(timeValue: string | null | undefined): string | null {
  const raw = String(timeValue || "").trim();
  if (!raw || raw.toLowerCase() === "n/a") return null;

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

export async function persistGmData(
  processedData: any
): Promise<GmDbWriteResult> {
  console.log("[GM][DB] Persisting GM data to database...");

  const transaction = await sequelize.transaction();

  try {
    const flowRows = Array.isArray(processedData?.right_side_flow)
      ? processedData.right_side_flow.length
      : 0;

    console.log("[GM][DB] Incoming payload summary", {
      planHead: processedData?.plan_head ?? null,
      hasWorkName: Boolean(processedData?.work_name),
      flowRows,
      rawTextLength: processedData?.raw_text?.length ?? 0,
    });

    const gmFlow = Array.isArray(processedData?.right_side_flow)
      ? processedData.right_side_flow.find((item: any) =>
          String(item?.designation || "").toLowerCase().includes("gm")
        )
      : null;

    const headerDateRaw = extractHeaderGmDate(processedData?.raw_text);
    const gmDateRaw =
      gmFlow?.date ?? processedData?.gm_approval_date ?? headerDateRaw ?? null;
    const gmTimeRaw = gmFlow?.time ?? null;
    const gmDate = toSqlDate(gmDateRaw);
    const gmTime = toSqlTime(gmTimeRaw);

    console.log("[GM][DB] GM flow match", {
      found: Boolean(gmFlow),
      headerDateRaw,
      gmDateRaw,
      gmTimeRaw,
      gmDate,
      gmTime,
      designation: gmFlow?.designation ?? null,
    });

    const createdRow: any = await GmApprovalData.create(
      {
        planhead: processedData?.plan_head ?? null,
        workname: processedData?.work_name ?? null,
        gmApprovalDate: gmDate,
        gmApprovalTime: gmTime,
        rawText: processedData?.raw_text ?? null,
      },
      { transaction }
    );

    await transaction.commit();

    console.log("[GM][DB] GM data saved successfully", {
      caseUuid: createdRow?.uuid ?? null,
    });

    return {
      saved: true,
      caseUuid: createdRow?.uuid ?? undefined,
      gmApprovalDate: gmDate,
      gmApprovalTime: gmTime,
    };
  } catch (error: any) {
    try {
      if (!(transaction as any).finished) {
        await transaction.rollback();
      }
    } catch (rollbackError) {
      console.error("[GM][DB] Rollback failed:", rollbackError);
    }

    console.error("[GM][DB] Error saving GM data:", error);

    return {
      saved: false,
      error: error?.message || "Failed to save GM data",
    };
  }
}
