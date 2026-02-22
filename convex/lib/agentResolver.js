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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureInstanceForLegacyAgent = ensureInstanceForLegacyAgent;
exports.resolveAgentRef = resolveAgentRef;
exports.getAgentByLegacyId = getAgentByLegacyId;
var genomeHash_1 = require("./genomeHash");
var getActiveTenant_1 = require("./getActiveTenant");
function slugify(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}
function statusFromLegacy(status) {
    switch (status) {
        case "ACTIVE":
            return "ACTIVE";
        case "PAUSED":
            return "PAUSED";
        case "DRAINED":
            return "DRAINING";
        case "QUARANTINED":
            return "QUARANTINED";
        case "OFFLINE":
            return "READONLY";
        default:
            return "PROVISIONING";
    }
}
function buildGenome(agent) {
    var _a, _b, _c, _d, _e, _f, _g;
    var toolManifestHash = (0, genomeHash_1.computeGenomeHash)({
        modelConfig: {
            provider: "legacy",
            modelId: "legacy",
        },
        promptBundleHash: (_a = agent.soulVersionHash) !== null && _a !== void 0 ? _a : "legacy-soul",
        toolManifestHash: JSON.stringify((_b = agent.allowedTools) !== null && _b !== void 0 ? _b : []),
        provenance: {
            createdBy: "legacy-migration",
            source: "mission-control",
            createdAt: Date.now(),
        },
    });
    return {
        modelConfig: {
            provider: "legacy",
            modelId: (_d = (_c = agent.metadata) === null || _c === void 0 ? void 0 : _c.modelId) !== null && _d !== void 0 ? _d : "legacy-model",
            temperature: (_e = agent.metadata) === null || _e === void 0 ? void 0 : _e.temperature,
            maxTokens: (_f = agent.metadata) === null || _f === void 0 ? void 0 : _f.maxTokens,
        },
        promptBundleHash: (_g = agent.soulVersionHash) !== null && _g !== void 0 ? _g : "legacy-soul",
        toolManifestHash: toolManifestHash,
        provenance: {
            createdBy: "legacy-migration",
            source: "mission-control",
            createdAt: Date.now(),
        },
    };
}
function ensureInstanceForLegacyAgent(ctx, legacyAgentId) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, agent, tenantId, now, slug, template, templateId, genome, genomeHash, versions, version, maxVersion, versionId, instanceId;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("agentInstances")
                        .withIndex("by_legacy_agent", function (q) { return q.eq("legacyAgentId", legacyAgentId); })
                        .first()];
                case 1:
                    existing = _b.sent();
                    if (existing) {
                        return [2 /*return*/, {
                                instanceId: existing._id,
                                versionId: existing.versionId,
                                templateId: existing.templateId,
                                legacyAgentId: legacyAgentId,
                            }];
                    }
                    return [4 /*yield*/, ctx.db.get(legacyAgentId)];
                case 2:
                    agent = (_b.sent());
                    if (!agent) {
                        throw new Error("Legacy agent not found: ".concat(legacyAgentId));
                    }
                    return [4 /*yield*/, (0, getActiveTenant_1.resolveActiveTenantId)({ db: ctx.db }, {
                            tenantId: agent.tenantId,
                            projectId: (_a = agent.projectId) !== null && _a !== void 0 ? _a : undefined,
                            createDefaultIfMissing: true,
                        })];
                case 3:
                    tenantId = _b.sent();
                    now = Date.now();
                    slug = "legacy-".concat(slugify(agent.name));
                    return [4 /*yield*/, ctx.db
                            .query("agentTemplates")
                            .withIndex("by_slug", function (q) { return q.eq("slug", slug); })
                            .first()];
                case 4:
                    template = _b.sent();
                    if (!!template) return [3 /*break*/, 7];
                    return [4 /*yield*/, ctx.db.insert("agentTemplates", {
                            tenantId: tenantId,
                            projectId: agent.projectId,
                            name: "".concat(agent.name, " Template"),
                            slug: slug,
                            description: "Auto-created template for legacy agent ".concat(agent.name),
                            active: true,
                            createdAt: now,
                            updatedAt: now,
                            metadata: {
                                source: "legacy-agent",
                            },
                        })];
                case 5:
                    templateId = _b.sent();
                    return [4 /*yield*/, ctx.db.get(templateId)];
                case 6:
                    template = _b.sent();
                    _b.label = 7;
                case 7:
                    if (!template) {
                        throw new Error("Failed to resolve template for agent ".concat(agent.name));
                    }
                    genome = buildGenome(agent);
                    genomeHash = (0, genomeHash_1.computeGenomeHash)(genome);
                    return [4 /*yield*/, ctx.db
                            .query("agentVersions")
                            .withIndex("by_template", function (q) { return q.eq("templateId", template._id); })
                            .collect()];
                case 8:
                    versions = _b.sent();
                    version = versions.find(function (v) { return v.genomeHash === genomeHash; });
                    if (!!version) return [3 /*break*/, 11];
                    maxVersion = versions.reduce(function (max, current) { var _a; return Math.max(max, (_a = current.version) !== null && _a !== void 0 ? _a : 0); }, 0);
                    return [4 /*yield*/, ctx.db.insert("agentVersions", {
                            tenantId: tenantId,
                            projectId: agent.projectId,
                            templateId: template._id,
                            version: maxVersion + 1,
                            genome: genome,
                            genomeHash: genomeHash,
                            status: "APPROVED",
                            notes: "Auto-created from legacy agent",
                            createdAt: now,
                            updatedAt: now,
                            metadata: {
                                source: "legacy-agent",
                            },
                        })];
                case 9:
                    versionId = _b.sent();
                    return [4 /*yield*/, ctx.db.get(versionId)];
                case 10:
                    version = _b.sent();
                    _b.label = 11;
                case 11:
                    if (!version) {
                        throw new Error("Failed to resolve version for agent ".concat(agent.name));
                    }
                    return [4 /*yield*/, ctx.db.insert("agentInstances", {
                            tenantId: tenantId,
                            projectId: agent.projectId,
                            templateId: template._id,
                            versionId: version._id,
                            name: agent.name,
                            status: statusFromLegacy(agent.status),
                            legacyAgentId: legacyAgentId,
                            activatedAt: now,
                            metadata: {
                                source: "legacy-agent",
                                legacyRole: agent.role,
                            },
                        })];
                case 12:
                    instanceId = _b.sent();
                    return [2 /*return*/, {
                            instanceId: instanceId,
                            versionId: version._id,
                            templateId: template._id,
                            legacyAgentId: legacyAgentId,
                        }];
            }
        });
    });
}
function resolveAgentRef(ctx, input) {
    return __awaiter(this, void 0, void 0, function () {
        var instance, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!input.instanceId) return [3 /*break*/, 2];
                    return [4 /*yield*/, ctx.db.get(input.instanceId)];
                case 1:
                    instance = _a.sent();
                    if (!instance)
                        return [2 /*return*/, null];
                    return [2 /*return*/, {
                            instanceId: instance._id,
                            versionId: instance.versionId,
                            templateId: instance.templateId,
                            legacyAgentId: instance.legacyAgentId,
                        }];
                case 2:
                    if (!input.agentId)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, ctx.db
                            .query("agentInstances")
                            .withIndex("by_legacy_agent", function (q) { return q.eq("legacyAgentId", input.agentId); })
                            .first()];
                case 3:
                    existing = _a.sent();
                    if (existing) {
                        return [2 /*return*/, {
                                instanceId: existing._id,
                                versionId: existing.versionId,
                                templateId: existing.templateId,
                                legacyAgentId: input.agentId,
                            }];
                    }
                    if (input.createIfMissing === false) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, ensureInstanceForLegacyAgent(ctx, input.agentId)];
            }
        });
    });
}
function getAgentByLegacyId(ctx, legacyAgentId) {
    return __awaiter(this, void 0, void 0, function () {
        var resolved, instance, version, template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveAgentRef(ctx, { agentId: legacyAgentId, createIfMissing: false })];
                case 1:
                    resolved = _a.sent();
                    if (!resolved)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, ctx.db.get(resolved.instanceId)];
                case 2:
                    instance = (_a.sent());
                    if (!instance)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, ctx.db.get(resolved.versionId)];
                case 3:
                    version = (_a.sent());
                    return [4 /*yield*/, ctx.db.get(resolved.templateId)];
                case 4:
                    template = (_a.sent());
                    return [2 /*return*/, { instance: instance, version: version, template: template }];
            }
        });
    });
}
