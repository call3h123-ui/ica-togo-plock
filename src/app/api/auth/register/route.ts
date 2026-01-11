import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CATEGORIES = [
  { name: "Kolonial", sort_index: 1 },
  { name: "Kött/Chark", sort_index: 2 },
  { name: "Frukt & Grönt", sort_index: 3 },
];

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

    // Create default categories for the new store
    if (data?.id) {
      const categoriesWithStoreId = DEFAULT_CATEGORIES.map((cat) => ({
        ...cat,
        store_id: data.id,
      }));

      const { error: catError } = await supabase
        .from("categories")
        .insert(categoriesWithStoreId);

      if (catError) {
        console.error("Register store: error creating default categories:", catError);
        // Do not fail registration if categories fail
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
