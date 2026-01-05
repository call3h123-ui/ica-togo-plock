import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { message: "Lösenord krävs" },
        { status: 400 }
      );
    }

    // Verify admin password using the RPC function
    const { data, error } = await supabase.rpc("verify_admin_login", {
      p_password: password,
    });

    if (error) {
      console.error("Admin login error:", error);
      return NextResponse.json(
        { message: "Ogiltigt admin-lösenord" },
        { status: 401 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { message: "Ogiltigt admin-lösenord" },
        { status: 401 }
      );
    }

    // Return success - client will store token in localStorage
    return NextResponse.json({
      success: true,
      token: "admin_authenticated",
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return NextResponse.json(
      { message: "Admin-inloggning misslyckades" },
      { status: 500 }
    );
  }
}
