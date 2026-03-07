import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import DocumentMaster from "../src/Model/DocumentMaster.model";

import { getTableData, getMasterStatus, getLatestMaster } from "../src/service/vetting.service";

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
    const traceId = `MST-${Date.now()}`;

    try {
        if (req.method === "GET") {
            const querySNo = req.query.sNo;
            const isLatest = req.query.latest === "true";

            if (isLatest) {
                console.log(`[${traceId}] Fetching latest Master session`);
                const master = await getLatestMaster();
                context.res = {
                    status: master ? 200 : 404,
                    body: master || { error: "No master records found" }
                };
                return;
            }

            if (querySNo) {
                console.log(`[${traceId}] Fetching status for Master S.No: ${querySNo}`);
                const master = await getMasterStatus(querySNo);
                context.res = {
                    status: master ? 200 : 404,
                    body: master || { error: "Master record not found" }
                };
                return;
            }

            console.log(`[${traceId}] Fetching all master table data`);
            const data = await getTableData();
            context.res = {
                status: 200,
                body: data
            };
            return;
        }

        const sNo = Math.floor(100000000 + Math.random() * 900000000).toString();
        console.log(`[${traceId}] Creating new Master record with S.No: ${sNo}`);

        const master = await DocumentMaster.create({
            s_no: sNo
        }) as any;

        context.res = {
            status: 201,
            body: {
                s_no: master.s_no
            }
        };
    } catch (error: any) {
        console.error(`[${traceId}] Master operation failed`, error);
        context.res = {
            status: 500,
            body: {
                error: "Failed to process master request",
                details: error.message
            }
        };
    }
};

export default httpTrigger;
