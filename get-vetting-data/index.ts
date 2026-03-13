import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { getVettingData } from '../src/service/vetting.service';

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {

    try {
        const startDate = (req.query as any)?.startDate || (req.body as any)?.startDate || null;
        const endDate = (req.query as any)?.endDate || (req.body as any)?.endDate || null;

        const vettingData = await getVettingData(startDate, endDate);

        context.res = {
            status: 200,
            body: {
                vettingData
            }
        };

    } catch (error: any) {
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