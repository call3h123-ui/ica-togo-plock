import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, password } = body;

    if (!storeId || !password) {
      return NextResponse.json(
        { message: "Butik och lösenord krävs" },
        { status: 400 }
      );
    }

    // First, get the store name from the storeId
    const { data: storeData, error: storeError } = await supabase
      .from("stores")
      .select("name")
      .eq("id", storeId)
      .maybeSingle();

    if (storeError || !storeData) {
      return NextResponse.json(
        { message: "Butiken hittades inte" },
        { status: 401 }
      );
    }

    // Verify password using the RPC function with store name
    const { data, error } = await supabase.rpc("verify_store_login", {
      p_store_name: storeData.name,
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

    // Return success - client will store in localStorage
    return NextResponse.json({
      success: true,
      storeId: storeId,
    });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { message: "Inloggning misslyckades" },
      { status: 500 }
    );
  }
}
