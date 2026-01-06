import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeName, password } = body;

    if (!storeName || !password) {
      return NextResponse.json(
        { message: "Butiknamn och lösenord krävs" },
        { status: 400 }
      );
    }

    // Verify password using the RPC function with store name (case-insensitive)
    const { data, error } = await supabase.rpc("verify_store_login", {
      p_store_name: storeName,
      p_password: password,
    });

    if (error) {
      console.error("Password verification error:", error);
      return NextResponse.json(
        { message: "Ogiltigt lösenord eller butik" },
        { status: 401 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { message: "Ogiltigt lösenord eller butik" },
        { status: 401 }
      );
    }

    // data is the storeId returned from the RPC function
    // Return success - client will store in localStorage
    return NextResponse.json({
      success: true,
      storeId: data,
      storeName: storeName,
    });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { message: "Inloggning misslyckades" },
      { status: 500 }
    );
  }
}
