import WorkVettingDesignationFlow from "../Model/WorkVettingDesignationFlow.model";
import WorkVettingDesignationFlowItem from "../Model/WorkVettingDesignationFlowItem.model";
import GmApprovalData from "../Model/GmApprovalData.model";
import DocumentMaster from "../Model/DocumentMaster.model";
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

// << ADVANCED NORMALIZATION START >>
// Purpose: Strip common OCR 'junk' like markers, labels, and UI text 
// that frequently gets accidentally extracted from the portal's UI/PDF headers.
export function normalizeText(value?: string | null): string {
    let raw = String(value || "").toUpperCase();

    // 1. Remove common UI/Header labels AND standard project prefixes
    const junkPatterns = [
        "VIEW FULL SCREEN",
        "WORK NAME",
        "PLAN HEAD",
        "PROJECT NAME",
        "PROPOSAL FOR",
        "CONSTRUCTION OF",
        "PROV OF",
        "ESTIMATE FOR",
        "BACK TO",
        "SR NO",
        "S.NO.",
        "HEAD:",
        "PH:",
        "_"
    ];

    junkPatterns.forEach(pattern => {
        raw = raw.split(pattern).join("");
    });

    // 2. Clean up characters and extra spaces
    return raw
        .replace(/\s+/g, " ")
        .replace(/[^A-Z0-9 ]/g, "")
        .trim();
}

export function isPlanheadMatch(gmPh: string | null, targetPhNorm: string | null): boolean {
    if (!targetPhNorm) return true;
    if (!gmPh) return false;
    const gmPhRaw = String(gmPh).toUpperCase();
    const numbersInGm = (gmPhRaw.match(/\d+/g) || []) as string[];
    return numbersInGm.includes(targetPhNorm);
}

export function normalizePlanhead(value?: string | null): string {
    const raw = String(value || "").toUpperCase();

    // Try to find the numeric part first (e.g., "PH-17" -> "17")
    const match = raw.match(/\d+/);
    if (match) return match[0];

    // Fallback: strip everything except alphanumeric
    return raw.replace(/[^0-9]/g, "");
}
// << ADVANCED NORMALIZATION END >>

function extractPlanheadKey(value?: string | null): string {
    const raw = String(value || "").toUpperCase();
    const m = raw.match(/(\d{4,})\s*\/\s*(\d{4})/);
    if (!m) return "";
    return `${m[1]}/${m[2]}`;
}

/**
 * FUZZY MATCHING LOGIC:
 * Compares two strings by breaking them into words and checking how many words they share.
 * This handles differences like "HQ/Person" matching "HQ/Personnel dep."
 */
function calculateSimilarity(str1: string, str2: string): number {
    const s1 = normalizeText(str1).split(" ").filter(w => w.length > 2);
    const s2 = normalizeText(str2).split(" ").filter(w => w.length > 2);

    if (s1.length === 0 || s2.length === 0) return 0;

    let matches = 0;
    const larger = s1.length >= s2.length ? s1 : s2;
    const smaller = s1.length < s2.length ? s1 : s2;

    for (const word of smaller) {
        if (larger.some(lw => lw.includes(word) || word.includes(lw))) {
            matches++;
        }
    }

    return matches / smaller.length;
}

export async function persistVettingData(
    processedData: any,
    flowWithMetadata: any[],
    sNo: string,
    fileName?: string | null,
    fileUrl?: string | null
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
            s_no: sNo,
            planhead: processedData?.plan_head ?? null,
            workname: processedData?.work_name ?? null,
        };

        // DUPLICATE CHECK APPLIED
        const currentWorkNorm = normalizeText(dataToInsert.workname);
        const currentPHNorm = normalizePlanhead(dataToInsert.planhead);

        // << SMARTER PURGE START >>
        // We only purge if the S.No matches AND the workname is similar (normalized).
        // This allows multiple DIFFERENT works in the same session (S.No) to coexist!
        const flowsInSession = await WorkVettingDesignationFlow.findAll({
            where: {
                [Op.or]: [
                    { s_no: sNo },
                    { s_no: sNo.trim() }
                ]
            },
            transaction
        });

        const flowsToPurge = flowsInSession.filter((f: any) => normalizeText(f.workname) === currentWorkNorm);
        // << SMARTER PURGE END >>

        if (flowsToPurge.length > 0) {
            console.log(`[FIN][DB] Hard Reset Triggered for S.No: [${sNo}]. Found ${flowsToPurge.length} existing record(s) to purge.`);
            const flowUuids = flowsToPurge.map((f: any) => f.uuid);
            await WorkVettingDesignationFlowItem.destroy({ where: { flowUuid: { [Op.in]: flowUuids } }, transaction });
            await WorkVettingDesignationFlow.destroy({
                where: { uuid: { [Op.in]: flowUuids } },
                transaction
            });
            console.log(`[FIN][DB] Purge Success. Old records cleared.`);
        }

        // DUPLICATE CHECK: Only block if the work exists on a DIFFERENT S.No
        const duplicateOnOtherSNo = await WorkVettingDesignationFlow.findOne({
            where: {
                [Op.and]: [
                    sequelize.where(sequelize.fn('UPPER', sequelize.col('planhead')), currentPHNorm),
                    sequelize.where(sequelize.fn('UPPER', sequelize.col('workname')), currentWorkNorm),
                    { s_no: { [Op.ne]: sNo } } // Ignore the current session
                ]
            },
            transaction
        });

        if (duplicateOnOtherSNo) {
            console.log("[FIN][DB] Duplicate detected on a different S.No! Stopping save.");
            await transaction.rollback();
            return {
                saved: false,
                error: "DUPLICATE_DOCUMENT: This work item has already been uploaded in another session."
            };
        }
        // << REPLACE LOGIC END >>

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
    } catch (err: any) {
        await transaction.rollback();
        console.error("[FIN][DB] Error Message:", err);
        console.error("[FIN][DB] Rolling back transaction...");
        return {
            saved: false,
            error: err?.message || "Failed to save vetting data",
        };
    }
}

export async function getVettingData(): Promise<any> {
    try {
        console.log("[FIN][DB] Fetching unique vetting data using DB-level optimization...");

        // Use DB-level grouping to avoid fetching 500k rows
        const uniqueWorks = await WorkVettingDesignationFlow.findAll({
            attributes: [
                's_no',
                'planhead',
                'workname',
                [sequelize.fn('MAX', sequelize.col('uuid')), 'uuid'],
                [sequelize.fn('MAX', sequelize.col('createdAt')), 'createdAt']
            ],
            group: ['s_no', 'planhead', 'workname'],
            order: [[sequelize.fn('MAX', sequelize.col('createdAt')), 'DESC']],
            limit: 5000, // Safety limit for dashboard
            raw: true
        });

        console.log(`[FIN][DB] Successfully fetched ${uniqueWorks.length} unique work items.`);

        return {
            docdata: uniqueWorks,
            flowdata: []
        };
    } catch (error: any) {
        console.error("Error fetching vetting data:", error);
        throw new Error("Failed to fetch vetting data");
    }
}

export async function getAggregateDelayData(
    planhead?: string | null,
    workhead?: string | null,
    sNo?: string | null,
    strictMatch: boolean = true
): Promise<any> {
    try {
        const requestedPlanhead = String(planhead || "").trim() || null;
        const requestedWorkheadNorm = normalizeText(workhead);

        // 1. Optimized Fetch: Only get works for the requested planhead
        const whereClause = requestedPlanhead ? { planhead: requestedPlanhead } : {};
        const worksInPh = await WorkVettingDesignationFlow.findAll({
            where: whereClause,
            attributes: ['uuid', 's_no', 'planhead', 'workname'],
            group: ['uuid', 's_no', 'planhead', 'workname'],
            raw: true
        });

        if (worksInPh.length === 0) return null;

        const isSingleWork = Boolean(requestedWorkheadNorm || sNo);
        const gmWhere: any = { gmApprovalDate: { [Op.ne]: null } };
        if (sNo) gmWhere.s_no = sNo;
        else if (requestedPlanhead) gmWhere.planhead = requestedPlanhead;

        const gmCandidates: any[] = await GmApprovalData.findAll({
            where: gmWhere,
            attributes: ['s_no', 'planhead', 'workname', 'gmApprovalDate', 'gmApprovalTime', 'sanctioned_cost', 'division', 'allocation', 'executing_agency'],
            raw: true,
        });

        if (isSingleWork) {
            const target = worksInPh.find(x => {
                const masterMatch = sNo ? String((x as any).s_no) === String(sNo) : true;
                const nameMatch = requestedWorkheadNorm ? normalizeText((x as any).workname) === requestedWorkheadNorm : true;
                return masterMatch && nameMatch;
            }) || worksInPh[0];

            const flowItems = await WorkVettingDesignationFlowItem.findAll({
                where: { flowUuid: (target as any).uuid },
                attributes: ['designation', 'department', 'actionDate', 'actionTime', 'sequenceNo'],
                order: [["sequenceNo", "ASC"]],
                raw: true,
            });

            const targetWorknameNorm = normalizeText((target as any).workname);
            const targetPHNorm = normalizePlanhead((target as any).planhead);

            let matchedGm = gmCandidates.find(g =>
                isPlanheadMatch(g.planhead, targetPHNorm) &&
                normalizeText(g.workname) === targetWorknameNorm
            );

            if (!matchedGm && targetWorknameNorm) {
                let bestSim = 0;
                for (const candidate of gmCandidates) {
                    if (isPlanheadMatch(candidate.planhead, targetPHNorm)) {
                        const sim = calculateSimilarity((target as any).workname, candidate?.workname || "");
                        if (sim > 0.50 && sim > bestSim) {
                            bestSim = sim;
                            matchedGm = candidate;
                        }
                    }
                }
            }

            const delays = calculateBucketDelay(
                flowItems as any[],
                matchedGm?.gmApprovalDate ?? null,
                matchedGm?.gmApprovalTime ?? null
            );

            return {
                workname: (target as any).workname,
                planhead: (target as any).planhead,
                ...delays,
                meta: {
                    gmMatched: !!matchedGm,
                    sanctioned_cost: matchedGm?.sanctioned_cost ?? null,
                    division: matchedGm?.division ?? null,
                    allocation: matchedGm?.allocation ?? null,
                    executing_agency: matchedGm?.executing_agency ?? null,
                    gmApprovalDate: matchedGm?.gmApprovalDate ?? null
                }
            };
        }

        // AVERAGE MODE: Optimized with limit and count safety
        console.log(`[FIN][DELAY] Aggregating ${worksInPh.length} works...`);
        const workUuids = worksInPh.map((w: any) => w.uuid);

        // Split into chunks if there are too many UUIDs to avoid "SQL string too long" errors
        const CHUNK_SIZE = 1000;
        let allFlowItems: any[] = [];
        for (let i = 0; i < workUuids.length; i += CHUNK_SIZE) {
            const chunk = workUuids.slice(i, i + CHUNK_SIZE);
            const items = await WorkVettingDesignationFlowItem.findAll({
                where: { flowUuid: { [Op.in]: chunk } },
                attributes: ['flowUuid', 'designation', 'department', 'actionDate', 'actionTime', 'sequenceNo'],
                raw: true,
            });
            allFlowItems = allFlowItems.concat(items);
        }

        const flowMap = new Map<string, any[]>();
        allFlowItems.forEach((item: any) => {
            const list = flowMap.get(item.flowUuid) || [];
            list.push(item);
            flowMap.set(item.flowUuid, list);
        });

        const gmMap = new Map<string, any[]>();
        for (const g of gmCandidates) {
            const phKey = normalizePlanhead(g.planhead);
            const list = gmMap.get(phKey) || [];
            list.push(g);
            gmMap.set(phKey, list);
        }

        let totalExec = 0, totalFin = 0, totalHq = 0;
        let countExec = 0, countFin = 0, countHq = 0;
        let totalCycleSum = 0;
        let countCycle = 0;

        for (const work of worksInPh) {
            const flowItems = flowMap.get((work as any).uuid) || [];
            if (flowItems.length === 0) continue;

            const workNameNorm = normalizeText((work as any).workname);
            const workPHNorm = normalizePlanhead((work as any).planhead);
            const workSNo = (work as any).s_no;

            const phCandidates = gmMap.get(workPHNorm) || [];

            let matchedGm = phCandidates.find(g =>
                (workSNo && String(g.s_no) === String(workSNo)) &&
                normalizeText(g.workname) === workNameNorm
            );

            if (!matchedGm) {
                matchedGm = phCandidates.find(g => normalizeText(g.workname) === workNameNorm);
            }

            if (!matchedGm && workNameNorm) {
                let bestSim = 0;
                for (const candidate of phCandidates) {
                    const sim = calculateSimilarity((work as any).workname, candidate?.workname || "");
                    if (sim > 0.60 && sim > bestSim) {
                        bestSim = sim;
                        matchedGm = candidate;
                    }
                }
            }

            const delays = calculateBucketDelay(
                flowItems,
                matchedGm?.gmApprovalDate ?? null,
                matchedGm?.gmApprovalTime ?? null
            );

            if (delays.markers.gmApprovalAt && delays.markers.firstDesignationAt) {
                totalExec += (delays.executiveDelayDays || 0);
                countExec++;
            }
            if (delays.markers.drmLastAt && delays.markers.srdfmLastAt) {
                totalFin += (delays.financeDelayDays || 0);
                countFin++;
            }
            if (delays.markers.nwrBeforeLastAt && delays.markers.lastDesignationAt) {
                totalHq += (delays.hqDelayDays || 0);
                countHq++;
            }
            if (delays.markers.firstDesignationAt && delays.markers.lastDesignationAt) {
                totalCycleSum += (delays.totalCycleDays || 0);
                countCycle++;
            }
        }

        const avgExec = countExec > 0 ? Math.round(totalExec / countExec) : 0;
        const avgFin = countFin > 0 ? Math.round(totalFin / countFin) : 0;
        const avgHq = countHq > 0 ? Math.round(totalHq / countHq) : 0;
        const avgTotalCycle = countCycle > 0 ? Math.round(totalCycleSum / countCycle) : (avgExec + avgFin + avgHq);

        return {
            workname: "Averages for " + (requestedPlanhead || "All"),
            planhead: requestedPlanhead,
            totalWorks: worksInPh.length,
            totalCycleDays: avgTotalCycle,
            executiveDelayDays: avgExec,
            financeDelayDays: avgFin,
            hqDelayDays: avgHq,
            meta: {
                aggregated: true,
                divisor: worksInPh.length,
                counts: { exec: countExec, fin: countFin, hq: countHq, total: countCycle }
            }
        };

    } catch (error: any) {
        console.error("Aggregation failed", error);
        throw new Error("Failed to process delay data");
    }
}

export async function getTableData(cursor?: string | null, limitStr?: string): Promise<any> {
    try {
        const limit = Math.max(1, parseInt(limitStr || "10"));

        const whereClause: any = {};
        if (cursor) {
            // Use createdAt as the cursor for descending order
            whereClause.createdAt = { [Op.lt]: new Date(cursor) };
        }

        console.log(`[DB] Querying DocumentMaster... limit=${limit}, cursor=${cursor || 'none'}`);

        const { count, rows } = await DocumentMaster.findAndCountAll({
            where: whereClause,
            limit,
            order: [["createdAt", "DESC"]],
        });

        console.log(`[DB] DocumentMaster results: count=${count}, rows=${rows.length}`);

        const results = rows.map((master: any) => {
            const data = master.toJSON() as any;
            const required = ['drm_app_uploaded', 'dg_letter_uploaded', 'estimate_uploaded', 'func_distribution_uploaded', 'top_sheet_uploaded'];
            const uploadedCount = required.filter(key => data[key]).length;
            return {
                ...data,
                isReadyForVetting: uploadedCount === required.length,
                completionCount: `${uploadedCount}/${required.length}`
            };
        });

        // The next cursor is the createdAt of the last element in the current result set
        const nextCursor = results.length > 0 ? results[results.length - 1].createdAt : null;

        return {
            total: count,
            limit,
            nextCursor,
            data: results
        };
    } catch (error: any) {
        console.error("Error in getTableData service:", error);
        throw new Error("Failed to fetch table data");
    }
}

export async function getMasterStatus(sNo: string): Promise<any> {
    try {
        const master = await DocumentMaster.findByPk(sNo);
        if (!master) return null;

        const data = master.toJSON() as any;
        const required = ['drm_app_uploaded', 'dg_letter_uploaded', 'estimate_uploaded', 'func_distribution_uploaded', 'top_sheet_uploaded'];
        const uploadedCount = required.filter(key => data[key]).length;

        return {
            ...data,
            isReadyForVetting: uploadedCount === required.length,
            completionCount: `${uploadedCount}/${required.length}`
        };
    } catch (error: any) {
        console.error("Error in getMasterStatus:", error);
        throw new Error("Failed to fetch master status");
    }
}

export async function getLatestMaster(): Promise<any> {
    try {
        const master = await DocumentMaster.findOne({
            order: [["createdAt", "DESC"]]
        });
        return master;
    } catch (error: any) {
        console.error("Error in getLatestMaster:", error);
        throw new Error("Failed to fetch latest master");
    }
}
