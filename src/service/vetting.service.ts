import WorkVettingDesignationFlow from "../Model/WorkVettingDesignationFlow.model";
import WorkVettingDesignationFlowItem from "../Model/WorkVettingDesignationFlowItem.model";
import sequelize from "../config/sequelize";

export type DbWriteResult = {
    saved: boolean;
    caseUuid?: string;
    totalFlowRows?: number;
    matchedRows?: number;
    error?: string;
};

export async function persistVettingData(
    processedData: any,
    flowWithMetadata: any[]
): Promise<DbWriteResult> {
    console.log("Persisting vetting data to the database...");
    const transaction = await sequelize.transaction();
    try {
        const dataToInsert = {
            planhead: processedData?.plan_head ?? null,
            workname: processedData?.work_name ?? null,
        };

        const flowRow = await WorkVettingDesignationFlow.create(dataToInsert, { transaction });

        if (Array.isArray(flowWithMetadata) && flowWithMetadata.length > 0) {
            await WorkVettingDesignationFlowItem.bulkCreate(
                flowWithMetadata.map((flow: any) => ({
                    flowUuid: (flowRow as any).uuid,
                    sequenceNo: flow.sequenceNo,
                    designation: flow.designationCanonical,
                    department: flow.department ?? null,                      
                    actionDate: flow.actionDate,
                    actionTime: flow.actionTime,
                    isCurrentPending: false,
                })),
                { transaction }
            );
        }
        console.log("Committing transaction...");

        await transaction.commit();
        console.log("Vetting data successfully saved to the database.");
        return {
            saved: true,
            caseUuid: (flowRow as any).uuid,
            totalFlowRows: flowWithMetadata.length,
            matchedRows: flowWithMetadata.filter((x: any) => x.isMatchedTarget).length,
        };
    } catch (Error: any) {
        await transaction.rollback();
        console.error("Error Message:", Error);
        console.error("Rolling back transaction...");
        return {
            saved: false,
            error: Error?.message || "Failed to save vetting data",
        };
    }
}

export async function getVettingData(): Promise<any> {
    try {
        const flowData = await WorkVettingDesignationFlow.findAll({
            raw: true,
        }); 
        const designationflowData = await WorkVettingDesignationFlowItem.findAll({
            raw: true,
        }); 
        const data = {
            docdata: flowData,
            flowdata: designationflowData
        }
        console.log("Fetched vetting data from the database:", data);
        return data;
    } catch (error: any) {
        console.error("Error fetching vetting data:", error);
        throw new Error("Failed to fetch vetting data");
    }
}
