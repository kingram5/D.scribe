import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/allowlist";

// Temporary debug endpoint — remove after verifying allowlist works
export async function GET() {
  const raw = process.env.ALLOWED_EMAILS ?? "(not set)";
  const testEmail = "sahandsadri@gmail.com";
  return NextResponse.json({
    envVarPresent: !!process.env.ALLOWED_EMAILS,
    envVarLength: raw.length,
    emailCount: raw === "(not set)" ? 0 : raw.split(",").filter(Boolean).length,
    testEmailAllowed: isAllowedEmail(testEmail),
    firstThreeChars: raw.slice(0, 3),
  });
}
