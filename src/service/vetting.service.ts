import WorkVettingDesignationFlow from "../Model/WorkVettingDesignationFlow.model";
import WorkVettingDesignationFlowItem from "../Model/WorkVettingDesignationFlowItem.model";
import GmApprovalData from "../Model/GmApprovalData.models";
import sequelize from "../config/sequelize";
import { calculateBucketDelay } from "./delay.service";
import { Op } from "sequelize";

export type DbWriteResult = {
    saved: boolean;
    caseUuid?: string;
    totalFlowRows?: number;
    matchedRows?: number;
    error?: string;
};

function normalizePlanhead(value?: string | null): string {
    return String(value || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function normalizeText(value?: string | null): string {
    return String(value || "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .replace(/[^A-Z0-9 ]/g, "")
        .trim();
}

function extractPlanheadKey(value?: string | null): string {
    const raw = String(value || "").toUpperCase();
    const m = raw.match(/(\d{4,})\s*\/\s*(\d{4})/);
    if (!m) return "";
    return `${m[1]}/${m[2]}`;
}

export async function persistVettingData(
    processedData: any,
    flowWithMetadata: any[]
): Promise<DbWriteResult> {
    console.log("[FIN][DB] Persisting vetting data to the database...");
    const transaction = await sequelize.transaction();
    try {
        console.log("[FIN][DB] Incoming payload summary", {
            planHead: processedData?.plan_head ?? null,
            hasWorkName: Boolean(processedData?.work_name),
            totalFlowRows: Array.isArray(flowWithMetadata) ? flowWithMetadata.length : 0,
            matchedRows: Array.isArray(flowWithMetadata)
                ? flowWithMetadata.filter((x: any) => x.isMatchedTarget).length
                : 0
        });
        const dataToInsert = {
            planhead: processedData?.plan_head ?? null,
            workname: processedData?.work_name ?? null,
        };

        const flowRow = await WorkVettingDesignationFlow.create(dataToInsert, { transaction });
        console.log("[FIN][DB] Header row inserted", { caseUuid: (flowRow as any).uuid });

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
        console.log("[FIN][DB] Committing transaction...");

        await transaction.commit();
        console.log("[FIN][DB] Vetting data successfully saved to the database.");
        return {
            saved: true,
            caseUuid: (flowRow as any).uuid,
            totalFlowRows: flowWithMetadata.length,
            matchedRows: flowWithMetadata.filter((x: any) => x.isMatchedTarget).length,
        };
    } catch (Error: any) {
        await transaction.rollback();
        console.error("[FIN][DB] Error Message:", Error);
        console.error("[FIN][DB] Rolling back transaction...");
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

export async function getAggregateDelayData(
    planhead?: string | null,
    workhead?: string | null,
    strictMatch: boolean = true
): Promise<{
    executiveDelayDays: number;
    financeDelayDays: number;
    hqDelayDays: number;
    meta: {
        requestedPlanhead: string | null;
        requestedWorkhead: string | null;
        selectedPlanhead: string | null;
        selectedWorkhead: string | null;
        matchStrategy: string | null;
        flowUuid: string | null;
        flowItemsCount: number;
        gmMatched: boolean;
        gmApprovalDate: string | null;
        gmApprovalTime: string | null;
        markers: any;
    };
}> {
    try {
        const requestedPlanhead = String(planhead || "").trim() || null;
        const requestedWorkhead = String(workhead || "").trim() || null;
        const requestedPlanheadNorm = normalizePlanhead(requestedPlanhead);
        const requestedWorkheadNorm = normalizeText(requestedWorkhead);
        const requestedPlanheadKey = extractPlanheadKey(requestedPlanhead);

        let selectedFlow: any = null;
        let matchStrategy: string | null = null;

        if (requestedPlanheadNorm || requestedWorkheadNorm) {
            const flowCandidates: any[] = await WorkVettingDesignationFlow.findAll({
                order: [["createdAt", "DESC"]],
                limit: 1000,
                raw: true,
            });

            selectedFlow =
                flowCandidates.find((x: any) => {
                    const planOk = requestedPlanheadNorm
                        ? normalizePlanhead(x?.planhead) === requestedPlanheadNorm
                        : true;
                    const workOk = requestedWorkheadNorm
                        ? normalizeText(x?.workname) === requestedWorkheadNorm
                        : true;
                    return planOk && workOk;
                }) || null;
            if (selectedFlow) {
                if (requestedPlanheadNorm && requestedWorkheadNorm) {
                    matchStrategy = "exact_planhead_and_workhead";
                } else if (requestedPlanheadNorm) {
                    matchStrategy = "exact_planhead";
                } else if (requestedWorkheadNorm) {
                    matchStrategy = "exact_workhead";
                }
            }

            if (!selectedFlow && requestedPlanheadNorm) {
                selectedFlow =
                    flowCandidates.find(
                        (x: any) => normalizePlanhead(x?.planhead) === requestedPlanheadNorm
                    ) || null;
                if (selectedFlow) matchStrategy = "exact_planhead";
            }

            if (!selectedFlow && requestedWorkheadNorm) {
                selectedFlow =
                    flowCandidates.find(
                        (x: any) => normalizeText(x?.workname) === requestedWorkheadNorm
                    ) || null;
                if (selectedFlow) matchStrategy = "exact_workhead";
            }

            if (!selectedFlow && requestedPlanheadNorm) {
                selectedFlow =
                    flowCandidates.find((x: any) => {
                        const plan = normalizePlanhead(x?.planhead);
                        return (
                            plan.includes(requestedPlanheadNorm) ||
                            requestedPlanheadNorm.includes(plan)
                        );
                    }) || null;
                if (selectedFlow) matchStrategy = "partial_planhead";
            }

            if (!selectedFlow && requestedPlanheadKey) {
                selectedFlow =
                    flowCandidates.find((x: any) =>
                        String(x?.planhead || "").toUpperCase().includes(requestedPlanheadKey)
                    ) || null;
                if (selectedFlow) matchStrategy = "planhead_key";
            }
        } else {
            selectedFlow = await WorkVettingDesignationFlow.findOne({
                order: [["createdAt", "DESC"]],
                raw: true,
            });
            if (selectedFlow) matchStrategy = "latest_flow";
        }

        if (!selectedFlow?.uuid) {
            return {
                executiveDelayDays: 0,
                financeDelayDays: 0,
                hqDelayDays: 0,
                meta: {
                    requestedPlanhead,
                    requestedWorkhead,
                    selectedPlanhead: null,
                    selectedWorkhead: null,
                    matchStrategy: strictMatch ? "strict_no_flow_match" : null,
                    flowUuid: null,
                    flowItemsCount: 0,
                    gmMatched: false,
                    gmApprovalDate: null,
                    gmApprovalTime: null,
                    markers: null,
                },
            };
        }

        const flowItems = await WorkVettingDesignationFlowItem.findAll({
            where: { flowUuid: selectedFlow.uuid },
            order: [["sequenceNo", "ASC"]],
            raw: true,
        });

        const flowPlanhead = String(selectedFlow.planhead || "").trim();
        const flowWorkhead = String(selectedFlow.workname || "").trim();
        const flowPlanheadNorm = normalizePlanhead(flowPlanhead);
        const flowWorkheadNorm = normalizeText(flowWorkhead);
        const flowPlanheadKey = extractPlanheadKey(flowPlanhead);

        let matchedGmApproval: any = null;
        if (flowPlanhead || flowWorkhead) {
            const gmCandidates: any[] = await GmApprovalData.findAll({
                where: {
                    gmApprovalDate: {
                        [Op.ne]: null,
                    },
                },
                order: [
                    ["createdAt", "DESC"],
                    ["gmApprovalDate", "DESC"],
                    ["gmApprovalTime", "DESC"],
                ],
                limit: 500,
                raw: true,
            });

            matchedGmApproval =
                gmCandidates.find((x: any) => {
                    const planOk = flowPlanheadNorm
                        ? normalizePlanhead(x?.planhead) === flowPlanheadNorm
                        : true;
                    const workOk = flowWorkheadNorm
                        ? normalizeText(x?.workname) === flowWorkheadNorm
                        : true;
                    return planOk && workOk;
                }) || null;

            if (!matchedGmApproval && flowPlanheadNorm) {
                matchedGmApproval =
                    gmCandidates.find(
                        (x: any) => normalizePlanhead(x?.planhead) === flowPlanheadNorm
                    ) || null;
            }

            if (!matchedGmApproval && flowWorkheadNorm) {
                matchedGmApproval =
                    gmCandidates.find(
                        (x: any) => normalizeText(x?.workname) === flowWorkheadNorm
                    ) || null;
            }

            if (!matchedGmApproval && flowPlanheadNorm) {
                matchedGmApproval =
                    gmCandidates.find((x: any) => {
                        const plan = normalizePlanhead(x?.planhead);
                        return (
                            plan.includes(flowPlanheadNorm) ||
                            flowPlanheadNorm.includes(plan)
                        );
                    }) || null;
            }

            if (!matchedGmApproval && flowPlanheadKey) {
                matchedGmApproval =
                    gmCandidates.find((x: any) =>
                        String(x?.planhead || "").toUpperCase().includes(flowPlanheadKey)
                    ) || null;
            }
        }

        if (!matchedGmApproval && !requestedPlanheadNorm && !requestedWorkheadNorm && !strictMatch) {
            matchedGmApproval = await GmApprovalData.findOne({
                where: {
                    gmApprovalDate: {
                        [Op.ne]: null,
                    },
                },
                order: [
                    ["createdAt", "DESC"],
                    ["gmApprovalDate", "DESC"],
                    ["gmApprovalTime", "DESC"],
                ],
                raw: true,
            });
        }

        const delays = calculateBucketDelay(
            flowItems as any[],
            matchedGmApproval?.gmApprovalDate ?? null,
            matchedGmApproval?.gmApprovalTime ?? null
        );

        return {
            executiveDelayDays: delays.executiveDelayDays ?? 0,
            financeDelayDays: delays.financeDelayDays ?? 0,
            hqDelayDays: delays.hqDelayDays ?? 0,
            meta: {
                requestedPlanhead,
                requestedWorkhead,
                selectedPlanhead: flowPlanhead || null,
                selectedWorkhead: flowWorkhead || null,
                matchStrategy,
                flowUuid: selectedFlow.uuid || null,
                flowItemsCount: flowItems.length,
                gmMatched: Boolean(matchedGmApproval?.gmApprovalDate),
                gmApprovalDate: matchedGmApproval?.gmApprovalDate ?? null,
                gmApprovalTime: matchedGmApproval?.gmApprovalTime ?? null,
                markers: delays?.markers ?? null,
            },
        };
    } catch (error: any) {
        console.error("Error fetching aggregate delay data:", error);
        throw new Error("Failed to fetch aggregate delay data");
    }
}
