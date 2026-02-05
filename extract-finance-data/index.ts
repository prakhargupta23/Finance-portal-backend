import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { getfiledata } from '../src/service/financedocdata.service';

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
        context.res = {
            status: 200,
            body: processedData
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