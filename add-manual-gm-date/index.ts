import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { addManualGmDate } from "../src/service/vetting.service";

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
    try {
        const { planhead, workname, s_no, manualGmDate, role } = req.body || {};

        if (!s_no || !manualGmDate) {
            context.res = {
                status: 400,
                body: { error: "Missing required fields: s_no and manualGmDate" }
            };
            return;
        }

        const result = await addManualGmDate(
            s_no,
            planhead || null,
            workname || null,
            manualGmDate,
            role || 'Unknown'
        );

        context.res = {
            status: 200,
            body: {
                message: "Manual GM Date override saved successfully.",
                data: result
            }
        };
    } catch (error: any) {
        context.res = {
            status: 500,
            body: {
                error: "Failed to process override",
                details: error.message,
            },
        };
    }
};

export default httpTrigger;
