import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { getAggregateDelayData } from "../src/service/vetting.service";

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
    try {
        const queryPlanhead = (req.query as any)?.planhead ?? (req.query as any)?.planHead;
        const bodyPlanhead = (req.body as any)?.planhead ?? (req.body as any)?.planHead;
        const planhead = String(queryPlanhead ?? bodyPlanhead ?? "").trim() || null;
        const queryWorkhead =
            (req.query as any)?.workhead ??
            (req.query as any)?.workHead ??
            (req.query as any)?.workname;
        const bodyWorkhead =
            (req.body as any)?.workhead ??
            (req.body as any)?.workHead ??
            (req.body as any)?.workname;
        const workhead = String(queryWorkhead ?? bodyWorkhead ?? "").trim() || null;
        const queryStrict = (req.query as any)?.strict;
        const bodyStrict = (req.body as any)?.strict;
        const strictRaw = String(queryStrict ?? bodyStrict ?? "true").trim().toLowerCase();
        const strict = !(strictRaw === "false" || strictRaw === "0" || strictRaw === "no");

        const delays = await getAggregateDelayData(planhead, workhead, strict);
        const hasRequestedFilter = Boolean(planhead || workhead);
        const noCaseMatch = !delays?.meta?.selectedPlanhead && !delays?.meta?.flowUuid;

        if (hasRequestedFilter && noCaseMatch) {
            context.res = {
                status: 404,
                body: {
                    error: "No matching vetting case found for provided planHead/workHead",
                    delays,
                },
            };
            return;
        }

        context.res = {
            status: 200,
            body: {
                delays,
            },
        };
    } catch (error: any) {
        context.res = {
            status: 500,
            body: {
                error: "Failed to process data",
                details: error.message,
            },
        };
    }
};

export default httpTrigger;
