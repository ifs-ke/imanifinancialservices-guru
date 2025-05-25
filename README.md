

# IFC - Guru

This is a Next.js personal finance management application built in Firebase Studio.

**IMPORTANT NOTE:** This application is configured to use Prisma ORM.
By default, it's set up for NeonDB (PostgreSQL).

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Set Up Environment Variables:**
    Create a `.env` file in the root of your project and add the following environment variables.
    *   **`DATABASE_URL`**: Your NeonDB (or other PostgreSQL) connection string.
        Example for NeonDB: `DATABASE_URL="postgresql://YOUR_NEON_USER:YOUR_NEON_PASSWORD@YOUR_NEON_HOST/YOUR_NEON_DB_NAME?sslmode=require"`
        **You MUST replace the placeholder with your actual NeonDB connection string.**
    *   **(Optional) Clerk Keys:** If you decide to enable Clerk authentication, uncomment and fill these:
        ```env
        # NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
        # CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY
        ```
    *   **Mock User ID (if Clerk is disabled or for testing):**
        ```env
        NEXT_PUBLIC_MOCK_USER_ID=user_mock_123abc
        NEXT_PUBLIC_MOCK_USER_EMAIL=mockuser@example.com
        NEXT_PUBLIC_MOCK_USER_NAME="Mock User"
        ```
    *   **Google Generative AI API Key (Optional):**
        ```env
        GOOGLE_GENAI_API_KEY=
        ```

3.  **Prisma Setup:**
    *   **Generate Prisma Client:** After setting your `DATABASE_URL` and ensuring `prisma/schema.prisma` has `provider = "postgresql"`, run:
        ```bash
        npx prisma generate
        ```
    *   **Run Migrations:** This will create the database schema in your NeonDB instance.
        ```bash
        npx prisma migrate dev --name init_neondb
        ```
        (If you previously used SQLite and are switching, you might need to delete the old `prisma/dev.db` and `prisma/migrations` folder first, then run `npx prisma migrate dev --name init_neondb`.)

4.  **Run the Development Server:**
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
- **Debt Management:** Track debts, view amortization schedules, import/export debt data.
- **Financial Statements:** View Cash Flow and Net Worth statements.
- **Budgeting:** Create and manage budgets per month.
- **Weekly Review:** Review transactions, add comments, and journal.
- **Notifications:** In-app notifications for budget alerts and application info.
- **Logger:** View client-side console logs.
- **Authentication:** Configured for Clerk, but can run with a mock user if Clerk keys are not provided.
- **Data Persistence:** Prisma ORM with a PostgreSQL-compatible database (NeonDB recommended).
- **Dark/Light Mode:** Theme toggle.
- **Responsive Design:** Adapts to different screen sizes.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS, Shadcn UI
- **State Management:** Zustand (with persist middleware for Session Storage - client-side cache)
- **ORM:** Prisma
- **Database:** PostgreSQL-compatible (NeonDB recommended for Vercel deployment)
- **Authentication:** Clerk (optional, can run with mock user)
- **AI (Optional):** Genkit
- **Data Handling & Validation:** Zod, `fast-json-stable-stringify`, Node.js `crypto` (for local hashing if still relevant for client-server integrity checks if implemented beyond Prisma's capabilities)
- **Deployment:** Vercel (configured via `vercel.json`)

## Data Handling & Security (with Prisma & NeonDB)

With Prisma and a cloud database like NeonDB, data handling changes significantly from a session-storage-only approach.

**Data Collected:**
*   User authentication details (if Clerk is enabled) are managed by Clerk.
*   User profile information (statement dates, preferences) is stored.
*   Financial data (Transactions, Debts, Assets, Liabilities, Budgets, Weekly Reviews, Notifications) entered by the user is stored in the database.

**Data Storage & Security:**
*   **Authentication:** Preferably Clerk. If disabled, relies on `NEXT_PUBLIC_MOCK_USER_ID`.
*   **Database:** NeonDB (PostgreSQL) or a similar cloud-hosted/self-hosted PostgreSQL database.
    *   Data is persisted server-side.
    *   Security of the database itself is managed by the database provider (e.g., NeonDB's security features, SSL connections).
*   **Prisma Client:** Provides a type-safe interface to the database.
*   **Transport Security:** HTTPS should be enforced for all client-server communication (typically handled by Vercel).
*   **Environment Variables:** `DATABASE_URL` and other sensitive keys must be stored securely as environment variables, not in code.
*   **Logging:** Client-side console logs. Server-side API and database query logging should be configured for monitoring and debugging.

**GDPR/DPA Compliance Considerations (with Prisma & NeonDB):**
*   **Lawfulness, Fairness, Transparency:** Privacy Policy and Terms of Service are crucial. Clearly state what data is collected, why, and how it's processed.
*   **Purpose Limitation:** Data collected is for the app's financial management purpose.
*   **Data Minimisation:** Collect only necessary data.
*   **Accuracy:** Users can edit their data via the UI.
*   **Storage Limitation:** Data is stored as long as the user account is active or as per your data retention policy.
*   **Integrity & Confidentiality:**
    *   **Integrity:** Relies on database ACID properties and potentially application-level checks.
    *   **Confidentiality:** SSL/TLS for data in transit. Database-level encryption at rest (provided by NeonDB/PostgreSQL). Consider application-level encryption for highly sensitive fields if necessary.
*   **Accountability:** Document data processing activities. Implement data protection impact assessments (DPIAs) if processing high-risk data.
*   **User Rights:** Implement mechanisms for users to exercise their rights (access, rectification, erasure, portability). Prisma can facilitate data retrieval for these requests.

**Conclusion (with Prisma & NeonDB):**
Using Prisma with a cloud database like NeonDB provides robust, persistent storage and a more scalable backend. It shifts the data security responsibility significantly to the database provider and proper application-level security practices (secure coding, dependency management, secure authentication). GDPR/DPA compliance requires careful planning and implementation of policies and user rights management features.
