import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeName, password, email } = body;

    if (!storeName || !password || !email) {
      return NextResponse.json(
        { message: "Butiknamn, lösenord och mail krävs" },
        { status: 400 }
      );
    }

    const name = String(storeName).trim();
    const pwd = String(password).trim();
    const mail = String(email).trim().toLowerCase();

    if (!name || !pwd || !mail) {
      return NextResponse.json(
        { message: "Butiknamn, lösenord och mail krävs" },
        { status: 400 }
      );
    }

    // Create store (password will be hashed by DB trigger)
    const { data, error } = await supabase
      .from("stores")
      .insert({
        name,
        password_hash: pwd,
        email: mail,
        logo_url: null,
      })
      .select("id, name, logo_url")
      .single();

    if (error) {
      console.error("Register store error:", error);
      // Postgrest usually returns 409 on unique violations
      if (String(error.message || "").toLowerCase().includes("duplicate") || error.code === "23505") {
        return NextResponse.json(
          { message: "Butiknamn eller mail används redan" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { message: "Kunde inte skapa butik" },
        { status: 500 }
      );
    }

    // Initialize category preferences for the new store (all global categories with default sort)
    if (data?.id) {
      const { error: prefError } = await supabase.rpc("init_store_category_preferences", {
        p_store_id: data.id,
      });

      if (prefError) {
        console.error("Register store: error initializing category preferences:", prefError);
        // Do not fail registration if preferences fail
      }
    }

    // Return the same shape as login to allow auto-login
    return NextResponse.json({
      success: true,
      storeId: data.id,
      storeName: data.name,
      logoUrl: data.logo_url || null,
    });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json(
      { message: "Kunde inte skapa butik" },
      { status: 500 }
    );
  }
}
