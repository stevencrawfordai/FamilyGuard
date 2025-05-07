# Family Guard Application Architecture Design

This document outlines the detailed application architecture for Family Guard, a Next.js web application designed to provide AI-assisted legal help for family law matters.

## 1. Overview

The application will use a modern tech stack including Next.js (with App Router and TypeScript), Tailwind CSS with Shadcn UI for the frontend, Prisma ORM for database interaction (SQLite for development, PostgreSQL for production), NextAuth.js for authentication, Stripe for subscription payments, OpenAI API (GPT-4 with GPT-3.5 fallback) for AI features, and Supabase Storage for file storage.

## 2. Project Structure

The project will be organized as follows, primarily within the `/home/ubuntu/FamilyGuard/src` directory:

```
/FamilyGuard
├── prisma/                     # Prisma schema and migrations
│   ├── schema.prisma
│   └── migrations/
├── public/                     # Static assets (images, fonts, etc.)
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Route group for authentication pages
│   │   │   ├── sign-in/page.tsx
│   │   │   ├── sign-up/page.tsx
│   │   │   └── mfa-setup/page.tsx
│   │   ├── (dashboard)/        # Protected routes for logged-in users
│   │   │   ├── layout.tsx      # Layout for dashboard pages
│   │   │   ├── page.tsx        # Dashboard landing page
│   │   │   ├── chat/page.tsx   # AI Q&A chat interface
│   │   │   ├── forms/
│   │   │   │   ├── new/page.tsx # Form wizard for new forms
│   │   │   │   └── [formId]/page.tsx # View/edit existing form data (future)
│   │   │   ├── documents/page.tsx # Document management page
│   │   │   └── billing/page.tsx   # Billing management (Stripe portal)
│   │   ├── api/                  # Backend API routes
│   │   │   ├── auth/[...nextauth]/route.ts # NextAuth.js handlers
│   │   │   ├── ai/
│   │   │   │   ├── chat/route.ts           # AI Q&A endpoint
│   │   │   │   └── form-wizard/route.ts    # Form generation endpoint
│   │   │   ├── stripe/webhook/route.ts   # Stripe webhook handler
│   │   │   └── documents/
│   │   │       ├── route.ts                # List documents
│   │   │       └── [documentId]/route.ts   # Get/delete specific document
│   │   ├── layout.tsx            # Root layout for the application
│   │   └── page.tsx              # Main landing/marketing page
│   ├── components/               # Reusable React components
│   │   ├── ui/                   # Shadcn UI components (auto-generated)
│   │   ├── AuthForm.tsx
│   │   ├── BillingButton.tsx
│   │   ├── ChatWidget.tsx
│   │   ├── DocumentList.tsx
│   │   ├── DocumentPreview.tsx   # (Modal or separate view)
│   │   ├── Footer.tsx
│   │   ├── FormWizard.tsx
│   │   ├── MFAEnrollment.tsx
│   │   └── Navbar.tsx
│   ├── lib/                      # Shared libraries, helpers, and configurations
│   │   ├── auth.ts               # NextAuth.js options and configurations
│   │   ├── prisma.ts             # Prisma client instance
│   │   ├── prompts.ts            # AI prompt templates
│   │   ├── stripe.ts             # Stripe SDK initialization and helpers
│   │   ├── openai.ts             # OpenAI API client and helpers
│   │   ├── supabase.ts           # Supabase client for storage
│   │   └── utils.ts              # General utility functions
│   ├── styles/                   # Global styles
│   │   └── globals.css
├── .env.local                  # Environment variables (ignored by Git)
├── next.config.mjs             # Next.js configuration
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
└── wrangler.toml               # (From template, may need adjustment or removal if not using Cloudflare Workers directly for DB)
```

## 3. Frontend Components (`src/components`)

-   **`Navbar.tsx`**: Main navigation, displays user authentication status, links to dashboard, pricing, and auth pages.
-   **`Footer.tsx`**: Standard application footer.
-   **`PlanSelector.tsx`**: (Part of `app/page.tsx` or a dedicated pricing page) Displays subscription plans (Free, Basic $25/mo, Premium $60/mo) and initiates Stripe Checkout.
-   **`AuthForm.tsx`**: Handles email/password sign-up/sign-in and Google OAuth flow.
-   **`MFAEnrollment.tsx`**: Guides users through TOTP MFA setup using `speakeasy` and displays QR codes.
-   **`DashboardLayout.tsx`**: Provides the common layout structure for all pages within the protected `/dashboard` route group.
-   **`ChatWidget.tsx`**: User interface for the AI Q&A feature, sends requests to `/api/ai/chat`.
-   **`FormWizard.tsx`**: A multi-step component for collecting data for legal forms (e.g., custody agreements).
    -   `FormStep.tsx`: Represents an individual step/section within the wizard.
    -   `FormSummary.tsx`: Displays a summary of collected data before final submission.
-   **`DocumentList.tsx`**: Displays a list of documents generated or uploaded by the user, with options to preview and download PDFs.
-   **`DocumentPreview.tsx`**: A modal or dedicated view to display the content of a PDF document.
-   **`BillingButton.tsx`**: A button that redirects authenticated users to the Stripe Customer Portal to manage their subscriptions.

## 4. Backend API Routes (`src/app/api`)

-   **`auth/[...nextauth]/route.ts`**: Handles all NextAuth.js authentication logic, including email/password, Google OAuth, session management, and MFA verification callbacks.
-   **`ai/chat/route.ts`**: 
    -   Secured endpoint requiring authentication.
    -   Proxies user queries to the OpenAI API (GPT-4, with GPT-3.5 Turbo as a fallback).
    -   Utilizes prompt templates from `lib/prompts.ts`.
    -   Manages OpenAI API key securely from environment variables.
    -   Enforces subscription plan-based rate limits or access controls for AI queries.
-   **`ai/form-wizard/route.ts`**: 
    -   Secured endpoint requiring authentication.
    -   Receives structured form data from the `FormWizard.tsx` component.
    -   Stores the submitted form data in the database via Prisma (`FormData` model).
    -   Constructs a detailed prompt using the form data and templates from `lib/prompts.ts`.
    -   Calls the OpenAI API to generate the draft document text.
    -   Uses `pdf-lib` to generate a PDF from the AI-generated text.
    -   Uploads the generated PDF to Supabase Storage.
    -   Saves metadata about the generated document (name, storage path, user association) in the database (`Document` model).
-   **`stripe/webhook/route.ts`**: 
    -   Publicly accessible endpoint for receiving webhooks from Stripe.
    -   Verifies the Stripe webhook signature for security.
    -   Handles various Stripe events:
        -   `checkout.session.completed`: Provisions or updates user subscription, stores Stripe Customer ID and Subscription ID.
        -   `invoice.paid`: Confirms successful recurring payments.
        -   `customer.subscription.updated`, `customer.subscription.deleted`: Updates user plan status in the database.
-   **`documents/route.ts`**: 
    -   `GET`: Fetches a list of documents belonging to the authenticated user.
-   **`documents/[documentId]/route.ts`**: 
    -   `GET`: Fetches a specific document or a presigned URL for downloading it from Supabase Storage.
    -   `DELETE`: Deletes a document (both metadata from the database and the file from Supabase Storage).

## 5. Database Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite" // Development: sqlite
  // provider = "postgresql" // Production: postgresql
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?   // For OAuth profile picture
  password      String?   // For email/password auth (hashed)
  accounts      Account[] // For NextAuth.js OAuth
  sessions      Session[] // For NextAuth.js sessions
  authenticators Authenticator[] // For NextAuth.js TOTP MFA

  // Application-specific fields
  stripeCustomerId  String?   @unique
  stripeSubscriptionId String? @unique
  stripePriceId     String?
  stripeCurrentPeriodEnd DateTime?
  plan              PlanType  @default(FREE)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  forms         FormData[]
  documents     Document[]
  aiQueryLogs   AiQueryLog[]
}

// NextAuth.js specific models
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

model Authenticator {
  credentialID         String  @unique // Corresponds to Authenticator.id in NextAuth.js
  userId               String
  providerAccountId    String // Not directly used by NextAuth TOTP but good for consistency
  credentialPublicKey  String
  counter              Int
  credentialDeviceType String
  credentialBackedUp   Boolean
  transports           String?
  user                 User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum PlanType {
  FREE
  BASIC
  PREMIUM
}

model FormData {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  formType  String   // e.g., "CUSTODY_AGREEMENT_V1"
  data      Json     // JSON object containing all collected form fields
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  generatedDocument Document? // Relation to the document generated from this form data
}

model Document {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  formDataId  String?  @unique // Optional: link to the FormData used to generate this
  formData    FormData? @relation(fields: [formDataId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  name        String   // User-friendly name or generated name for the document
  storagePath String   // Path to the file in Supabase Storage
  fileType    String   @default("application/pdf")
  size        Int?     // File size in bytes
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AiQueryLog {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  prompt    String   @db.Text
  response  String   @db.Text
  modelUsed String   // e.g., "gpt-4", "gpt-3.5-turbo"
  tokensUsed Int?    // Optional: to track token usage
  timestamp DateTime @default(now())
}
```

## 6. Authentication (`lib/auth.ts`)

-   **Provider**: NextAuth.js.
-   **Methods**: Email/Password (Credentials provider), Google (OAuth provider).
-   **Adapter**: PrismaAdapter for database session and user persistence.
-   **MFA**: TOTP (Time-based One-Time Password) using `speakeasy` for code generation/verification, integrated with NextAuth.js flow.
    -   Users can enroll a TOTP authenticator app.
    -   MFA check enforced during login for enrolled users.
    -   Authenticator details stored in the `Authenticator` model.
-   **Callbacks**: Customize `signIn`, `session`, and `jwt` callbacks to include user plan, MFA status, and other application-specific data in the session/JWT.

## 7. Payment Integration (`lib/stripe.ts`)

-   **Provider**: Stripe.
-   **Integration**: Stripe Checkout for new subscriptions and Stripe Customer Portal for managing existing subscriptions.
-   **SDK**: Official Stripe Node.js library.
-   **Plans**: 
    -   Free: Limited features.
    -   Basic: $25/month.
    -   Premium: $60/month.
    (Plan features and quotas to be defined and enforced in the application logic).
-   **Webhooks**: Endpoint (`/api/stripe/webhook`) to handle events from Stripe and update user subscription status in the database.

## 8. AI Integration (`lib/openai.ts`, `lib/prompts.ts`)

-   **Provider**: OpenAI API.
-   **Models**: GPT-4 (primary), GPT-3.5 Turbo (fallback or for less critical tasks to manage cost).
-   **SDK**: Official OpenAI Node.js library.
-   **`lib/openai.ts`**: Contains functions to initialize the OpenAI client and make API calls for chat completions.
-   **`lib/prompts.ts`**: Stores and manages prompt templates for various AI tasks (e.g., legal Q&A, document drafting from form data).
-   **PDF Generation**: The `pdf-lib` library will be used on the backend (`/api/ai/form-wizard`) to convert AI-generated text for forms into PDF documents.

## 9. File Storage (`lib/supabase.ts`)

-   **Provider**: Supabase Storage.
-   **Usage**: Store user-generated PDF documents.
-   **`lib/supabase.ts`**: Contains functions to initialize the Supabase client (if using the JS SDK for storage) or helper functions for direct REST API interaction with Supabase Storage.
-   **Operations**: Upload files, generate secure (time-limited) download URLs, delete files.
-   **Security**: Storage buckets will be configured with appropriate access policies (e.g., private by default, accessible via signed URLs or backend authorization).

## 10. Key Libraries & Tools

-   **Next.js**: React framework for frontend and backend.
-   **TypeScript**: Static typing for JavaScript.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **Shadcn UI**: Re-usable UI components built with Radix UI and Tailwind CSS.
-   **Prisma**: ORM for database access.
-   **NextAuth.js**: Authentication solution.
-   **Stripe SDK**: For payment processing.
-   **OpenAI SDK**: For AI features.
-   **`pdf-lib`**: For PDF generation.
-   **`speakeasy`**: For TOTP MFA implementation.
-   **Supabase Client/API**: For file storage.
-   **ESLint**: Code linting.
-   **Vitest**: (As per user request) for testing (or Jest if preferred).

## 11. Environment Variables (`.env.local`)

Critical configuration and secret keys will be managed via environment variables:

-   `DATABASE_URL`
-   `NEXTAUTH_URL`
-   `NEXTAUTH_SECRET`
-   `GOOGLE_CLIENT_ID`
-   `GOOGLE_CLIENT_SECRET`
-   `OPENAI_API_KEY`
-   `STRIPE_SECRET_KEY`
-   `STRIPE_PUBLISHABLE_KEY`
-   `STRIPE_WEBHOOK_SECRET`
-   `SUPABASE_URL` (if using Supabase client for storage)
-   `SUPABASE_ANON_KEY` (if using Supabase client for storage)
-   `SUPABASE_SERVICE_ROLE_KEY` (for backend storage operations)

This architecture provides a solid foundation for building the Family Guard application, focusing on scalability, security, and maintainability while leveraging modern development practices and tools.

