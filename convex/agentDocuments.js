"use strict";
/**
 * Agent Documents — WORKING.md, daily notes, session memory.
 * Per-agent memory system for OpenClaw agents.
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.remove = exports.update = exports.create = exports.getDailyNote = exports.getWorkingMd = exports.listByAgent = exports.list = exports.get = exports.set = void 0;
var values_1 = require("convex/values");
var server_1 = require("./_generated/server");
var documentType = values_1.v.union(values_1.v.literal("WORKING_MD"), values_1.v.literal("DAILY_NOTE"), values_1.v.literal("SESSION_MEMORY"));
exports.set = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        type: documentType,
        content: values_1.v.string(),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var now, existing, id;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = Date.now();
                    return [4 /*yield*/, ctx.db
                            .query("agentDocuments")
                            .withIndex("by_agent_type", function (q) {
                            return q.eq("agentId", args.agentId).eq("type", args.type);
                        })
                            .first()];
                case 1:
                    existing = _a.sent();
                    if (!existing) return [3 /*break*/, 3];
                    return [4 /*yield*/, ctx.db.patch(existing._id, {
                            content: args.content,
                            updatedAt: now,
                            metadata: args.metadata,
                        })];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { documentId: existing._id, created: false }];
                case 3: return [4 /*yield*/, ctx.db.insert("agentDocuments", {
                        agentId: args.agentId,
                        projectId: args.projectId,
                        type: args.type,
                        content: args.content,
                        updatedAt: now,
                        metadata: args.metadata,
                    })];
                case 4:
                    id = _a.sent();
                    return [2 /*return*/, { documentId: id, created: true }];
            }
        });
    }); },
});
exports.get = (0, server_1.query)({
    args: {
        agentId: values_1.v.id("agents"),
        type: documentType,
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agentDocuments")
                        .withIndex("by_agent_type", function (q) {
                        return q.eq("agentId", args.agentId).eq("type", args.type);
                    })
                        .first()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    }); },
});
/** List all agent documents, optionally filtered by project */
exports.list = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!args.projectId) return [3 /*break*/, 2];
                    return [4 /*yield*/, ctx.db
                            .query("agentDocuments")
                            .withIndex("by_project", function (q) { return q.eq("projectId", args.projectId); })
                            .order("desc")
                            .collect()];
                case 1: return [2 /*return*/, _a.sent()];
                case 2: return [4 /*yield*/, ctx.db.query("agentDocuments").order("desc").collect()];
                case 3: return [2 /*return*/, _a.sent()];
            }
        });
    }); },
});
exports.listByAgent = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agentDocuments")
                        .withIndex("by_agent", function (q) { return q.eq("agentId", args.agentId); })
                        .order("desc")
                        .collect()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    }); },
});
/** Get WORKING.md content for an agent (convenience). */
exports.getWorkingMd = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var doc;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agentDocuments")
                        .withIndex("by_agent_type", function (q) {
                        return q.eq("agentId", args.agentId).eq("type", "WORKING_MD");
                    })
                        .first()];
                case 1:
                    doc = _b.sent();
                    return [2 /*return*/, (_a = doc === null || doc === void 0 ? void 0 : doc.content) !== null && _a !== void 0 ? _a : null];
            }
        });
    }); },
});
/** Get daily note for an agent (convenience). */
exports.getDailyNote = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var doc;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agentDocuments")
                        .withIndex("by_agent_type", function (q) {
                        return q.eq("agentId", args.agentId).eq("type", "DAILY_NOTE");
                    })
                        .first()];
                case 1:
                    doc = _b.sent();
                    return [2 /*return*/, (_a = doc === null || doc === void 0 ? void 0 : doc.content) !== null && _a !== void 0 ? _a : null];
            }
        });
    }); },
});
// ============================================================================
// CRUD MUTATIONS
// ============================================================================
/** Create a new agent document (upserts if agent+type already exists) */
exports.create = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        type: documentType,
        content: values_1.v.string(),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var agent, projectId, existing, id;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ctx.db.get(args.agentId)];
                case 1:
                    agent = _b.sent();
                    if (!agent)
                        throw new Error("Agent not found");
                    projectId = (_a = args.projectId) !== null && _a !== void 0 ? _a : agent.projectId;
                    return [4 /*yield*/, ctx.db
                            .query("agentDocuments")
                            .withIndex("by_agent_type", function (q) {
                            return q.eq("agentId", args.agentId).eq("type", args.type);
                        })
                            .first()];
                case 2:
                    existing = _b.sent();
                    if (!existing) return [3 /*break*/, 5];
                    // Upsert: update the existing document instead of creating a duplicate
                    return [4 /*yield*/, ctx.db.patch(existing._id, {
                            content: args.content,
                            updatedAt: Date.now(),
                            metadata: args.metadata,
                            projectId: projectId,
                        })];
                case 3:
                    // Upsert: update the existing document instead of creating a duplicate
                    _b.sent();
                    return [4 /*yield*/, ctx.db.insert("activities", {
                            projectId: projectId,
                            actorType: "HUMAN",
                            action: "MEMORY_UPDATED",
                            description: "Updated existing ".concat(args.type, " document for agent \"").concat(agent.name, "\""),
                            agentId: args.agentId,
                        })];
                case 4:
                    _b.sent();
                    return [2 /*return*/, { documentId: existing._id, created: false }];
                case 5: return [4 /*yield*/, ctx.db.insert("agentDocuments", {
                        agentId: args.agentId,
                        projectId: projectId,
                        type: args.type,
                        content: args.content,
                        updatedAt: Date.now(),
                        metadata: args.metadata,
                    })];
                case 6:
                    id = _b.sent();
                    return [4 /*yield*/, ctx.db.insert("activities", {
                            projectId: projectId,
                            actorType: "HUMAN",
                            action: "MEMORY_CREATED",
                            description: "Created ".concat(args.type, " document for agent \"").concat(agent.name, "\""),
                            agentId: args.agentId,
                        })];
                case 7:
                    _b.sent();
                    return [2 /*return*/, { documentId: id, created: true }];
            }
        });
    }); },
});
/** Update an existing agent document */
exports.update = (0, server_1.mutation)({
    args: {
        documentId: values_1.v.id("agentDocuments"),
        content: values_1.v.string(),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var doc;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db.get(args.documentId)];
                case 1:
                    doc = _a.sent();
                    if (!doc)
                        throw new Error("Document not found");
                    return [4 /*yield*/, ctx.db.patch(args.documentId, {
                            content: args.content,
                            updatedAt: Date.now(),
                            metadata: args.metadata,
                        })];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); },
});
/** Remove an agent document */
exports.remove = (0, server_1.mutation)({
    args: {
        documentId: values_1.v.id("agentDocuments"),
    },
    handler: function (ctx, args) { return __awaiter(void 0, void 0, void 0, function () {
        var doc;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db.get(args.documentId)];
                case 1:
                    doc = _a.sent();
                    if (!doc)
                        throw new Error("Document not found");
                    return [4 /*yield*/, ctx.db.delete(args.documentId)];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, ctx.db.insert("activities", {
                            projectId: doc.projectId,
                            actorType: "HUMAN",
                            action: "MEMORY_DELETED",
                            description: "Deleted ".concat(doc.type, " document"),
                            agentId: doc.agentId,
                        })];
                case 3:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); },
});
