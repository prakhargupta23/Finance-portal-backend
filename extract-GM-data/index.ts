import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { GmOcrError, getGMFileData } from "../src/service/gmdocdata.service";
import { persistGmData } from "../src/service/gmvetting.service";
import DocumentMaster from "../src/Model/DocumentMaster.model";
const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const traceId = `gm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { fileBase64, rowId, sNo, masterId, fileName, fileUrl, docLabel } = req.body || {};

    console.log(`[${traceId}] GM extract request received`, {
      hasFileBase64: Boolean(fileBase64),
      rowId: rowId ?? null,
    });

    if (!fileBase64) {
      console.warn(`[${traceId}] Missing required field: fileBase64`);
      context.res = {
        status: 400,
        body: { error: "Missing required field: fileBase64" },
      };
      return;
    }

    console.log(`[${traceId}] Starting GM OCR + GPT pipeline`);
    const processedData = await getGMFileData(fileBase64);

    console.log(`[${traceId}] GM processing completed`, {
      planHead: processedData?.plan_head ?? null,
      hasWorkName: Boolean(processedData?.work_name),
      flowRows: Array.isArray(processedData?.right_side_flow)
        ? processedData.right_side_flow.length
        : 0,
    });

    console.log(`[${traceId}] Persisting GM data to DB`);
    let targetSNo = sNo || masterId;

    if (!targetSNo) {
      const fallbackSNo = Math.floor(100000000 + Math.random() * 900000000).toString();
      console.log(`[${traceId}] No masterId provided, creating fallback master with S.No: ${fallbackSNo}`);
      const master = await DocumentMaster.create({
        s_no: fallbackSNo,
      }) as any;
      targetSNo = master.s_no;
    }

    // Update DocumentMaster with upload status
    if (docLabel && targetSNo) {
      const updateMap: any = {
        "DRM APP": { drm_app_uploaded: true, drm_app_file_url: fileUrl, drm_app_file_name: fileName },
        "D&G Letter": { dg_letter_uploaded: true, dg_letter_file_url: fileUrl, dg_letter_file_name: fileName },
        "Estimate reference": { estimate_uploaded: true, estimate_file_url: fileUrl, estimate_file_name: fileName },
        "Func distribution letter": { func_distribution_uploaded: true, func_distribution_file_url: fileUrl, func_distribution_file_name: fileName },
        "Top sheet": { top_sheet_uploaded: true, top_sheet_file_url: fileUrl, top_sheet_file_name: fileName }
      };

      const updateData = updateMap[docLabel];
      if (updateData) {
        console.log(`[${traceId}] Attempting DocumentMaster status update for GM ${docLabel} (S.No: ${targetSNo})`, updateData);
        const [updatedRows] = await DocumentMaster.update(updateData, { where: { s_no: targetSNo } });
        console.log(`[${traceId}] Update result: ${updatedRows} row(s) updated.`);

        if (updatedRows === 0) {
          console.log(`[${traceId}] WARNING: No record found with S.No ${targetSNo}. Creating a new one to ensure status persistence.`);
          await DocumentMaster.create({
            s_no: targetSNo,
            ...updateData
          });
        }
      }
    }

    const dbWrite = await persistGmData(processedData, targetSNo, fileName, fileUrl);
    console.log(`[${traceId}] DB write result`, dbWrite);

    context.res = {
      status: dbWrite.saved ? 200 : 409,
      body: {
        traceId,
        ...processedData,
        dbWrite,
      },
    };

    console.log(`[${traceId}] GM response sent`, { status: 200 });
  } catch (error: any) {
    console.error(`[${traceId}] GM extract failed`, error);
    const status = error instanceof GmOcrError ? error.statusCode : 500;
    context.res = {
      status,
      body: {
        error:
          error instanceof GmOcrError
            ? "OCR failed for GM document"
            : "Failed to process GM data",
        code: error?.code ?? undefined,
        details: error.message,
        ocrDetails: error?.details ?? undefined,
      },
    };
  }
};

export default httpTrigger;
