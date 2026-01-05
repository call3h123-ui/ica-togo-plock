import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, password } = body;

    if (!name || !password) {
      return NextResponse.json(
        { message: "Namn och lösenord krävs" },
        { status: 400 }
      );
    }

    // Insert new store with hashed password
    const { data, error } = await supabase
      .from("stores")
      .insert({
        name: name.trim(),
        password_hash: password, // Will be hashed by the database trigger
      })
      .select();

    if (error) {
      console.error("Insert store error:", error);
      if (error.message.includes("duplicate")) {
        return NextResponse.json(
          { message: "Butiken finns redan" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      store: data?.[0],
    });
  } catch (err) {
    console.error("Add store error:", err);
    return NextResponse.json(
      { message: "Kunde inte lägga till butik" },
      { status: 500 }
    );
  }
}
