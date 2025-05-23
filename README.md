
# IFC - Guru

This is a Next.js personal finance management application built in Firebase Studio.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    # or
    # pnpm install
    ```

2.  **Set Up Environment Variables:**
    Create a `.env` file in the root of your project and add the following environment variables. Replace the placeholder values with your actual credentials:

    ```env
    # Clerk Environment Variables (Required for Authentication if Clerk is enabled)
    # Get these from your Clerk Dashboard: https://dashboard.clerk.com
    # VERY IMPORTANT: Ensure your keys are copied EXACTLY as provided by Clerk.
    # Do NOT include any leading/trailing whitespace or extra characters.
    # Invalid characters or incorrect keys are the MOST COMMON cause of:
    # - "ClerkJS: Something went wrong initializing Clerk."
    # - "useUser can only be used within the <ClerkProvider /> component." (if Clerk fails to initialize)
    # - "InvalidCharacterError" during application startup.
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE # Replace with your actual publishable key
    CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE # Replace with your actual secret key

    # Mock User ID (Used ONLY when Clerk is COMPLETELY disabled for testing purposes)
    # If Clerk is enabled (i.e., ClerkProvider is active and middleware is used),
    # this variable is IGNORED by the authentication flow.
    # Set this ONLY if you are bypassing Clerk entirely for non-auth testing.
    # NEXT_PUBLIC_MOCK_USER_ID=user_your_test_user_id_here

    # MongoDB Connection String (Required for Data Persistence)
    # Replace with your actual MongoDB connection string
    # Example: MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database-name>?retryWrites=true&w=majority
    # Ensure this URI is correct and accessible from your development machine and deployment environment (e.g., Vercel).
    # Common errors like "Failed to connect to MongoDB" often stem from an incorrect or missing URI here.
    # Authentication Errors: If you see "bad auth : authentication failed", double-check:
    #   - Username and Password: Ensure they are EXACTLY correct for the database user.
    #   - Special Characters: If your password contains special characters (e.g., @, :, /), they might need to be URL-encoded (e.g., @ becomes %40).
    #   - Database Name & Cluster URL: Verify the `<cluster-url>` and `<database-name>` parts are correct.
    #   - IP Access List: Ensure your current IP address (for local dev) or Vercel's IPs are allowed in MongoDB Atlas Network Access settings.
    # Check firewall settings if connecting from local dev to a cloud DB.
    MONGODB_URI=

    # Google Generative AI API Key (Optional - For AI features like Debt Analysis)
    # Get this from Google AI Studio: https://aistudio.google.com/app/apikey
    GOOGLE_GENAI_API_KEY=

    # Optional: Logtail Source Token (For enhanced logging if logger is re-enabled)
    # Get this from Logtail: https://logtail.com/
    # NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN=
    ```
    **Important:** Ensure your `.env` file is added to your `.gitignore` file to prevent accidental exposure of secrets. If deploying to Vercel, set these variables in your Vercel project settings.

3.  **Run the Development Server:**
    ```bash
    npm run dev
    # or
    # yarn dev
    # or
    # pnpm dev
    ```

    The application will be available at [http://localhost:9002](http://localhost:9002) (or the specified port).

4.  **Explore the App:**
    - Navigate through the different sections using the sidebar: Dashboard, Transactions, Income/Expenses, Debts, Statements, Budget, Weekly Review, Logger, Notifications.
    - Add, edit, and delete data in each section.
    - Import/Export data using CSV files.
    - Use the weekly review feature to add comments to transactions and journal entries. Share weekly reviews.

## Features

- **Dashboard:** Executive summary of your financial position (Net Worth, Cash Flow, Assets, Liabilities, Budget Variance, Debt Payoff Timeline).
- **Transactions:** View, add, edit, delete, and import/export financial transactions. Categorize transactions by frequency, variability, and link to budget items. Batch update/delete operations.
- **Income/Expenses Analysis:** Detailed breakdown of income and expenses based on categories, using accordions for clarity.
- **Debt Management:** Track debts (long-term/short-term), view amortization schedules, import/export debt data, and get AI-powered payoff strategies (optional).
- **Financial Statements:** View Cash Flow and Net Worth statements based on your data and selected date ranges. Edit Assets and Other Liabilities directly. Includes a Budget Variance report.
- **Budgeting:** Create and manage budgets item by item (Income, Recurring/One-Time Expenses, Goals, Debt Allocation) per month. Import/Export budget data.
- **Weekly Review:** Review transactions week by week, add comments to specific transactions, and maintain a weekly financial journal. Includes collaboration features (sharing reviews).
- **Notifications:** In-app notifications for budget alerts, collaboration updates, and application info.
- **Logger:** View client-side logs (intended for debugging).
- **Authentication:** Secure user authentication powered by Clerk.
- **Data Persistence & Sync:** Data is cached locally in Session Storage using Zustand persist middleware and synced securely to MongoDB for authenticated users. Includes data integrity checks with SHA-256 hashing.
- **Dark/Light Mode:** Theme toggle for user preference.
- **Responsive Design:** Adapts to different screen sizes.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS, Shadcn UI
- **State Management:** Zustand (with persist middleware)
- **Authentication:** Clerk
- **Database:** MongoDB (via official Node.js driver)
- **AI (Optional):** Genkit (for Debt Analysis)
- **Data Handling:** `fast-json-stable-stringify` (for hashing), Node.js `crypto` (for hashing)
- **Linting/Formatting:** ESLint, Prettier (implicitly via Next.js defaults)
- **Deployment:** Vercel (configured via `vercel.json`)

## Data Handling, Security & GDPR/DPA Compliance Review

This application handles sensitive personal financial data. The following measures are in place:

**Data Collected:**
*   User authentication details (managed by Clerk).
*   Financial data: Transactions, Debts, Assets, Liabilities, Budgets, Goals.
*   Weekly review data: Journal entries, transaction comments, list of users a review is shared with.
*   Application state: Statement date ranges, getting started guide dismissal status.
*   Notifications (stored locally and potentially synced if `notifications` array is included in `SyncedData` for hashing/saving).
*   Client-side console logs (viewable on Logger page).

**Data Storage & Security:**
*   **Authentication:** Handled by Clerk, following industry best practices.
*   **Server-Side Storage (MongoDB):**
    *   Accessed via secure API routes (`/api/save`, `/api/sync`) and server actions (`/actions/shareActions`).
    *   Connection uses `MONGODB_URI` stored securely as an environment variable.
    *   Data access is strictly scoped to the authenticated user (`userId` from Clerk) in API routes and server actions.
    *   MongoDB Atlas typically provides encryption at rest and in transit (verify your Atlas configuration).
    *   Transactions are used for save operations to ensure atomicity across multiple collections.
    *   Rate limiting is applied to the `/api/save` endpoint.
*   **Client-Side Storage (Session Storage via Zustand Persist):**
    *   Used for caching data to improve performance and provide limited offline access during a session.
    *   **Encoding (Not Encryption):** Data in sessionStorage is encoded using Base64 via `storage-utils.ts`. **Base64 is easily reversible and does NOT provide confidentiality.**
    *   **Session Lifetime:** Session Storage is cleared automatically by the browser when the session ends (tab/window closed).
    *   **Logout/User Change:** The `useSyncManager` hook explicitly calls `clearLocalState` upon user sign-out or if the `userId` changes, removing persisted data from sessionStorage.
*   **Data Integrity:**
    *   Data synced between the client and server (`/api/save`, `/api/sync`) is hashed using SHA-256 (`storage-utils.ts`).
    *   The server verifies the received hash against a recalculated hash of the received data before saving (`/api/save`).
    *   The client verifies the hash received from the server during sync (`/api/sync`) before applying the data (implicit via `useSyncManager` structure).
    *   `fast-json-stable-stringify` is used before hashing to ensure consistent JSON stringification for accurate hash comparison.
*   **Transport Security:** HTTPS is assumed (typically handled by Vercel deployment).
*   **Logging:**
    *   Client-side console logs can be captured and viewed on the Logger page.
    *   API routes log operations and errors server-side (viewable via Vercel dashboard or server console).

**GDPR/DPA Compliance Considerations:**
*   **Lawfulness, Fairness, Transparency:** Requires a clear Privacy Policy explaining data collection, storage, processing, and user rights. Consent is obtained via Clerk's authentication flow.
*   **Purpose Limitation:** Data collected is limited to the app's financial management purpose.
*   **Data Minimisation:** Data collected is relevant and necessary.
*   **Accuracy:** Users can edit their financial data.
*   **Storage Limitation:** No automatic data deletion for inactive users is implemented. Data persists until manually deleted or account closure (requires implementation).
*   **Integrity & Confidentiality:**
    *   Integrity is addressed via hashing.
    *   Confidentiality is strong server-side (scoped access, DB encryption).
    *   **Client-side confidentiality is weak due to Base64 instead of encryption in sessionStorage.**
*   **Accountability:** This README and code comments document practices. Formal documentation (Privacy Policy, Data Processing Agreement) is needed.
*   **User Rights:**
    *   Access/Rectification: Provided via UI.
    *   Portability: Provided via CSV export.
    *   Erasure: Requires implementation (account deletion feature + backend data removal).
*   **Collaboration Feature:** Sharing requires user action. Clarity on what is shared and recipient notification is handled.

**Recommendations for Improvement:**
1.  **Encrypt Client-Side Cache:** Replace Base64 encoding in `storage-utils.ts` with actual encryption if sensitive data must be cached client-side.
2.  **Implement User Data Deletion:** Create a mechanism for users to request deletion of their account and associated data from MongoDB.
3.  **Formal Documentation:** Create and link a comprehensive Privacy Policy and Terms of Service.
4.  **Data Retention Policy:** Define and implement how long inactive user data is kept.
5.  **Review Third-Party Services:** Ensure Clerk, MongoDB Atlas, and Vercel configurations align with GDPR/DPA requirements.
6.  **Server-Side Audit Logs:** Implement more structured server-side audit logging.

**Conclusion:** The application has several key security measures. The main compliance gap is the lack of client-side encryption for cached data.
