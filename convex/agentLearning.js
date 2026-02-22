"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectLearningInsights = exports.discoverPattern = exports.removePattern = exports.updatePattern = exports.createPattern = exports.recordTaskCompletion = exports.getBestAgentForTask = exports.getAgentWeaknesses = exports.getAgentStrengths = exports.listPatterns = exports.getAgentPerformance = void 0;
var values_1 = require("convex/values");
var server_1 = require("./_generated/server");
/**
 * Agent Learning System
 *
 * Tracks agent performance and learns from successes/failures
 * to improve task routing and assignment over time.
 *
 * Uses tables: agentPerformance, agentPatterns
 */
// ============================================================================
// QUERIES
// ============================================================================
exports.getAgentPerformance = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var perfRecords, totalCompleted, totalFailed, totalCost, byType, _i, perfRecords_1, rec;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agentPerformance")
                        .withIndex("by_agent", function (q) { return q.eq("agentId", args.agentId); })
                        .collect()];
                case 1:
                    perfRecords = _a.sent();
                    totalCompleted = perfRecords.reduce(function (s, r) { return s + r.successCount; }, 0);
                    totalFailed = perfRecords.reduce(function (s, r) { return s + r.failureCount; }, 0);
                    totalCost = perfRecords.reduce(function (s, r) { return s + r.avgCostUsd * r.totalTasksCompleted; }, 0);
                    byType = {};
                    for (_i = 0, perfRecords_1 = perfRecords; _i < perfRecords_1.length; _i++) {
                        rec = perfRecords_1[_i];
                        byType[rec.taskType] = {
                            completed: rec.successCount,
                            failed: rec.failureCount,
                            avgCost: rec.avgCostUsd,
                        };
                    }
                    return [2 /*return*/, {
                            agentId: args.agentId,
                            totalCompleted: totalCompleted,
                            totalFailed: totalFailed,
                            successRate: totalCompleted + totalFailed > 0
                                ? totalCompleted / (totalCompleted + totalFailed)
                                : 0,
                            avgCost: totalCompleted > 0 ? totalCost / totalCompleted : 0,
                            totalCost: totalCost,
                            byType: byType,
                        }];
            }
        });
    }); },
});
/** List all discovered patterns, optionally filtered by project */
exports.listPatterns = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!args.projectId) return [3 /*break*/, 2];
                    return [4 /*yield*/, ctx.db
                            .query("agentPatterns")
                            .withIndex("by_project", function (q) { return q.eq("projectId", args.projectId); })
                            .collect()];
                case 1: return [2 /*return*/, _a.sent()];
                case 2: return [4 /*yield*/, ctx.db.query("agentPatterns").collect()];
                case 3: return [2 /*return*/, _a.sent()];
            }
        });
    }); },
});
exports.getAgentStrengths = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var patterns;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agentPatterns")
                        .withIndex("by_agent", function (q) { return q.eq("agentId", args.agentId); })
                        .collect()];
                case 1:
                    patterns = _a.sent();
                    return [2 /*return*/, patterns
                            .filter(function (p) { return p.pattern.startsWith("strength:"); })
                            .map(function (p) { return ({
                            type: p.pattern.replace("strength:", ""),
                            score: p.confidence,
                            reason: "Based on ".concat(p.evidence.length, " task(s)"),
                            evidence: p.evidence,
                        }); })
                            .sort(function (a, b) { return b.score - a.score; })];
            }
        });
    }); },
});
exports.getAgentWeaknesses = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var patterns;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agentPatterns")
                        .withIndex("by_agent", function (q) { return q.eq("agentId", args.agentId); })
                        .collect()];
                case 1:
                    patterns = _a.sent();
                    return [2 /*return*/, patterns
                            .filter(function (p) { return p.pattern.startsWith("weakness:"); })
                            .map(function (p) { return ({
                            type: p.pattern.replace("weakness:", ""),
                            score: p.confidence,
                            reason: "Based on ".concat(p.evidence.length, " task(s)"),
                            evidence: p.evidence,
                        }); })
                            .sort(function (a, b) { return b.score - a.score; })];
            }
        });
    }); },
});
exports.getBestAgentForTask = (0, server_1.query)({
    args: {
        projectId: values_1.v.id("projects"),
        taskType: values_1.v.string(),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var agents, scores, _loop_1, _i, agents_1, agent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agents")
                        .withIndex("by_project_status", function (q) {
                        return q.eq("projectId", args.projectId).eq("status", "ACTIVE");
                    })
                        .collect()];
                case 1:
                    agents = _a.sent();
                    scores = [];
                    _loop_1 = function (agent) {
                        var perfRecord, total, successRate, costScore, score;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, ctx.db
                                        .query("agentPerformance")
                                        .withIndex("by_agent_type", function (q) {
                                        return q.eq("agentId", agent._id).eq("taskType", args.taskType);
                                    })
                                        .first()];
                                case 1:
                                    perfRecord = _b.sent();
                                    if (perfRecord) {
                                        total = perfRecord.successCount + perfRecord.failureCount;
                                        successRate = total > 0 ? perfRecord.successCount / total : 0;
                                        costScore = perfRecord.avgCostUsd > 0 ? 1 / perfRecord.avgCostUsd : 1;
                                        score = successRate * 0.7 + Math.min(costScore, 1) * 0.3;
                                        scores.push({
                                            agentId: agent._id,
                                            score: score,
                                            reason: "".concat((successRate * 100).toFixed(0), "% success, $").concat(perfRecord.avgCostUsd.toFixed(2), " avg cost"),
                                        });
                                    }
                                    else {
                                        // No history for this type, use default score
                                        scores.push({
                                            agentId: agent._id,
                                            score: 0.5,
                                            reason: "No history for this task type",
                                        });
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, agents_1 = agents;
                    _a.label = 2;
                case 2:
                    if (!(_i < agents_1.length)) return [3 /*break*/, 5];
                    agent = agents_1[_i];
                    return [5 /*yield**/, _loop_1(agent)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    scores.sort(function (a, b) { return b.score - a.score; });
                    return [2 /*return*/, scores[0] || null];
            }
        });
    }); },
});
// ============================================================================
// MUTATIONS
// ============================================================================
exports.recordTaskCompletion = (0, server_1.mutation)({
    args: {
        taskId: values_1.v.id("tasks"),
        success: values_1.v.boolean(),
        completionTimeMs: values_1.v.optional(values_1.v.number()),
        costUsd: values_1.v.optional(values_1.v.number()),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var task, _loop_2, _i, _a, agentId;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, ctx.db.get(args.taskId)];
                case 1:
                    task = _d.sent();
                    if (!task)
                        return [2 /*return*/, { success: false, error: "Task not found" }];
                    _loop_2 = function (agentId) {
                        var existing, newTotal, newAvgTime, newAvgCost;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0: return [4 /*yield*/, ctx.db
                                        .query("agentPerformance")
                                        .withIndex("by_agent_type", function (q) {
                                        return q.eq("agentId", agentId).eq("taskType", task.type);
                                    })
                                        .first()];
                                case 1:
                                    existing = _e.sent();
                                    if (!existing) return [3 /*break*/, 3];
                                    newTotal = existing.totalTasksCompleted + 1;
                                    newAvgTime = args.completionTimeMs != null
                                        ? (existing.avgCompletionTimeMs * existing.totalTasksCompleted +
                                            args.completionTimeMs) /
                                            newTotal
                                        : existing.avgCompletionTimeMs;
                                    newAvgCost = args.costUsd != null
                                        ? (existing.avgCostUsd * existing.totalTasksCompleted +
                                            args.costUsd) /
                                            newTotal
                                        : existing.avgCostUsd;
                                    return [4 /*yield*/, ctx.db.patch(existing._id, {
                                            successCount: existing.successCount + (args.success ? 1 : 0),
                                            failureCount: existing.failureCount + (args.success ? 0 : 1),
                                            avgCompletionTimeMs: newAvgTime,
                                            avgCostUsd: newAvgCost,
                                            totalTasksCompleted: newTotal,
                                            lastUpdatedAt: Date.now(),
                                        })];
                                case 2:
                                    _e.sent();
                                    return [3 /*break*/, 5];
                                case 3: return [4 /*yield*/, ctx.db.insert("agentPerformance", {
                                        agentId: agentId,
                                        projectId: task.projectId,
                                        taskType: task.type,
                                        successCount: args.success ? 1 : 0,
                                        failureCount: args.success ? 0 : 1,
                                        avgCompletionTimeMs: (_b = args.completionTimeMs) !== null && _b !== void 0 ? _b : 0,
                                        avgCostUsd: (_c = args.costUsd) !== null && _c !== void 0 ? _c : 0,
                                        totalTasksCompleted: 1,
                                        lastUpdatedAt: Date.now(),
                                    })];
                                case 4:
                                    _e.sent();
                                    _e.label = 5;
                                case 5: 
                                // Log learning event
                                return [4 /*yield*/, ctx.db.insert("activities", {
                                        projectId: task.projectId,
                                        taskId: args.taskId,
                                        agentId: agentId,
                                        actorType: "SYSTEM",
                                        action: "AGENT_LEARNING",
                                        description: "Recorded ".concat(args.success ? "success" : "failure", " for ").concat(task.type, " task performance"),
                                    })];
                                case 6:
                                    // Log learning event
                                    _e.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, _a = task.assigneeIds || [];
                    _d.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 5];
                    agentId = _a[_i];
                    return [5 /*yield**/, _loop_2(agentId)];
                case 3:
                    _d.sent();
                    _d.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, { success: true }];
            }
        });
    }); },
});
/** Create a pattern manually from the UI (upserts if agent+pattern already exists) */
exports.createPattern = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        pattern: values_1.v.string(),
        confidence: values_1.v.number(),
        evidence: values_1.v.optional(values_1.v.array(values_1.v.string())),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var agent, projectId, existing, mergedEvidence, newConfidence, id;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, ctx.db.get(args.agentId)];
                case 1:
                    agent = _d.sent();
                    if (!agent)
                        throw new Error("Agent not found");
                    projectId = (_a = args.projectId) !== null && _a !== void 0 ? _a : agent.projectId;
                    return [4 /*yield*/, ctx.db
                            .query("agentPatterns")
                            .withIndex("by_agent_pattern", function (q) {
                            return q.eq("agentId", args.agentId).eq("pattern", args.pattern);
                        })
                            .first()];
                case 2:
                    existing = _d.sent();
                    if (!existing) return [3 /*break*/, 5];
                    mergedEvidence = __spreadArray([], new Set(__spreadArray(__spreadArray([], existing.evidence, true), ((_b = args.evidence) !== null && _b !== void 0 ? _b : []), true)), true);
                    newConfidence = existing.confidence * 0.4 + args.confidence * 0.6;
                    return [4 /*yield*/, ctx.db.patch(existing._id, {
                            confidence: newConfidence,
                            evidence: mergedEvidence,
                            lastSeenAt: Date.now(),
                        })];
                case 3:
                    _d.sent();
                    return [4 /*yield*/, ctx.db.insert("activities", {
                            projectId: projectId,
                            actorType: "HUMAN",
                            action: "PATTERN_UPDATED",
                            description: "Updated existing pattern: ".concat(args.pattern),
                            agentId: args.agentId,
                        })];
                case 4:
                    _d.sent();
                    return [2 /*return*/, { patternId: existing._id, created: false }];
                case 5: return [4 /*yield*/, ctx.db.insert("agentPatterns", {
                        agentId: args.agentId,
                        projectId: projectId,
                        pattern: args.pattern,
                        confidence: args.confidence,
                        evidence: (_c = args.evidence) !== null && _c !== void 0 ? _c : [],
                        discoveredAt: Date.now(),
                        lastSeenAt: Date.now(),
                    })];
                case 6:
                    id = _d.sent();
                    return [4 /*yield*/, ctx.db.insert("activities", {
                            projectId: projectId,
                            actorType: "HUMAN",
                            action: "PATTERN_CREATED",
                            description: "Manually created pattern: ".concat(args.pattern),
                            agentId: args.agentId,
                        })];
                case 7:
                    _d.sent();
                    return [2 /*return*/, { patternId: id, created: true }];
            }
        });
    }); },
});
/** Update an existing pattern */
exports.updatePattern = (0, server_1.mutation)({
    args: {
        patternId: values_1.v.id("agentPatterns"),
        pattern: values_1.v.optional(values_1.v.string()),
        confidence: values_1.v.optional(values_1.v.number()),
        evidence: values_1.v.optional(values_1.v.array(values_1.v.string())),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var existing, updates;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db.get(args.patternId)];
                case 1:
                    existing = _a.sent();
                    if (!existing)
                        throw new Error("Pattern not found");
                    updates = { lastSeenAt: Date.now() };
                    if (args.pattern !== undefined)
                        updates.pattern = args.pattern;
                    if (args.confidence !== undefined)
                        updates.confidence = args.confidence;
                    if (args.evidence !== undefined)
                        updates.evidence = args.evidence;
                    return [4 /*yield*/, ctx.db.patch(args.patternId, updates)];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); },
});
/** Remove a pattern */
exports.removePattern = (0, server_1.mutation)({
    args: {
        patternId: values_1.v.id("agentPatterns"),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db.get(args.patternId)];
                case 1:
                    existing = _a.sent();
                    if (!existing)
                        throw new Error("Pattern not found");
                    return [4 /*yield*/, ctx.db.delete(args.patternId)];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, ctx.db.insert("activities", {
                            projectId: existing.projectId,
                            actorType: "HUMAN",
                            action: "PATTERN_DELETED",
                            description: "Deleted pattern: ".concat(existing.pattern),
                            agentId: existing.agentId,
                        })];
                case 3:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); },
});
exports.discoverPattern = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        pattern: values_1.v.string(),
        confidence: values_1.v.number(),
        evidence: values_1.v.array(values_1.v.string()),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var agent, existing, mergedEvidence, newConfidence;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db.get(args.agentId)];
                case 1:
                    agent = _a.sent();
                    if (!agent)
                        return [2 /*return*/, { success: false, error: "Agent not found" }];
                    return [4 /*yield*/, ctx.db
                            .query("agentPatterns")
                            .withIndex("by_agent_pattern", function (q) {
                            return q.eq("agentId", args.agentId).eq("pattern", args.pattern);
                        })
                            .first()];
                case 2:
                    existing = _a.sent();
                    if (!existing) return [3 /*break*/, 4];
                    mergedEvidence = __spreadArray([], new Set(__spreadArray(__spreadArray([], existing.evidence, true), args.evidence, true)), true);
                    newConfidence = existing.confidence * 0.4 + args.confidence * 0.6;
                    return [4 /*yield*/, ctx.db.patch(existing._id, {
                            confidence: newConfidence,
                            evidence: mergedEvidence,
                            lastSeenAt: Date.now(),
                        })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, ctx.db.insert("agentPatterns", {
                        agentId: args.agentId,
                        projectId: agent.projectId,
                        pattern: args.pattern,
                        confidence: args.confidence,
                        evidence: args.evidence,
                        discoveredAt: Date.now(),
                        lastSeenAt: Date.now(),
                    })];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: 
                // Log pattern discovery
                return [4 /*yield*/, ctx.db.insert("activities", {
                        projectId: agent.projectId,
                        agentId: args.agentId,
                        actorType: "SYSTEM",
                        action: "PATTERN_DISCOVERED",
                        description: "Discovered pattern: ".concat(args.pattern, " (").concat((args.confidence * 100).toFixed(0), "% confidence)"),
                    })];
                case 7:
                    // Log pattern discovery
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); },
});
// ============================================================================
// ANALYTICS
// ============================================================================
exports.getProjectLearningInsights = (0, server_1.query)({
    args: { projectId: values_1.v.id("projects") },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var agents, insights, _loop_3, _i, agents_2, agent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agents")
                        .withIndex("by_project", function (q) { return q.eq("projectId", args.projectId); })
                        .collect()];
                case 1:
                    agents = _a.sent();
                    insights = [];
                    _loop_3 = function (agent) {
                        var perfRecords, _b, perfRecords_2, rec, total, successRate, patterns, _c, patterns_1, pat;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0: return [4 /*yield*/, ctx.db
                                        .query("agentPerformance")
                                        .withIndex("by_agent", function (q) { return q.eq("agentId", agent._id); })
                                        .collect()];
                                case 1:
                                    perfRecords = _d.sent();
                                    for (_b = 0, perfRecords_2 = perfRecords; _b < perfRecords_2.length; _b++) {
                                        rec = perfRecords_2[_b];
                                        total = rec.successCount + rec.failureCount;
                                        if (total < 2)
                                            continue;
                                        successRate = rec.successCount / total;
                                        if (successRate > 0.8) {
                                            insights.push({
                                                type: "strength",
                                                message: "".concat(agent.name, " excels at ").concat(rec.taskType, " (").concat((successRate * 100).toFixed(0), "% success rate)"),
                                                agentId: agent._id,
                                            });
                                        }
                                        else if (successRate < 0.5) {
                                            insights.push({
                                                type: "weakness",
                                                message: "".concat(agent.name, " struggles with ").concat(rec.taskType, " (").concat((successRate * 100).toFixed(0), "% success rate)"),
                                                agentId: agent._id,
                                            });
                                        }
                                    }
                                    return [4 /*yield*/, ctx.db
                                            .query("agentPatterns")
                                            .withIndex("by_agent", function (q) { return q.eq("agentId", agent._id); })
                                            .collect()];
                                case 2:
                                    patterns = _d.sent();
                                    for (_c = 0, patterns_1 = patterns; _c < patterns_1.length; _c++) {
                                        pat = patterns_1[_c];
                                        if (pat.confidence > 0.7) {
                                            insights.push({
                                                type: pat.pattern.startsWith("strength:") ? "strength" : "weakness",
                                                message: "".concat(agent.name, ": ").concat(pat.pattern, " (").concat((pat.confidence * 100).toFixed(0), "% confidence)"),
                                                agentId: agent._id,
                                            });
                                        }
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, agents_2 = agents;
                    _a.label = 2;
                case 2:
                    if (!(_i < agents_2.length)) return [3 /*break*/, 5];
                    agent = agents_2[_i];
                    return [5 /*yield**/, _loop_3(agent)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, insights];
            }
        });
    }); },
});
