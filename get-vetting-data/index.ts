import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import {getVettingData} from '../src/service/vetting.service';

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {

    try {
        console.log("Fetching vetting data");
        const vettingData = await getVettingData();
        console.log("returning to frontend")
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
