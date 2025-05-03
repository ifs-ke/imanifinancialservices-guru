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
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
    CLERK_SECRET_KEY=sk_test_...

    # MongoDB Connection String (Required for Data Persistence)
    # Replace with your actual MongoDB connection string
    # Example: MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database-name>?retryWrites=true&w=majority
    MONGODB_URI=

    # Google Generative AI API Key (Optional - For AI features like Debt Analysis)
    # Get this from Google AI Studio: https://aistudio.google.com/app/apikey
    GOOGLE_GENAI_API_KEY=
    ```

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

## Features

- **Dashboard:** Executive summary of your financial position (Net Worth, Cash Flow, Assets, Liabilities, Budget Variance, Debt Payoff Timeline).
- **Transactions:** View, add, edit, delete, and import/export financial transactions. Categorize transactions by frequency and variability.
- **Income/Expenses Analysis:** Detailed breakdown of income and expenses based on categories.
- **Debt Management:** Track debts (long-term/short-term), view amortization schedules, import/export debt data, and get AI-powered payoff strategies (optional).
- **Financial Statements:** View Cash Flow and Net Worth statements based on your data and selected date ranges. Edit Assets and Other Liabilities directly. Includes a Budget Variance report.
- **Budgeting:** Create and manage budgets item by item (Income, Recurring/One-Time Expenses, Goals).
- **Weekly Review:** Review transactions week by week, add comments to specific transactions, and maintain a weekly financial journal.
- **Authentication:** Secure user authentication powered by Clerk.
- **Data Persistence:** Data is saved locally in the browser using Zustand persist middleware and can be synced to MongoDB if configured.
- **Dark/Light Mode:** Theme toggle for user preference.
- **Responsive Design:** Adapts to different screen sizes.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS, ShadCN UI
- **State Management:** Zustand
- **Authentication:** Clerk
- **Database:** MongoDB (via Mongoose)
- **AI (Optional):** Genkit (for Debt Analysis)
- **Linting/Formatting:** ESLint, Prettier (implicitly via Next.js defaults)
- **Deployment:** Vercel (configured via `vercel.json`)
