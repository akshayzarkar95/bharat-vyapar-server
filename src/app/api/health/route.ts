import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is missing");

    return Response.json(
      { ok: false, error: "DATABASE_URL missing" },
      { status: 500 }
    );
  }

  try {
    const parsed = new URL(databaseUrl);

    console.log("DB connection config:", {
      hostname: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname,
      sslmode: parsed.searchParams.get("sslmode"),
    });

    await db.execute(sql`SELECT 1`);

    return Response.json({
      ok: true,
      message: "Supabase database connected successfully",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    return Response.json(
      { ok: false, error: "Database connection failed" },
      { status: 500 }
    );
  }
}