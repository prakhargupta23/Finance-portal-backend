import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { getfiledata } from '../src/service/financedocdata.service';
import { persistVettingData } from '../src/service/vetting.service';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    try {
        const { prompt, fileBase64, documentType, rowId } = req.body;
        
        if (!prompt || !fileBase64) {
            context.res = {
                status: 400,
                body: { error: "Missing required fields: prompt and file" }
            };
            return;
        }
        console.log("document data fetching function reached");
        const processedData = await getfiledata(prompt, fileBase64);
        console.log("Processed Data:", processedData);
        console.log("Document Type:", typeof processedData);

        const normalizeDesignation = (value: string) =>
            String(value || "")
                .toLowerCase()
                .replace(/\(.*?\)/g, "")
                .replace(/[^a-z]/g, "");

        const targetDesignations = new Set([
            "srden",
            "srdfm",
            "srdcm",
            "dyccm",
             "drm",
                ]);

        const canonicalDesignationByKey: Record<string, string> = {
            srden: "SR. DEN",
            srdfm: "SR. DFM",
            srdcm: "SR. DCM",
            dyccm: "DYCCM",
            drm: "DRM",
        };

        const toIsoDate = (dateValue: string) => {
            const raw = String(dateValue || "").trim();
            const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
            if (!match) return null;
            const day = match[1].padStart(2, "0");
            const month = match[2].padStart(2, "0");
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            return `${year}-${month}-${day}`;
        };

        const flowWithMetadata = Array.isArray(processedData?.right_side_flow)
            ? processedData.right_side_flow.map((item: any, index: number) => {
                  const designationKey = normalizeDesignation(item?.designation);
                  const isMatchedTarget = targetDesignations.has(designationKey);
                  return {
                      sequenceNo: index + 1,
                      designationRaw: item?.designation ?? null,
                      designationNormalized: designationKey || null,
                      designationCanonical:
                          canonicalDesignationByKey[designationKey] ??
                          item?.designation ??
                          null,
                      actionDateRaw: item?.date ?? null,
                      actionDate: toIsoDate(item?.date),
                      actionTime: item?.time ?? null,
                      isMatchedTarget,
                      matchedTargetKey: isMatchedTarget ? designationKey : null,
                      dropReason: isMatchedTarget ? null : "not_in_target_designation_set"
                  };
              })
            : [];

        const filteredDateTime = flowWithMetadata
                  .filter((item: any) => item.isMatchedTarget)
                  .map((item: any) => ({
                      designation: item.designationCanonical,
                      date: item.actionDateRaw,
                      time: item.actionTime
                  }))
                  .filter((item: any, index: number, arr: any[]) => {
                      const key = `${item.designation}|${item.date}|${item.time}`;
                      return arr.findIndex((x: any) => `${x.designation}|${x.date}|${x.time}` === key) === index;
                  });

        console.log("Filtered Date/Time:", filteredDateTime);

        const dbWrite = await persistVettingData(processedData, flowWithMetadata);

        context.res = {
            status: 200,
            body: {
                ...processedData,
                filteredDateTime,
                dbWrite
            }
        };

    } catch (error) {
        context.res = {
            status: 500,
            body: {
                error: "Failed to process data",
                details: error.message
            }
        };
    }
};
export default httpTrigger; 
