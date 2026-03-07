import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { getfiledata } from '../src/service/financedocdata.service';
import { persistVettingData } from '../src/service/vetting.service';
import DocumentMaster from '../src/Model/DocumentMaster.model';

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {

    const traceId = `fin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
        const { prompt, fileBase64, sNo, masterId, fileName, fileUrl, docLabel } = req.body || {};

        if (!prompt || !fileBase64) {
            context.res = {
                status: 400,
                body: { error: "Missing required fields: prompt and file" }
            };
            return;
        }

        console.log(`[${traceId}] Finance data fetching function reached for S.No: ${sNo || masterId}`);

        const processedData = await getfiledata(prompt, fileBase64);
        console.log(`[${traceId}] Processed Data:`, processedData);

        /* -------------------------------
           NORMALIZE DESIGNATION
        --------------------------------*/
        const normalizeDesignation = (value: string) =>
            String(value || "")
                .toLowerCase()
                .replace(/\(.*?\)/g, "")
                .replace(/\./g, "")
                .replace(/\s+/g, "")
                .trim();

        /* -------------------------------
           TARGET DESIGNATIONS (Normalized)
        --------------------------------*/
        const targetDesignations = new Set([
            "srdcm",
            "sdee",
            "srden",
            "srdfm",
            "sofin2",
            "drm",
            "cepd",
            "ccm"
        ]);

        /* -------------------------------
           DATE NORMALIZER
        --------------------------------*/
        const toIsoDate = (dateValue: string) => {
            const raw = String(dateValue || "").trim();
            const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
            if (!match) return null;

            const day = match[1].padStart(2, "0");
            const month = match[2].padStart(2, "0");
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];

            return `${year}-${month}-${day}`;
        };

        /* -------------------------------
           SPLIT DESIGNATION & DEPARTMENT
        --------------------------------*/
        const splitDesignation = (value: string) => {
            const raw = String(value || "").trim();
            const parts = raw.split("/");
            const designation = parts[0]?.trim() || null;
            const department = parts[1]?.trim().toUpperCase() || null;
            return { designation, department };
        };

        /* -------------------------------
           FLOW WITH METADATA
        --------------------------------*/
        const flowWithMetadata = Array.isArray(processedData?.right_side_flow)
            ? processedData.right_side_flow.map((item: any, index: number) => {

                const { designation, department } = splitDesignation(item?.designation);

                const designationKey = normalizeDesignation(designation);
                const isMatchedTarget = targetDesignations.has(designationKey);

                return {
                    sequenceNo: index + 1,

                    designationRaw: item?.designation ?? null,
                    designationCanonical: designation,
                    designationNormalized: designationKey || null,

                    department,

                    actionDateRaw: item?.date ?? null,
                    actionDate: toIsoDate(item?.date),
                    actionTime: item?.time ?? null,

                    isMatchedTarget,
                    matchedTargetKey: isMatchedTarget ? designationKey : null,
                    dropReason: isMatchedTarget ? null : "not_in_target_designation_set"
                };
            })
            : [];

        /* -------------------------------
           FILTERED DATE TIME
        --------------------------------*/
        const filteredDateTime = flowWithMetadata
            .filter((item: any) => item.isMatchedTarget)
            .map((item: any) => ({
                designation: item.designationCanonical,
                department: item.department,
                date: item.actionDateRaw,
                time: item.actionTime
            }))
            .filter((item: any, index: number, arr: any[]) => {
                const key = `${item.designation}|${item.date}|${item.time}`;
                return arr.findIndex((x: any) =>
                    `${x.designation}|${x.date}|${x.time}` === key
                ) === index;
            });

        console.log(`[${traceId}] Filtered Date/Time:`, filteredDateTime);

        /* -------------------------------
           SAVE TO DATABASE
        --------------------------------*/
        let targetSNo = sNo || masterId;

        if (!targetSNo) {
            const fallbackSNo = Math.floor(100000000 + Math.random() * 900000000).toString();
            console.log(`[${traceId}] No s_no provided, creating fallback master with S.No: ${fallbackSNo}`);
            const master = await DocumentMaster.create({
                s_no: fallbackSNo
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
                console.log(`[${traceId}] Attempting DocumentMaster status update for ${docLabel} (S.No: ${targetSNo})`, updateData);
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

        const dbWrite = await persistVettingData(processedData, flowWithMetadata, targetSNo, fileName, fileUrl);

        context.res = {
            status: dbWrite.saved ? 200 : 409,
            body: {
                traceId,
                ...processedData,
                filteredDateTime,
                dbWrite
            }
        };

    } catch (error: any) {
        console.error(`[${traceId}] Finance extract failed`, error);
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