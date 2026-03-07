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

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
      let maxRetries = 3;
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[GM][OCR] Calling OCR service (Attempt ${attempt}/${maxRetries})`);
          const response = await axios.post(
            "https://ocrappnwrsup-bwhhbsenaeb8gqdm.canadacentral-01.azurewebsites.net/ocr",
            {
              pdfBase64: normalizedFile,
            },
            { timeout: 1200000 }
          );

          extractedText = String(response?.data?.text || "").trim();
          if (extractedText) break; // Success, exit loop
        } catch (err: any) {
          lastError = err;
          const isNetworkError = !err.response || err.response.status === 502 || err.response.status === 503 || err.response.status === 504;

          if (attempt < maxRetries && isNetworkError) {
            console.warn(`[GM][OCR] Attempt ${attempt} failed with ${err.response?.status || 'Timeout'}. Retrying in 5s...`);
            await sleep(5000);
          } else {
            throw err; // Final attempt or non-retryable error
          }
        }
      }
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

    /* -------------------------------
       STEP 2: CHUNKED GPT EXTRACTION
    --------------------------------*/
    // Split text into chunks of roughly 8000 characters with 1000 char overlap
    const chunkSize = 8000;
    const overlap = 1000;
    const chunks: string[] = [];

    for (let i = 0; i < extractedText.length; i += (chunkSize - overlap)) {
      chunks.push(extractedText.substring(i, i + chunkSize));
      if (i + chunkSize >= extractedText.length) break;
    }

    console.log(`[GM][GPT] Processing ${chunks.length} text chunks`);

    let consolidatedData: any = {
      letter_no: null,
      subject: null,
      reference: null,
      plan_head: null,
      gm_approval_date: null,
      works: []
    };

    for (let i = 0; i < chunks.length; i++) {
      const isFirstChunk = (i === 0);
      const chunkText = chunks[i];

      const jsonPrompt = `
You are a master data extraction specialist. This is CHUNK ${i + 1} of ${chunks.length} of a very large document.
YOUR GOAL: Extract EVERY row from EVERY table in this specific text chunk.

### EXTRACTION RULES:
1. **NO ROW LEFT BEHIND**: Extract every single row following the (S.N. | Name of Work | Divi | Alloc | Cost) pattern.
2. **LINE JOINING**: Combine multiline work descriptions into a single string.
3. ${isFirstChunk ? "**HEADER INFO**: Extract Letter No, Subject, Reference, Plan Head, and the main Approval Date (usually found near 'Head Quarter Office' or 'Sub/Ref')." : "**SKIP HEADERS**: Focus ONLY on the 'works' array for this chunk."}
4. **SERIAL NUMBER AUDIT**: Follow numeric order.

### OUTPUT SCHEMA (STRICT JSON):
{
  "letter_no": "${isFirstChunk ? "Extract" : "Ignore"}",
  "subject": "${isFirstChunk ? "Extract" : "Ignore"}",
  "reference": "${isFirstChunk ? "Extract" : "Ignore"}",
  "plan_head": "${isFirstChunk ? "Extract" : "Ignore"}",
  "gm_approval_date": "${isFirstChunk ? "Extract the main letter date in DD.MM.YYYY format" : "Ignore"}",
  "works": [
    { 
      "sn": "string", 
      "division": "string", 
      "work_name": "string", 
      "sanctioned_cost": "string", 
      "allocation": "string" 
    }
  ]
}

### TEXT CHUNK TO PROCESS:
${chunkText}
`;

      console.log(`[GM][GPT] Calling GPT for Chunk ${i + 1}/${chunks.length}...`);
      const chunkResult = await getGpt4oResponse(jsonPrompt, {});

      if (isFirstChunk) {
        consolidatedData.letter_no = chunkResult.letter_no;
        consolidatedData.subject = chunkResult.subject;
        consolidatedData.reference = chunkResult.reference;
        consolidatedData.plan_head = chunkResult.plan_head;
        consolidatedData.gm_approval_date = chunkResult.gm_approval_date;
      }

      const chunkWorks = Array.isArray(chunkResult?.works) ? chunkResult.works : [];
      console.log(`[GM][GPT] Chunk ${i + 1} returned ${chunkWorks.length} rows`);

      consolidatedData.works = [...consolidatedData.works, ...chunkWorks];
    }

    // Deduplicate works based on SN and Work Name (due to overlap)
    const uniqueWorks = consolidatedData.works.filter((item: any, index: number, self: any[]) =>
      index === self.findIndex((t) => (
        t.sn === item.sn && t.work_name === item.work_name
      ))
    );

    console.log(`[GM][GPT] Total unique rows extracted: ${uniqueWorks.length}`);

    // Normalize each work item to ensure keys match database expectation
    const normalizedWorks = uniqueWorks.map((w: any) => ({
      sn: w.sn,
      work_name: w.work_name || w.workname || null,
      division: w.division || w.dept || w.department || null,
      allocation: w.allocation || w.alloc || null,
      sanctioned_cost: w.sanctioned_cost || w.cost || w.estimated_cost || null,
      executing_agency: w.executing_agency || w.agency || null
    }));

    return {
      ...consolidatedData,
      works: normalizedWorks,
      raw_text: extractedText,
    } as any;
  } catch (error) {
    console.error("Error in getGMFileData:", error);
    throw error;
  }
}
