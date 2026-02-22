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
exports.resolveActiveTenantId = resolveActiveTenantId;
function findDefaultTenantId(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var defaultTenant, activeTenants;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.db
                        .query("tenants")
                        .withIndex("by_slug", function (q) { return q.eq("slug", "default"); })
                        .first()];
                case 1:
                    defaultTenant = (_a.sent());
                    if (defaultTenant === null || defaultTenant === void 0 ? void 0 : defaultTenant.active)
                        return [2 /*return*/, defaultTenant._id];
                    return [4 /*yield*/, ctx.db
                            .query("tenants")
                            .withIndex("by_active", function (q) { return q.eq("active", true); })
                            .collect()];
                case 2:
                    activeTenants = (_a.sent());
                    if (activeTenants.length > 0)
                        return [2 /*return*/, activeTenants[0]._id];
                    return [2 /*return*/, undefined];
            }
        });
    });
}
function ensureDefaultTenantId(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, id;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, findDefaultTenantId(ctx)];
                case 1:
                    existing = _a.sent();
                    if (existing)
                        return [2 /*return*/, existing];
                    if (!ctx.db.insert)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, ctx.db.insert("tenants", {
                            name: "Default Tenant",
                            slug: "default",
                            description: "Auto-created tenant for migration compatibility.",
                            active: true,
                            metadata: {
                                source: "tenant-resolver",
                                autoCreated: true,
                            },
                        })];
                case 2:
                    id = _a.sent();
                    return [2 /*return*/, id];
            }
        });
    });
}
function resolveActiveTenantId(ctx, args) {
    return __awaiter(this, void 0, void 0, function () {
        var project, template, version, instance, environment;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (args.tenantId)
                        return [2 /*return*/, args.tenantId];
                    if (!args.projectId) return [3 /*break*/, 2];
                    return [4 /*yield*/, ctx.db.get(args.projectId)];
                case 1:
                    project = (_a.sent());
                    if (project === null || project === void 0 ? void 0 : project.tenantId)
                        return [2 /*return*/, project.tenantId];
                    _a.label = 2;
                case 2:
                    if (!args.templateId) return [3 /*break*/, 4];
                    return [4 /*yield*/, ctx.db.get(args.templateId)];
                case 3:
                    template = (_a.sent());
                    if (template === null || template === void 0 ? void 0 : template.tenantId)
                        return [2 /*return*/, template.tenantId];
                    _a.label = 4;
                case 4:
                    if (!args.versionId) return [3 /*break*/, 6];
                    return [4 /*yield*/, ctx.db.get(args.versionId)];
                case 5:
                    version = (_a.sent());
                    if (version === null || version === void 0 ? void 0 : version.tenantId)
                        return [2 /*return*/, version.tenantId];
                    _a.label = 6;
                case 6:
                    if (!args.instanceId) return [3 /*break*/, 8];
                    return [4 /*yield*/, ctx.db.get(args.instanceId)];
                case 7:
                    instance = (_a.sent());
                    if (instance === null || instance === void 0 ? void 0 : instance.tenantId)
                        return [2 /*return*/, instance.tenantId];
                    _a.label = 8;
                case 8:
                    if (!args.environmentId) return [3 /*break*/, 10];
                    return [4 /*yield*/, ctx.db.get(args.environmentId)];
                case 9:
                    environment = (_a.sent());
                    if (environment === null || environment === void 0 ? void 0 : environment.tenantId)
                        return [2 /*return*/, environment.tenantId];
                    _a.label = 10;
                case 10:
                    if (args.createDefaultIfMissing) {
                        return [2 /*return*/, ensureDefaultTenantId(ctx)];
                    }
                    return [2 /*return*/, findDefaultTenantId(ctx)];
            }
        });
    });
}
