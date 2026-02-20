import { getGpt4oResponse } from "./ai.service";
import axios from "axios";

export class GmOcrError extends Error {
  statusCode: number;
  code: string;
  details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.name = "GmOcrError";
    this.statusCode = 422;
    this.code = "GM_OCR_FAILED";
    this.details = details;
  }
}

function normalizeBase64Payload(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const withoutPrefix = raw.startsWith("data:") ? raw.split(",").slice(1).join(",") : raw;
  return withoutPrefix.replace(/\s+/g, "");
}

function isOcrFailureText(text: string): boolean {
  const value = String(text || "").toLowerCase();
  return (
    value.includes("ocr processing failed") ||
    value.includes("decompression bomb") ||
    value.includes("exceeds limit")
  );
}

export async function getGMFileData(file: string) {
  try {
    const normalizedFile = normalizeBase64Payload(file);

    console.log("[GM][OCR] Input received", {
      hasFile: Boolean(file),
      fileLength: file?.length ?? 0,
      normalizedLength: normalizedFile?.length ?? 0,
    });

    if (!normalizedFile) {
      throw new GmOcrError("Invalid or empty base64 payload");
    }

    let extractedText = "";

    try {
      console.log("[GM][OCR] Calling OCR service");
      const response = await axios.post(
        "https://ocrappnwrsup-bwhhbsenaeb8gqdm.canadacentral-01.azurewebsites.net/ocr",
        {
          pdfBase64: normalizedFile,
        },
        { timeout: 120000 }
      );

      extractedText = String(response?.data?.text || "").trim();
      console.log("[GM][OCR] OCR response received", {
        textLength: extractedText?.length ?? 0,
      });
      console.log("========== GM RAW OCR TEXT ==========");
      console.log(extractedText);
      console.log("=====================================");

      if (!extractedText) {
        throw new GmOcrError("OCR service returned empty text");
      }

      if (isOcrFailureText(extractedText)) {
        throw new GmOcrError(
          "OCR rejected input (image too large/corrupt). Re-upload a smaller or cleaner file.",
          extractedText
        );
      }
    } catch (error: any) {
      console.error("[GM][OCR] OCR error", error.response?.data || error.message);
      if (error instanceof GmOcrError) {
        throw error;
      }
      throw new GmOcrError(
        "Failed to extract text from OCR service",
        error.response?.data?.message || error.message
      );
    }

    const jsonPrompt = `
From the OCR text below extract:

1. plan_head
2. work_name
3. right_side_flow (designation, date, time)

Rules:
- Keep COMPLETE designation including everything after "/"
- Do NOT remove department codes
- Extract dates exactly as shown
- Extract times exactly as shown

Return STRICT JSON only in this format:

{
  "plan_head": "...",
  "work_name": "...",
  "right_side_flow": [
    {
      "designation": "...",
      "date": "DD/MM/YYYY",
      "time": "HH:MM:SS"
    }
  ]
}

OCR TEXT:
${extractedText}
`;

    


console.log("[GM][GPT] Sending OCR text to GPT", {
      promptLength: jsonPrompt.length,
      textLength: extractedText?.length ?? 0,
    });
    const data = await getGpt4oResponse(jsonPrompt, { extractedText });

    console.log("========== GM GPT OUTPUT ==========");
    console.log(JSON.stringify(data, null, 2));
    console.log("===================================");

    return {
      ...data,
      raw_text: extractedText,
    } as any;
  } catch (error) {
    console.error("Error in getGMFileData:", error);
    throw error;
  }
}
