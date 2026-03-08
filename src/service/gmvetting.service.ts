import GmApprovalData from "../Model/GmApprovalData.model";
import sequelize from "../config/sequelize";
import { Op } from "sequelize";
import { normalizeText, normalizePlanhead } from "./vetting.service";

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

  // Pattern 1: Look for date after Hq/Headquarters, Sub, or Ref
  // Allows for optional separators: "Date16.12.2024", "Date: 16-12-24", etc.
  // We scan up to 200 characters after these headers for a date.
  const hqPattern =
    /(?:head\s*quarter(?:s)?|hq|sub|ref)\s*[:.\s\w]{0,200}?\bdate[rd]?\s*[-:\s.]*\s*([0-3]?\d[\/.-][01]?\d[\/.-]\d{2,4})/i;
  const hqMatch = text.match(hqPattern);
  if (hqMatch?.[1]) return hqMatch[1];

  // Pattern 2: Look specifically for "Dated" or "Date" anywhere in the text (first 600 chars)
  const datePattern = /\bdate[rd]?\s*[-:\s.]*\s*([0-3]?\d[\/.-][01]?\d[\/.-]\d{2,4})/i;
  const dateMatch = text.substring(0, 600).match(datePattern);
  if (dateMatch?.[1]) return dateMatch[1];

  // Pattern 3: Final fallback - just grab the first date-like thing found in the header
  const anyDatePattern = /\b([0-3]?\d[\/.-][01]?\d[\/.-]\d{2,4})\b/;
  const anyDateMatch = text.substring(0, 400).match(anyDatePattern);
  if (anyDateMatch?.[1]) return anyDateMatch[1];

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
  processedData: any,
  sNo: string,
  fileName?: string | null,
  fileUrl?: string | null
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
      headerDateRaw ?? gmFlow?.date ?? processedData?.gm_approval_date ?? null;
    const gmTimeRaw = gmFlow?.time ?? null;
    const gmDate = toSqlDate(gmDateRaw);
    const gmTime = toSqlTime(gmTimeRaw);

    const worksToInsert = Array.isArray(processedData?.works) && processedData.works.length > 0
      ? processedData.works
      : [
        {
          work_name: processedData?.work_name || processedData?.workname,
          division: processedData?.division,
          allocation: processedData?.allocation,
          sanctioned_cost: processedData?.sanctioned_cost,
          executing_agency: processedData?.executing_agency
        }
      ];

    // DUPLICATE CHECK APPLIED
    // << CHANGE: Replaced local normalize with imported normalizeText and normalizePlanhead >>
    const currentWorkNameNorm = normalizeText(worksToInsert[0]?.work_name || worksToInsert[0]?.workname);
    const currentPHNorm = normalizePlanhead(processedData?.plan_head);

    console.log("[GM][DB] Global Duplicate Check Start", {
      ph: currentPHNorm,
      work: currentWorkNameNorm.substring(0, 50) + "..."
    });

    // << REPLACE LOGIC START (HARD RESET) >>
    // REASON: Deep Search for old GM records.
    const existingWithSameSNo = await GmApprovalData.findAll({
      where: {
        [Op.or]: [
          { s_no: sNo },
          { s_no: sNo.trim() },
          sequelize.where(sequelize.fn('TRIM', sequelize.col('s_no')), sNo.trim())
        ]
      },
      transaction
    });

    if (existingWithSameSNo.length > 0) {
      console.log(`[GM][DB] Hard Reset Triggered for S.No: [${sNo}]. Purging ${existingWithSameSNo.length} old GM record(s)...`);
      await GmApprovalData.destroy({
        where: { uuid: { [Op.in]: existingWithSameSNo.map((e: any) => e.uuid) } },
        transaction
      });
      console.log(`[GM][DB] Deep Clean Success.`);
    }

    // DUPLICATE CHECK: Only block if the work exists on a DIFFERENT S.No
    const duplicateOnOtherSNo = await GmApprovalData.findOne({
      where: {
        [Op.and]: [
          sequelize.where(sequelize.fn('LOWER', sequelize.col('planhead')), currentPHNorm),
          sequelize.where(sequelize.fn('LOWER', sequelize.col('workname')), currentWorkNameNorm),
          { s_no: { [Op.ne]: sNo } } // Ignore current session
        ]
      },
      transaction
    });

    if (duplicateOnOtherSNo) {
      console.log("[GM][DB] Duplicate detected on a different S.No! Stopping save.");
      await transaction.rollback();
      return {
        saved: false,
        error: "DUPLICATE_DOCUMENT: This Plan Head and Work Name already exists in another session."
      };
    }
    // << REPLACE LOGIC END >>

    console.log("[GM][DB] Final works to insert", { count: worksToInsert.length });

    const createdRows = await GmApprovalData.bulkCreate(
      worksToInsert.map((w: any) => ({
        s_no: sNo,
        planhead: processedData?.plan_head ?? null,
        letter_no: processedData?.letter_no ?? null,
        subject: processedData?.subject ?? null,
        reference: processedData?.reference ?? null,
        workname: w?.work_name ?? null,
        division: w?.division ?? null,
        allocation: w?.allocation ?? null,
        sanctioned_cost: w?.sanctioned_cost ?? null,
        executing_agency: w?.executing_agency ?? null,
        gmApprovalDate: gmDate,
        gmApprovalTime: gmTime,
        rawText: processedData?.raw_text ?? null,
      })),
      { transaction }
    );

    await transaction.commit();

    console.log("[GM][DB] GM data saved successfully", {
      insertedCount: createdRows.length,
    });

    return {
      saved: true,
      caseUuid: (createdRows[0] as any)?.uuid ?? undefined,
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
