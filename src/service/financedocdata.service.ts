import { getGpt4oResponse } from "./ai.service";
const pdf = require("pdf-parse");

export async function getfiledata(prompt: string, file: string) {
    try {
        console.log("[FIN][PDF] Input received", {
            hasFile: Boolean(file),
            fileLength: file?.length ?? 0,
            promptLength: prompt?.length ?? 0
        });

        let extractedText = "";

        try {
            console.log("[FIN][PDF] Extracting text from PDF");

            // Convert base64 → buffer
            const pdfBuffer = Buffer.from(file, "base64");

            // Extract text
            const data = await pdf(pdfBuffer);

            extractedText = data.text;

            console.log("[FIN][PDF] Text extraction successful", {
                textLength: extractedText?.length ?? 0
            });

            console.log("extracted changes ", extractedText);

        } catch (error: any) {
            console.error("[FIN][PDF] PDF Extraction Error:", error.message);
        }

        const jsonPrompt = `${prompt}

From the text given below, extract the following information strictly following the rules mentioned.

CRITICAL RULES:
1. Extract plan_head exactly as written.
2. Extract work_name exactly as written.
3. Extract designation, date and time from the approval flow.

DESIGNATION EXTRACTION RULES (VERY IMPORTANT):
- Keep the COMPLETE designation exactly as it appears, including everything after the forward slash (/).
- Examples:
  * If text shows "SR. DFM/JU" → extract as "SR. DFM/JU"
  * If text shows "SDEE/JU" → extract as "SDEE/JU"
  * If text shows "CCM/NWR" → extract as "CCM/NWR"
  * If text shows "Sr. DEN (Co)/JU" → extract as "Sr. DEN (Co)/JU"
  * If text shows "SRDEN/ CENTRAL" → extract as "SRDEN/CENTRAL"
- DO NOT remove or truncate anything after the "/" character
- The part after "/" is the department code and MUST be preserved

4. Extract dates in the format shown (DD/MM/YYYY or similar)
5. Extract times in the format shown (HH:MM:SS)

Return STRICT JSON only in this format:
{
  "plan_head": "...",
  "work_name": "...",
  "right_side_flow": [
    {
      "designation": "COMPLETE designation with /DEPARTMENT",
      "date": "DD/MM/YYYY",
      "time": "HH:MM:SS"
    }
  ]
}

OCR TEXT:
${extractedText}
`;

        console.log("[FIN][GPT] Sending extracted text to GPT", {
            promptLength: jsonPrompt.length,
            textLength: extractedText?.length ?? 0
        });

        const data = await getGpt4oResponse(jsonPrompt, { extractedText });

        console.log("========== GPT OUTPUT ==========");
        console.log(JSON.stringify(data, null, 2));
        console.log("================================");

        return {
            ...data,
            raw_text: extractedText
        } as any;

    } catch (error) {
        console.error("Error in getfiledata:", error);
        throw error;
    }
}