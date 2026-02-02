/**
 * Seed SellerFi project and bug fix tasks
 * Run: npx convex run seedSellerFi:run
 */

import { mutation } from "./_generated/server";

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Create SellerFi project
    const existingProject = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", "sellerfi"))
      .first();

    let projectId;
    if (existingProject) {
      console.log("SellerFi project already exists:", existingProject._id);
      projectId = existingProject._id;
    } else {
      projectId = await ctx.db.insert("projects", {
        name: "SellerFi",
        slug: "sellerfi",
        description: "AI-first marketplace for seller financing",
        metadata: {
          repo: "https://github.com/jaydubya818/SellerFi",
          localPath: "~/Projects/SellerFi",
          runningServer: "~/SellerFin/seller-financing-platform",
          vercelUrl: "https://sellerfi.vercel.app",
          testAccounts: {
            seller: { email: "ricconners@gmail.com", password: "password123" },
            buyer: { email: "peteconman@gmail.com", password: "password123" },
          },
        },
      });
      console.log("Created SellerFi project:", projectId);
    }

    // 2. Define tasks for bug verification
    const tasks = [
      {
        title: "Verify Profile Picture Upload",
        description: `Test profile picture upload for both Seller and Buyer accounts.

**Steps:**
1. Login as seller (ricconners@gmail.com)
2. Go to Settings/Profile
3. Click upload avatar
4. Select an image
5. Verify it uploads and displays
6. Repeat for buyer (peteconman@gmail.com)

**Expected:** Avatar uploads successfully and displays in header/profile

**Files to check if broken:**
- app/api/user/avatar/route.ts
- components/profile-avatar-selector.tsx`,
        type: "ENGINEERING",
        priority: 1,
      },
      {
        title: "Verify Listing Creation Wizard",
        description: `Test the full listing creation flow end-to-end.

**Steps:**
1. Login as seller (ricconners@gmail.com)
2. Click "Create Listing" or "Sell Your Business"
3. Complete all wizard steps:
   - Business info (name, industry, location)
   - Financial details
   - Photo upload
   - Document upload
4. Submit listing

**Expected:** Listing created and visible in dashboard

**Files to check if broken:**
- app/(main)/listings/new/comprehensive-listing-wizard.tsx
- app/api/listings/route.ts`,
        type: "ENGINEERING",
        priority: 1,
      },
      {
        title: "Verify Document Upload in Listing Wizard",
        description: `Test document upload functionality in listing creation.

**Steps:**
1. Login as seller
2. Start new listing wizard
3. Navigate to documents step
4. Upload a PDF document
5. Verify upload succeeds

**Expected:** Document uploads and attaches to listing

**Files to check if broken:**
- app/api/listings/documents/upload/route.ts
- Document upload component in wizard`,
        type: "ENGINEERING",
        priority: 1,
      },
      {
        title: "Verify Buyer Profile Completion",
        description: `Test buyer profile completion flow (was showing P2023 database error).

**Steps:**
1. Login as buyer (peteconman@gmail.com)
2. Go to complete profile
3. Fill all required fields
4. Submit

**Expected:** Profile saves successfully, no P2023 error

**Files to check if broken:**
- app/(main)/buyers/elite/page.tsx
- Profile update API`,
        type: "ENGINEERING",
        priority: 1,
      },
      {
        title: "Verify Mobile Nav Role-Awareness",
        description: `Test that mobile navigation shows correct links based on user role.

**Steps:**
1. Open site on mobile viewport (or responsive mode)
2. Login as seller → should see Dashboard link
3. Logout, login as buyer → should see Profile link

**Expected:** Nav adapts to user role

**Files to check if broken:**
- components/nav/mobile-nav.tsx
- Auth context`,
        type: "ENGINEERING",
        priority: 2,
      },
      {
        title: "Verify Password Change Dialog",
        description: `Test the password change functionality in settings.

**Steps:**
1. Login as any user
2. Go to Settings
3. Click "Change Password"
4. Enter current and new password
5. Submit

**Expected:** Password changes successfully

**Files to check if broken:**
- components/settings/password-dialog.tsx
- app/api/user/password/route.ts`,
        type: "ENGINEERING",
        priority: 2,
      },
      {
        title: "Verify Checkout Auth Detection",
        description: `Test that pricing/upgrade flows detect logged-in users.

**Steps:**
1. Login as seller
2. Go to Pricing page
3. Click upgrade/subscribe
4. Should NOT ask to create account again

**Expected:** Logged-in user goes directly to checkout

**Files to check if broken:**
- components/upgrade-button.tsx
- Pricing page checkout flow`,
        type: "ENGINEERING",
        priority: 2,
      },
      {
        title: "Verify 3-Month Pricing Discount",
        description: `Confirm 3-month pricing shows 5% discount (not 15% premium).

**Steps:**
1. Go to Pricing page (logged out or logged in)
2. Toggle to 3-month pricing
3. Verify discount is shown (e.g., "Save 5%")
4. Verify actual price is lower than monthly * 3

**Expected:** 3-month = monthly * 3 * 0.95

**Files to check if broken:**
- lib/stripe-products-client.ts
- Pricing display components`,
        type: "ENGINEERING",
        priority: 1,
      },
      {
        title: "Verify Industry Filter",
        description: `Test industry filter on listings page.

**Steps:**
1. Go to /listings
2. Select an industry from dropdown (e.g., "Technology")
3. Apply filter

**Expected:** Only listings with matching industry shown

**Files to check if broken:**
- app/api/listings/route.ts (industry filter logic)
- Listings page filter component`,
        type: "ENGINEERING",
        priority: 2,
      },
      {
        title: "Git Push & Deploy to Vercel",
        description: `Push all committed fixes to GitHub and trigger Vercel deployment.

**Steps:**
1. cd ~/Projects/SellerFi
2. git status (verify clean)
3. git push origin main
4. Monitor Vercel deployment
5. Verify production site works

**Expected:** Production deployment successful

**Vercel URL:** https://sellerfi.vercel.app`,
        type: "OPS",
        priority: 1,
      },
    ];

    // 3. Insert tasks
    const insertedTasks = [];
    for (const task of tasks) {
      // Check if task already exists
      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .filter((q) => q.eq(q.field("title"), task.title))
        .first();

      if (existing) {
        console.log("Task already exists:", task.title);
        insertedTasks.push(existing._id);
        continue;
      }

      const taskId = await ctx.db.insert("tasks", {
        projectId,
        title: task.title,
        description: task.description,
        type: task.type,
        status: "INBOX",
        priority: task.priority,
        assigneeIds: [],
        createdBy: "SYSTEM",
        actualCost: 0,
        reviewCycles: 0,
      });
      console.log("Created task:", task.title, taskId);
      insertedTasks.push(taskId);
    }

    // 4. Create a CAO agent (Sofie) for SellerFi if not exists
    const existingSofie = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .filter((q) => q.eq(q.field("name"), "Sofie"))
      .first();

    if (!existingSofie) {
      await ctx.db.insert("agents", {
        projectId,
        name: "Sofie",
        role: "LEAD",
        status: "ACTIVE",
        emoji: "👩‍💼",
        allowedTaskTypes: ["ENGINEERING", "OPS", "CONTENT", "DOCS"],
        budgetDaily: 50.0,
        budgetPerRun: 5.0,
        spendToday: 0,
        metadata: {
          isCAO: true,
          description: "Chief Agent Officer - oversees all SellerFi agent work",
        },
      });
      console.log("Created Sofie (CAO) for SellerFi");
    }

    // 5. Create a Dev agent for SellerFi
    const existingDev = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .filter((q) => q.eq(q.field("name"), "Dev"))
      .first();

    if (!existingDev) {
      await ctx.db.insert("agents", {
        projectId,
        name: "Dev",
        role: "SPECIALIST",
        status: "ACTIVE",
        emoji: "👨‍💻",
        allowedTaskTypes: ["ENGINEERING", "OPS"],
        budgetDaily: 20.0,
        budgetPerRun: 2.0,
        spendToday: 0,
        metadata: {
          description: "Development agent - handles code fixes, testing, deployments",
        },
      });
      console.log("Created Dev agent for SellerFi");
    }

    return {
      projectId,
      tasksCreated: insertedTasks.length,
      taskIds: insertedTasks,
    };
  },
});
