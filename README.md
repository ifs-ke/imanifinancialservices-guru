# IFC - Guru

This is a Next.js personal finance management application built in Firebase Studio.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

2.  **Set Up Environment Variables:**
    Create a `.env` file in the root of your project and add the following environment variables. Replace the placeholder values with your actual credentials:

    ```env
    # Clerk Environment Variables (Required for Authentication)
    # Get these from your Clerk Dashboard: https://dashboard.clerk.com
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... # Replace with your actual publishable key
    CLERK_SECRET_KEY=sk_test_... # Replace with your actual secret key

    # MongoDB Connection String (Required for Data Persistence)
    # Replace with your actual MongoDB connection string
    # Example: MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database-name>?retryWrites=true&w=majority
    MONGODB_URI=

    # Google Generative AI API Key (Optional - For AI features like Debt Analysis)
    # Get this from Google AI Studio: https://aistudio.google.com/app/apikey
    GOOGLE_GENAI_API_KEY=

    # Logtail Source Token (Optional - For client-side and notification logging)
    # Get this from your Logtail source settings: https://betterstack.com/logtail (or app.logtail.com)
    NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN=
    ```
    **Important:** Ensure your `.env` file is added to your `.gitignore` file to prevent accidental exposure of secrets.

3.  **Run the Development Server:**
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

    The application will be available at [http://localhost:9002](http://localhost:9002) (or the specified port).

4.  **Explore the App:**
    - Navigate through the different sections using the sidebar: Dashboard, Transactions, Income/Expenses, Debts, Statements, Budget, Weekly Review.
    - Add, edit, and delete data in each section.
    - Import/Export data using CSV files.
    - Use the weekly review feature to add comments to transactions and journal entries.
    - Share weekly reviews with other users for collaboration.

## Features

- **Dashboard:** Executive summary of your financial position (Net Worth, Cash Flow, Assets, Liabilities, Budget Variance, Debt Payoff Timeline).
- **Transactions:** View, add, edit, delete, and import/export financial transactions. Categorize transactions by frequency and variability.
- **Income/Expenses Analysis:** Detailed breakdown of income and expenses based on categories.
- **Debt Management:** Track debts (long-term/short-term), view amortization schedules, import/export debt data, and get AI-powered payoff strategies (optional).
- **Financial Statements:** View Cash Flow and Net Worth statements based on your data and selected date ranges. Edit Assets and Other Liabilities directly. Includes a Budget Variance report based on the selected period.
- **Budgeting:** Create and manage budgets item by item (Income, Recurring/One-Time Expenses, Goals, Debt Allocation).
- **Weekly Review:** Review transactions week by week, add comments to specific transactions, and maintain a weekly financial journal. Includes collaboration features (sharing reviews).
- **Authentication:** Secure user authentication powered by Clerk.
- **Data Persistence & Sync:** Data is cached locally in Session Storage using Zustand persist middleware and synced securely to MongoDB for authenticated users. Includes data integrity checks with SHA-256 hashing.
- **Dark/Light Mode:** Theme toggle for user preference.
- **Responsive Design:** Adapts to different screen sizes.
- **Notifications:** In-app notifications for budget alerts, collaboration updates, and application info. Logged to Logtail (if configured).
- **Admin Logger:** (Admin Role Only - currently displays client-side console logs for any user) Basic page structure for viewing application logs. Client-side logs are also sent to Logtail (if configured).

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS, ShadCN UI
- **State Management:** Zustand (with persist middleware)
- **Authentication:** Clerk
- **Database:** MongoDB (via official Node.js driver)
- **AI (Optional):** Genkit (for Debt Analysis)
- **Logging (Optional):** Logtail (via @logtail/browser for client-side and notification logging)
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
*   Notifications (stored locally and potentially logged to Logtail).
*   Client-side console logs (viewable on Logger page and potentially logged to Logtail).

**Data Storage & Security:**
*   **Authentication:** Handled securely by Clerk, following industry best practices.
*   **Server-Side Storage (MongoDB):**
    *   Accessed via secure API routes (`/api/save`, `/api/sync`) and server actions (`/actions/shareActions`).
    *   Connection uses `MONGODB_URI` stored securely as an environment variable.
    *   Data access is strictly scoped to the authenticated user (`userId`) in API routes and server actions.
    *   MongoDB Atlas typically provides encryption at rest and in transit (verify your Atlas configuration).
    *   Transactions are used for save operations to ensure atomicity across multiple collections.
    *   Rate limiting is applied to the `/api/save` endpoint.
*   **Client-Side Storage (Session Storage via Zustand Persist):**
    *   Used for caching data to improve performance and provide limited offline access during a session.
    *   **Encoding (Not Encryption):** Data in sessionStorage is encoded using Base64 via `storage-utils.ts`. **Base64 is easily reversible and does NOT provide confidentiality.** This is a known limitation.
    *   **Session Lifetime:** Session Storage is cleared automatically by the browser when the session ends (tab/window closed).
    *   **Logout/User Change:** The `useSyncManager` hook explicitly calls `clearLocalState` upon user sign-out or if the `userId` changes, removing persisted data from sessionStorage to prevent data leakage between users on the same browser.
*   **Data Integrity:**
    *   Data synced between the client and server (`/api/save`, `/api/sync`) is hashed using SHA-256 (`storage-utils.ts`).
    *   The server verifies the received hash against a recalculated hash of the received data before saving (`/api/save`).
    *   The client verifies the hash received from the server during sync (`/api/sync`) before applying the data (implicit via `useSyncManager` structure).
    *   `fast-json-stable-stringify` is used before hashing to ensure consistent JSON stringification for accurate hash comparison.
*   **Transport Security:** HTTPS is assumed (typically handled by Vercel deployment).
*   **Logging:**
    *   Client-side console logs can be captured and viewed on the Logger page.
    *   Application notifications and client-side console logs can be sent to Logtail if `NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN` is configured. Logtail data handling is subject to BetterStack's policies.

**GDPR/DPA Compliance Considerations:**
*   **Lawfulness, Fairness, Transparency:** Requires a clear Privacy Policy explaining data collection, storage, processing, and user rights. Consent should be obtained appropriately (Clerk handles auth consent, app-specific processing might need more).
*   **Purpose Limitation:** Data collected appears limited to the app's financial management purpose.
*   **Data Minimisation:** Data collected seems relevant and necessary for the app's features.
*   **Accuracy:** Users can edit their financial data (transactions, debts, assets, etc.).
*   **Storage Limitation:** No automatic data deletion for inactive users is implemented. Data persists until manually deleted or account closure (requires implementation). A data retention policy should be defined.
*   **Integrity & Confidentiality:**
    *   Integrity is addressed via hashing.
    *   Confidentiality is strong server-side (scoped access, DB encryption).
    *   **Client-side confidentiality is weak due to the use of Base64 instead of encryption in sessionStorage.** This is the main area needing improvement for full compliance regarding sensitive data caching.
*   **Accountability:** This README and code comments document practices. Formal documentation (Privacy Policy, Data Processing Agreement if applicable) is needed.
*   **User Rights:**
    *   Access/Rectification: Provided via UI.
    *   Portability: Provided via CSV export for transactions/debts.
    *   Erasure: Requires implementation (account deletion feature + backend data removal).
*   **Collaboration Feature:** Sharing requires user action. Clarity on what is shared and recipient notification is handled.

**Recommendations for Improvement:**
1.  **Encrypt Client-Side Cache:** Replace Base64 encoding in `storage-utils.ts` and the Zustand `persist` middleware storage adapter with actual encryption (e.g., using `SubtleCrypto`) if sensitive data *must* be cached client-side. Alternatively, redesign to minimize sensitive client-side caching.
2.  **Implement User Data Deletion:** Create a mechanism for users to request deletion of their account and associated data from MongoDB.
3.  **Formal Documentation:** Create and link a comprehensive Privacy Policy and Terms of Service.
4.  **Data Retention Policy:** Define and implement how long inactive user data is kept.
5.  **Review Third-Party Services:** Ensure Clerk, MongoDB Atlas, Logtail, and Vercel configurations align with GDPR/DPA requirements.
6.  **Server-Side Audit Logs (Advanced):** For enhanced security, implement server-side audit logging for sensitive actions (data modifications, sharing, admin actions if any). This is separate from application/debug logging.
7.  **Logger Page Access Control:** If the Logger page is intended only for admins, re-implement role checks for accessing it. Currently, it displays client-side logs for any authenticated user.

**Conclusion:** The application has implemented several key security measures, including user-scoped data access, integrity checks via hashing, MongoDB transactions, and session clearing on logout. The main compliance gap regarding sensitive data handling is the lack of **encryption** for client-side caching in Session Storage. Address this and add formal documentation/policies to significantly improve compliance posture. The addition of Logtail for logging should be accompanied by a review of Logtail's own data handling and privacy policies.

```
  </change>
  <change>
    <file>src/lib/logger.ts</file>
    <description>Create Logtail client initialization and export logging functions.</description>
    <content><![CDATA[// src/lib/logger.ts
'use client'; // This file will be used by client components

import { Logtail } from '@logtail/browser';
import { auth } from '@clerk/nextjs/client'; // Use client-side auth

const LOGTAIL_SOURCE_TOKEN = process.env.NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN;

let log: Logtail | null = null;

if (typeof window !== 'undefined' && LOGTAIL_SOURCE_TOKEN) {
  try {
    log = new Logtail(LOGTAIL_SOURCE_TOKEN);
    console.info('Logtail client initialized.');
  } catch (error) {
    console.error('Failed to initialize Logtail client:', error);
  }
} else if (typeof window !== 'undefined' && !LOGTAIL_SOURCE_TOKEN) {
  console.warn('Logtail source token is not configured. Logging to Logtail is disabled.');
}

const getContext = () => {
  const { userId, sessionId, orgId, actor } = auth();
  return {
    clerk: {
      userId: userId || undefined,
      sessionId: sessionId || undefined,
      orgId: orgId || undefined,
      actor: actor || undefined,
    },
    environment: process.env.NODE_ENV,
    // Add any other relevant context you want to include with every log
  };
};

export const logInfo = (message: string, context?: Record<string, any>) => {
  if (log) {
    log.info(message, { ...getContext(), ...context });
  } else {
    console.info(`[Logtail Disabled] INFO: ${message}`, context || '');
  }
};

export const logWarn = (message: string, context?: Record<string, any>) => {
  if (log) {
    log.warn(message, { ...getContext(), ...context });
  } else {
    console.warn(`[Logtail Disabled] WARN: ${message}`, context || '');
  }
};

export const logError = (message: string, error?: Error | any, context?: Record<string, any>) => {
  const errorContext = error instanceof Error ? { error: { message: error.message, stack: error.stack } } : { error: error };
  if (log) {
    log.error(message, { ...getContext(), ...errorContext, ...context });
  } else {
    console.error(`[Logtail Disabled] ERROR: ${message}`, error || '', context || '');
  }
};

// Generic log function for console overrides
export const captureLog = (level: 'log' | 'info' | 'warn' | 'error', messages: any[]) => {
    const messageString = messages.map(msg => typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)).join(' ');
    const logContext = getContext();

    if (log) {
        switch (level) {
            case 'info':
            case 'log':
                log.info(messageString, logContext);
                break;
            case 'warn':
                log.warn(messageString, logContext);
                break;
            case 'error':
                log.error(messageString, logContext);
                break;
        }
    } else {
         console.log(`[Logtail Disabled] CAPTURED ${level.toUpperCase()}:`, ...messages);
    }
};

// Export the raw log instance if needed for direct use (e.g., in Logtail specific features)
export { log as logtailClient };
