/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    NEXT_PUBLIC_LEARNWORLDS_SCHOOL_URL?: string;
    NEXT_PUBLIC_PRESEEN_PDF_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
  }
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_SUPABASE_URL: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
      NEXT_PUBLIC_LEARNWORLDS_SCHOOL_URL?: string;
      NEXT_PUBLIC_PRESEEN_PDF_URL?: string;
      SUPABASE_SERVICE_ROLE_KEY?: string;
    }
  }
}

export {};
