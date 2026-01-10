import { NextResponse } from "next/server";

export async function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev";

  return new NextResponse(JSON.stringify({ version }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
