# petty cash

petty cash is a centralized web platform built for modern finance teams. It is designed to track, manage, and audit petty cash operations with AI-powered automations.

## Features
- **Invoices & Cash Control**: Upload invoices, manage cash inflows, and handle employee requests.
- **Role-Based Access Control (RBAC)**: Secure access tailored for `Super Admin`, `Admin Uploader`, and `Viewer`.
- **Microsoft Graph Sync**: Seamlessly synchronize your financial tables with an external Microsoft Excel Workbook.
- **Intelligent Assistant (AI)**: An integrated Q&A bot and an interactive Floating Chat Assistant capable of fetching reports and providing summaries directly inside the app.
- **WhatsApp/SMS Integration**: Powered by Twilio to receive AI-driven petty cash summaries directly on your phone.
- **Audit Logs**: Immutable records of critical financial actions.

## Technology Stack
- **Frontend**: React 19, TypeScript, Vite, TanStack Router (File-based routing), Tailwind CSS v4, and shadcn/ui.
- **Backend**: Supabase (PostgreSQL, Authentication, Realtime, Edge Functions).
- **AI**: OpenAI `gpt-4o-mini` (powered via Supabase Edge Functions).
- **Exporting**: ExcelJS for generating detailed `.xlsx` reports and `jspdf` for PDF generation.

## Local Development
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create a `.env` file in the root of the project by copying the provided `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Fill out the values with your Supabase Project URL and Anon Key.

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`.

## Deployment (Render)
This project is optimized to run as a **Static Site** on Render.

1. Push your code to your GitHub repository.
2. In Render, create a new **Static Site** and connect the repository.
3. Use the following configuration:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. **Environment Variables**: Add your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Render's Advanced settings.
5. **Rewrites**: In Render's "Redirects/Rewrites", set Source to `/*`, Destination to `/index.html`, and Action to `Rewrite`.
6. Click **Create Static Site**.

## Edge Functions
The AI features are powered by Supabase Edge Functions. To update them:
```bash
npx supabase functions deploy app-bot
npx supabase functions deploy twilio-bot
```
Make sure you have set the `OPENAI_API_KEY` secret in your Supabase project dashboard.
