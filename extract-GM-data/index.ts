import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { GmOcrError, getGMFileData } from "../src/service/gmdocdata.service";
import { persistGmData } from "../src/service/gmvetting.service";

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const traceId = `gm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { fileBase64, rowId } = req.body || {};

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
    const dbWrite = await persistGmData(processedData);
    console.log(`[${traceId}] DB write result`, dbWrite);

    context.res = {
      status: 200,
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
