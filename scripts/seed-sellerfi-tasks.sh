#!/bin/bash
# Seed SellerFi tasks into Mission Control

PROJECT_ID="ks70tcsz3a9g2xhqztpsff71qd80ddmh"

cd /Users/jaywest/MissionControl

echo "Creating SellerFi bug verification tasks..."

# Task 1: Profile Picture Upload
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Verify Profile Picture Upload\",
  \"description\": \"Test profile picture upload for both Seller and Buyer accounts.\\n\\n**Test accounts:**\\n- Seller: ricconners@gmail.com / password123\\n- Buyer: peteconman@gmail.com / password123\\n\\n**Steps:**\\n1. Login as seller, go to Settings/Profile\\n2. Click upload avatar, select image\\n3. Verify upload succeeds and displays\\n4. Repeat for buyer\\n\\n**Files:** app/api/user/avatar/route.ts, components/profile-avatar-selector.tsx\",
  \"type\": \"ENGINEERING\",
  \"priority\": 1
}"

# Task 2: Listing Creation
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Verify Listing Creation Wizard\",
  \"description\": \"Test full listing creation flow end-to-end.\\n\\n**Steps:**\\n1. Login as seller (ricconners@gmail.com)\\n2. Click Create Listing\\n3. Complete all wizard steps (business info, financials, photos, docs)\\n4. Submit listing\\n\\n**Expected:** Listing created and visible in dashboard\\n\\n**Files:** app/(main)/listings/new/comprehensive-listing-wizard.tsx\",
  \"type\": \"ENGINEERING\",
  \"priority\": 1
}"

# Task 3: Document Upload
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Verify Document Upload in Listing Wizard\",
  \"description\": \"Test document upload in listing creation.\\n\\n**Steps:**\\n1. Login as seller\\n2. Start listing wizard\\n3. Navigate to documents step\\n4. Upload a PDF\\n5. Verify upload succeeds\\n\\n**Files:** app/api/listings/documents/upload/route.ts\",
  \"type\": \"ENGINEERING\",
  \"priority\": 1
}"

# Task 4: Buyer Profile
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Verify Buyer Profile Completion\",
  \"description\": \"Test buyer profile completion (was showing P2023 error).\\n\\n**Steps:**\\n1. Login as buyer (peteconman@gmail.com)\\n2. Complete profile with all required fields\\n3. Submit\\n\\n**Expected:** Profile saves, no P2023 error\\n\\n**Files:** app/(main)/buyers/elite/page.tsx\",
  \"type\": \"ENGINEERING\",
  \"priority\": 1
}"

# Task 5: Mobile Nav
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Verify Mobile Nav Role-Awareness\",
  \"description\": \"Test mobile nav shows correct links per role.\\n\\n**Steps:**\\n1. Open on mobile viewport\\n2. Login as seller → see Dashboard link\\n3. Login as buyer → see Profile link\\n\\n**Files:** components/nav/mobile-nav.tsx\",
  \"type\": \"ENGINEERING\",
  \"priority\": 2
}"

# Task 6: Password Change
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Verify Password Change Dialog\",
  \"description\": \"Test password change in settings.\\n\\n**Steps:**\\n1. Login, go to Settings\\n2. Click Change Password\\n3. Enter current + new password\\n4. Submit\\n\\n**Expected:** Password changes successfully\\n\\n**Files:** components/settings/password-dialog.tsx\",
  \"type\": \"ENGINEERING\",
  \"priority\": 2
}"

# Task 7: Checkout Auth
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Verify Checkout Auth Detection\",
  \"description\": \"Test pricing/upgrade flows detect logged-in users.\\n\\n**Steps:**\\n1. Login as seller\\n2. Go to Pricing page\\n3. Click upgrade\\n4. Should NOT ask to create account\\n\\n**Expected:** Goes to checkout directly\\n\\n**Files:** components/upgrade-button.tsx\",
  \"type\": \"ENGINEERING\",
  \"priority\": 2
}"

# Task 8: 3-Month Pricing
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Verify 3-Month Pricing Discount\",
  \"description\": \"Confirm 3-month pricing shows 5% discount.\\n\\n**Steps:**\\n1. Go to Pricing page\\n2. Toggle to 3-month\\n3. Verify shows Save 5%\\n4. Verify price < monthly * 3\\n\\n**Files:** lib/stripe-products-client.ts\",
  \"type\": \"ENGINEERING\",
  \"priority\": 1
}"

# Task 9: Industry Filter
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Verify Industry Filter\",
  \"description\": \"Test industry filter on listings page.\\n\\n**Steps:**\\n1. Go to /listings\\n2. Select industry (e.g. Technology)\\n3. Apply filter\\n\\n**Expected:** Only matching listings shown\\n\\n**Files:** app/api/listings/route.ts\",
  \"type\": \"ENGINEERING\",
  \"priority\": 2
}"

# Task 10: Deploy
npx convex run tasks:create "{
  \"projectId\": \"$PROJECT_ID\",
  \"title\": \"Git Push and Deploy to Vercel\",
  \"description\": \"Push fixes to GitHub and deploy.\\n\\n**Steps:**\\n1. cd ~/Projects/SellerFi\\n2. git status (verify clean)\\n3. git push origin main\\n4. Monitor Vercel deployment\\n5. Verify https://sellerfi.vercel.app works\\n\\n**Expected:** Production deployment successful\",
  \"type\": \"OPS\",
  \"priority\": 1
}"

echo "Done! Check Mission Control UI for tasks."
