
# IFS - Guru

This is a Next.js personal finance management application built in Firebase Studio.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Set Up Environment Variables:**
    Create a `.env` file in the root of your project and add the following:

    *   **Database URL (Required for Prisma):**
        ```env
        # Example for PostgreSQL (e.g., NeonDB - Recommended for Production)
        DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require&options=endpoint%3DYOUR_NEON_ENDPOINT_ID"

        # Example for local SQLite (If you prefer for initial local dev, change provider in schema.prisma too)
        # DATABASE_URL="file:./dev.db"
        ```
    *   **Clerk Keys (Required for Authentication):**
        ```env
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
        CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY
        ```
    *   **Google Generative AI API Key (Optional for AI features):**
        ```env
        GOOGLE_GENAI_API_KEY=YOUR_GOOGLE_GENAI_API_KEY
        ```
    *   **Google Analytics (Optional for tracking):**
        ```env
        NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
        ```
    *   **Upstash Redis (Optional, for API Rate Limiting):**
        If you want to use API rate limiting for the save endpoint:
        ```env
        KV_URL=YOUR_UPSTASH_KV_URL
        KV_REST_API_URL=YOUR_UPSTASH_KV_REST_API_URL
        KV_REST_API_TOKEN=YOUR_UPSTASH_KV_REST_API_TOKEN
        KV_REST_API_READ_ONLY_TOKEN=YOUR_UPSTASH_KV_REST_API_READ_ONLY_TOKEN
        ```

3.  **Set Up Prisma:**
    *   Ensure you have `prisma/schema.prisma` (The Prototyper should provide this).
    *   Make sure your `DATABASE_URL` in `.env` is correctly set for your PostgreSQL instance (e.g., NeonDB).
    *   Run database migrations:
        ```bash
        npx prisma migrate dev --name init_postgresql 
        ```
        (Or a more descriptive name if you're migrating from an existing setup).
    *   Generate Prisma Client:
        ```bash
        npx prisma generate
        ```
        (This is also run automatically by `npm install` and `npm run build` due to the `postinstall` and `build` scripts in `package.json`).


4.  **Run the Development Server:**
    ```bash
    npm run dev
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
- **Weekly Review:** Review transactions, add comments, and journal. Share reviews with other users.
- **Notifications:** In-app notifications for budget alerts, collaboration, and application info.
- **Logger:** View client-side console logs.
- **Authentication:** Clerk for user authentication and management.
- **Data Persistence:** Server-side via Prisma (PostgreSQL recommended) and client-side caching/sync with Zustand.
- **Dark/Light Mode:** Theme toggle.
- **Responsive Design:** Adapts to different screen sizes.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS, Shadcn UI
- **State Management:** Zustand (with persist middleware for Session Storage as a client-side cache)
- **ORM:** Prisma
- **Database:** PostgreSQL (NeonDB recommended for production)
- **Authentication:** Clerk
- **AI:** Genkit
- **Data Handling & Validation:** Zod, `fast-json-stable-stringify`
- **Deployment:** Vercel (configured via `vercel.json`).

## Data Handling & Security

- **Data Storage:**
    *   **Primary Storage:** Server-side database (PostgreSQL) managed by Prisma.
    *   **Client-Side Cache:** Browser Session Storage via Zustand persist middleware, synchronized with the server.
- **Authentication:** Managed by Clerk. All sensitive API routes are protected.
- **Data Integrity:** Hashing mechanism used to verify data consistency between client and server during synchronization.
- **Transport Security:** HTTPS (handled by Vercel/localhost).
- **Environment Variables:** Database credentials, Clerk keys, AI keys, and other secrets are stored as environment variables.
- **User Data Segregation:** All database queries are scoped by `userId` to ensure users can only access their own data.

**GDPR/DPA Compliance Considerations:**
- **Data Processing:** CRUD operations involve both client-side interactions and server-side database persistence.
- **Data Controller/Processor:** Depending on your deployment, you are the data controller.
- **User Rights:** Users can view and manage their data through the application. Deletion requests would need to be handled.
- **Transparency:** A clear privacy policy is essential, detailing data storage, processing, and user rights.


