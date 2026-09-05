declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ADMIN_EMAIL: string;
    DATA_ENCRYPTION_KEY: string;
    FILES: R2Bucket;
  }
}
