
# IFC - Guru

This is a Next.js personal finance management application built in Firebase Studio.

**IMPORTANT NOTE:** MongoDB integration has been removed from this version of the application. All data is now stored locally in the browser's session storage. Data will be lost if session storage is cleared, or if you switch browsers/devices. Synchronization with a cloud database is disabled.

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
    Create a `.env` file in the root of your project and add the following environment variables. Replace the placeholder values if necessary:

    ```env
    # Mock User ID (Required for application to function without a backend database)
    # This ID will be used as the primary user identifier for local data operations.
    # Changing this ID will effectively start a new "user" session with fresh local data.
    NEXT_PUBLIC_MOCK_USER_ID=user_mock_123abc
    NEXT_PUBLIC_MOCK_USER_EMAIL=mockuser@example.com # Optional: for display purposes
    NEXT_PUBLIC_MOCK_USER_NAME="Mock User" # Optional: for display purposes

    # Google Generative AI API Key (Optional - For AI features like Debt Analysis, if still used)
    # Get this from Google AI Studio: https://aistudio.google.com/app/apikey
    GOOGLE_GENAI_API_KEY=

    # Optional: Logtail Source Token (For enhanced logging if logger is re-enabled)
    # NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN=
    ```
    **Important:** Ensure your `.env` file is added to your `.gitignore` file to prevent accidental exposure of secrets.

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
    - Add, edit, and delete data in each section. Data is saved to your browser's session storage.
    - Import/Export data using CSV files (this will interact with local data).
    - Use the weekly review feature. Sharing features are disabled due to MongoDB removal.

## Features

- **Dashboard:** Executive summary of your financial position.
- **Transactions:** View, add, edit, delete, and import/export financial transactions.
- **Income/Expenses Analysis:** Detailed breakdown of income and expenses.
- **Debt Management:** Track debts, view amortization schedules, import/export debt data. AI-powered strategies are disabled.
- **Financial Statements:** View Cash Flow and Net Worth statements.
- **Budgeting:** Create and manage budgets per month.
- **Weekly Review:** Review transactions, add comments, and journal. Sharing disabled.
- **Notifications:** In-app notifications for budget alerts and application info.
- **Logger:** View client-side logs.
- **Authentication:** Clerk is disabled. A mock user ID from `.env` is used.
- **Data Persistence:** Data is cached locally in Session Storage using Zustand persist middleware. **Cloud synchronization to MongoDB is disabled.**
- **Dark/Light Mode:** Theme toggle.
- **Responsive Design:** Adapts to different screen sizes.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS, Shadcn UI
- **State Management:** Zustand (with persist middleware for Session Storage)
- **Authentication:** Disabled (uses mock user ID from environment variable)
- **Database:** None (MongoDB has been removed)
- **AI (Optional):** Genkit (Debt Analysis features may be limited without persisted data history)
- **Data Handling:** `fast-json-stable-stringify`, Node.js `crypto` (for local hashing if still relevant)
- **Deployment:** Vercel (configured via `vercel.json`)

## Data Handling, Security & GDPR/DPA Compliance Review (Post-MongoDB Removal)

With MongoDB removed, the application's data handling model has significantly changed.

**Data Collected:**
*   No user authentication details are collected or managed by Clerk.
*   Financial data (Transactions, Debts, Assets, Liabilities, Budgets, Goals, Weekly Reviews) is entered by the user and stored *only* in their browser's session storage.
*   Notifications are generated and stored locally.
*   Client-side console logs can be viewed on the Logger page.

**Data Storage & Security:**
*   **Authentication:** Disabled. Application operates under a mock user context defined by `NEXT_PUBLIC_MOCK_USER_ID`.
*   **Server-Side Storage:** None. All data is client-side.
*   **Client-Side Storage (Session Storage via Zustand Persist):**
    *   This is the *only* storage location for user-entered financial data.
    *   **Encoding (Not Encryption):** Data in sessionStorage is Base64 encoded via `storage-utils.ts`. **Base64 is easily reversible and does NOT provide confidentiality.** Anyone with access to the browser's developer tools can inspect and decode this data.
    *   **Session Lifetime:** Session Storage is cleared automatically by the browser when the session ends (tab/window closed). **All data will be lost when the session ends.**
    *   **Data Loss Risk:** There is no backup or cloud persistence. Data loss is permanent if session storage is cleared or the session ends.
*   **Data Integrity:**
    *   Hashing mechanisms (`hashData`, `verifyHash`) were previously used for client-server sync. Without a server, their primary role for data integrity between client and a remote source is removed. They might still be used internally by `useSyncManager` if it attempts a "local" integrity check on rehydration, but this doesn't protect against client-side tampering or data corruption in session storage.
*   **Transport Security:** HTTPS is assumed if deployed (handled by Vercel), but data is not actively transported to a backend for persistence.
*   **Logging:** Client-side console logs can be captured and viewed. Server-side API logging is no longer relevant for data persistence.

**GDPR/DPA Compliance Considerations (Post-MongoDB Removal):**
*   **Lawfulness, Fairness, Transparency:** A Privacy Policy is still needed to explain what data is temporarily stored in the browser and how it's handled. Consent is implicit by usage.
*   **Purpose Limitation:** Data collected is for the app's financial management purpose, now entirely client-side.
*   **Data Minimisation:** Data collected is what the user inputs.
*   **Accuracy:** Users can edit their data (in session storage).
*   **Storage Limitation:** Data is *only* stored for the duration of the browser session. This aligns with storage limitation but at the cost of data persistence.
*   **Integrity & Confidentiality:**
    *   **Integrity:** Significantly reduced. Relies on browser mechanisms.
    *   **Confidentiality:** Very weak. Data in session storage is only Base64 encoded and accessible via browser dev tools.
*   **Accountability:** README and code document practices. Privacy Policy needed.
*   **User Rights:**
    *   Access/Rectification: Via UI (to session data).
    *   Portability: Via CSV export (of session data).
    *   Erasure: Achieved by closing the browser tab/session or clearing browser data.

**Conclusion (Post-MongoDB Removal):**
The application now functions as a client-side-only tool with temporary session-based storage. This dramatically simplifies the backend but **removes all cloud persistence, data backup, and multi-device synchronization capabilities.** Security relies heavily on the user's local browser security. The risk of data loss is high (upon session end). GDPR compliance is simplified due to no server-side PII storage, but client-side data handling and transparency remain important.

This setup is suitable for demonstrations or very simple, single-session use cases where data persistence beyond the session is not required.
