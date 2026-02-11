import { getGpt4oResponse } from "./ai.service";
import sequelize from "../config/sequelize";
import axios from 'axios';


export async function getfiledata(prompt: string, file: string) {
    try {
        console.log("ocr reached",file[0]?"yes":"no");


      
        let extractedText = "";
        try {
          const response = await axios.post('https://ocrappnwrsup-bwhhbsenaeb8gqdm.canadacentral-01.azurewebsites.net/ocr', {
            pdfBase64: file
          });
          extractedText = response.data.text;
          //console.log("Extracted text:", response.data.text);

        } catch (error) {
          console.error("OCR Error:", error.response?.data || error.message);
        }
        
        
        
        const jsonPrompt = `${prompt} 

            From the text given below, extract the following information strictly following the rules mentioned in each section.
// ========================
// WHAT TO EXTRACT
// ========================

// 1. plan_head  
//    - Extract the Plan Head value exactly as it appears.
//    - Do NOT merge it with Work Name.
//    - Do NOT return words like "PLAN", "HEAD", or "WORK".

// 2. work_name  
//    - Extract the full work name / description exactly as written.
//    - Keep it separate from Plan Head.

// 3. designation and datetime extraction   
//  - Remove the letter after the / in the designation. For example, "Sr.Den/Line" should be extracted as "Sr.Den".

// ========================
// Role and time extraction FLOW RULES
// ========================




// - Treat a line as a designation ONLY if:
//   - a date and time appear with it (same block or immediately after).
// - If a designation appears without date and time, DO NOT extract it.
// - If designation and date/time appear together, extract them as one entry.
// - Extract ONLY:
//   - designation
//   - date
//   - time
// - Follow the top-to-bottom order as it appears on the right side of the document.
// - Do NOT infer flow using author/receiver logic.
// - Do NOT add actions or statuses.

// ========================
// OUTPUT FORMAT (STRICT)
// ========================

// {
//   "plan_head": "...",
//   "work_name": "...",
//   "right_side_flow": [
//     {
//       "designation": "...",
//       "date": "...",
//       "time": "..."
//     }
//   ]
// }

// If any value is missing, return null.
// Return ONLY valid JSON. No explanations.

// ========================
// OCR TEXT
// ========================

// {{OCR_TEXT_HERE}}








              ${extractedText}`;
        const data = await getGpt4oResponse(jsonPrompt, {extractedText});
        const tofilterdata = data?.right_side_flow || [];
        const cleanedData = tofilterdata.map(item => ({
          ...item,
          designation: item.designation.replace(/\/.*/, '')
        }));
        data.right_side_flow = cleanedData;
        return data;
    } catch (error) {
        console.error("Error in getfiledata:", error);
        throw error;
    }
}














