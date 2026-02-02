/**
 * Setup Projects - Create initial projects
 *
 * Run with: npx convex run setupProjects:createInitialProjects
 */
import { internalMutation } from "./_generated/server";
export const createInitialProjects = internalMutation({
    args: {},
    handler: async (ctx) => {
        const results = [];
        // Create SellerFi project
        const sellerfiExists = await ctx.db
            .query("projects")
            .withIndex("by_slug", (q) => q.eq("slug", "sellerfi"))
            .first();
        if (!sellerfiExists) {
            const sellerfiId = await ctx.db.insert("projects", {
                name: "SellerFi",
                slug: "sellerfi",
                description: "SellerFi work and repository",
                policyDefaults: {
                    budgetDefaults: {
                        INTERN: { daily: 2, perRun: 0.25 },
                        SPECIALIST: { daily: 5, perRun: 0.75 },
                        LEAD: { daily: 12, perRun: 1.5 },
                    },
                },
            });
            await ctx.db.insert("activities", {
                actorType: "SYSTEM",
                action: "PROJECT_CREATED",
                description: "Project 'SellerFi' created",
                targetType: "PROJECT",
                targetId: sellerfiId,
                projectId: sellerfiId,
            });
            results.push({ name: "SellerFi", id: sellerfiId, created: true });
        }
        else {
            results.push({ name: "SellerFi", id: sellerfiExists._id, created: false, message: "Already exists" });
        }
        // Create Mission Control project
        const mcExists = await ctx.db
            .query("projects")
            .withIndex("by_slug", (q) => q.eq("slug", "mission-control"))
            .first();
        if (!mcExists) {
            const mcId = await ctx.db.insert("projects", {
                name: "Mission Control",
                slug: "mission-control",
                description: "Mission Control development and maintenance",
                policyDefaults: {
                    budgetDefaults: {
                        INTERN: { daily: 2, perRun: 0.25 },
                        SPECIALIST: { daily: 5, perRun: 0.75 },
                        LEAD: { daily: 12, perRun: 1.5 },
                    },
                },
            });
            await ctx.db.insert("activities", {
                actorType: "SYSTEM",
                action: "PROJECT_CREATED",
                description: "Project 'Mission Control' created",
                targetType: "PROJECT",
                targetId: mcId,
                projectId: mcId,
            });
            results.push({ name: "Mission Control", id: mcId, created: true });
        }
        else {
            results.push({ name: "Mission Control", id: mcExists._id, created: false, message: "Already exists" });
        }
        // List all projects
        const allProjects = await ctx.db.query("projects").collect();
        return {
            results,
            allProjects: allProjects.map(p => ({ name: p.name, slug: p.slug, id: p._id })),
        };
    },
});
