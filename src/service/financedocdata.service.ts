import { getGpt4oResponse } from "./ai.service";
import axios from "axios";

export async function getfiledata(prompt: string, file: string) {
    try {
        console.log("ocr reached", file[0] ? "yes" : "no");

        let extractedText = "";

        try {
            const response = await axios.post(
                "https://ocrappnwrsup-bwhhbsenaeb8gqdm.canadacentral-01.azurewebsites.net/ocr",
                {
                    pdfBase64: file
                }
            );

            extractedText = response.data.text;

            console.log("========== RAW OCR TEXT ==========");
            console.log(extractedText);
            console.log("==================================");

        } catch (error: any) {
            console.error("OCR Error:", error.response?.data || error.message);
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
  * If text shows "SR. DFM/JU" → extract as "SR. DFM/JU" (NOT "SR. DFM")
  * If text shows "SDEE/JU" → extract as "SDEE/JU" (NOT "SDEE")
  * If text shows "CCM/NWR" → extract as "CCM/NWR" (NOT "CCM")
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

        const data = await getGpt4oResponse(jsonPrompt, { extractedText });

        console.log("========== GPT OUTPUT ==========");
        console.log(JSON.stringify(data, null, 2));
        console.log("================================");

        // ✅ Return data with raw OCR text for fallback processing
        return {
            ...data,
            raw_text: extractedText
        } as any; // ← Add this to avoid TypeScript errors

    } catch (error) {
        console.error("Error in getfiledata:", error);
        throw error;
    }
}


