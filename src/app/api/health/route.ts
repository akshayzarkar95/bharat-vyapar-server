const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  console.error("DATABASE_URL is missing");
} else {
  try {
    const parsed = new URL(rawUrl);

    console.log("DB connection config:", {
      hostname: parsed.hostname,
      port: parsed.port,
      database: parsed.pathname,
      sslmode: parsed.searchParams.get("sslmode"),
    });
  } catch {
    console.error("DATABASE_URL is invalid");
  }
}