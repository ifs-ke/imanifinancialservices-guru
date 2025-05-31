
# IFC - Guru

This is a Next.js personal finance management application built in Firebase Studio.

**IMPORTANT NOTE:** This application now uses **local browser storage (Session Storage)** for all data. Data will persist for the current browser session but will not be synced across devices or be available after the session ends completely (though some browsers might retain session storage longer). There is no server-side database persistence.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Set Up Environment Variables (Optional):**
    Create a `.env` file in the root of your project.
    *   **Clerk Keys (Required for full functionality if re-enabled, but core app runs without them in its current local-only state):**
        ```env
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
        CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY
        ```
    *   **Mock User ID (Used if Clerk is not fully configured or for testing local state segregation):**
        ```env
        NEXT_PUBLIC_MOCK_USER_ID=user_mock_123abc
        NEXT_PUBLIC_MOCK_USER_EMAIL=mockuser@example.com
        NEXT_PUBLIC_MOCK_USER_NAME="Mock User"
        ```
    *   **Google Generative AI API Key (Optional for AI features):**
        ```env
        GOOGLE_GENAI_API_KEY=
        ```
    *   **Note:** `DATABASE_URL` is no longer used.

3.  **Run the Development Server:**
    ```bash
    npm run dev
    # or
    # yarn dev
    # or
    # pnpm dev
    ```
    The application will be available at [http://localhost:9002](http://localhost:9002) (or the specified port).

## Features

- **Dashboard:** Executive summary of your financial position.
- **Transactions:** View, add, edit, delete, and import/export financial transactions.
- **Income/Expenses Analysis:** Detailed breakdown of income and expenses.
- **Debt Management:** Track debts, view amortization schedules, import/export debt data. AI strategy suggestions.
- **Investment Tracking:** Manage investment entries.
- **Financial Statements:** View Cash Flow and Net Worth statements.
- **Budgeting:** Create and manage budgets per month.
- **Weekly Review:** Review transactions, add comments, and journal. (Sharing disabled in local-only mode).
- **Notifications:** In-app notifications for budget alerts and application info.
- **Logger:** View client-side console logs.
- **Authentication:** Configured for Clerk, but core app functions locally using mock user ID if Clerk keys aren't fully active for sign-in.
- **Data Persistence:** **Client-side Session Storage via Zustand.**
- **Dark/Light Mode:** Theme toggle.
- **Responsive Design:** Adapts to different screen sizes.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS, Shadcn UI
- **State Management:** Zustand (with persist middleware for Session Storage)
- **ORM:** (Removed - Was Prisma)
- **Database:** (Removed - Was PostgreSQL/SQLite)
- **Authentication:** Clerk (optional for basic local use, required for any potential future server-side user features)
- **AI (Optional):** Genkit
- **Data Handling & Validation:** Zod, `fast-json-stable-stringify`
- **Deployment:** Vercel (configured via `vercel.json` - Note: serverless functions for save/sync are now non-operational for DB persistence).

## Data Handling & Security (Local-Only Mode)

With the removal of server-side database persistence, all application data is stored in the user's browser Session Storage.

**Data Collected & Stored (Locally):**
*   User authentication details (if Clerk is used for login) are managed by Clerk. Local state might use a mock user ID.
*   User profile preferences (like statement dates, getting started dismissed state).
*   Financial data (Transactions, Debts, Investments, Assets, Liabilities, Budgets, Weekly Reviews, Notifications) entered by the user.

**Data Storage & Security:**
*   **Primary Storage:** Browser Session Storage. This data is typically cleared when the browser session ends.
*   **Authentication:** Clerk (if login is performed). If Clerk is not fully active, a mock user ID from environment variables is used to namespace local storage.
*   **Data Integrity (Local):** Hashing for client-server integrity is no longer applicable.
*   **No Server-Side Persistence:** Data is not sent to or stored on any server database. API routes for save/sync are non-operational regarding database writes.
*   **Transport Security:** HTTPS (handled by Vercel/localhost) is still important for protecting Clerk authentication flows if used.
*   **Environment Variables:** Clerk keys and AI keys should be stored securely as environment variables.

**GDPR/DPA Compliance Considerations (Local-Only Mode):**
*   **Data Processing:** All data processing (CRUD operations) happens client-side.
*   **Data Controller/Processor:** The user is effectively the controller of their data stored locally in their browser. The application acts as a tool.
*   **User Rights:** Users have direct control over their data within their browser (e.g., clearing browser data).
*   **Transparency:** A privacy policy should still clarify that data is stored locally and no personal financial data is transmitted to your servers for storage.

**Conclusion (Local-Only Mode):**
The application now functions as a client-side tool with data stored locally in Session Storage. This simplifies deployment and removes backend database dependencies but means data is ephemeral to the browser session and not shareable or accessible across devices without manual export/import. Security of the data relies on the security of the user's local browser environment.
