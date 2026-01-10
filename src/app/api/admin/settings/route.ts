import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET - fetch global settings
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("global_settings")
      .select("*")
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Error fetching global settings:", error);
      return NextResponse.json({ message: "Kunde inte hämta inställningar" }, { status: 500 });
    }

    return NextResponse.json(data || { login_logo_url: null });
  } catch (err) {
    console.error("Error in GET /api/admin/settings:", err);
    return NextResponse.json({ message: "Serverfel" }, { status: 500 });
  }
}

// PUT - update global settings
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { login_logo_url } = body;

    // Check if settings row exists
    const { data: existing } = await supabase
      .from("global_settings")
      .select("id")
      .single();

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from("global_settings")
        .update({ login_logo_url, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (error) {
        console.error("Error updating global settings:", error);
        return NextResponse.json({ message: "Kunde inte spara inställningar" }, { status: 500 });
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from("global_settings")
        .insert({ login_logo_url });

      if (error) {
        console.error("Error inserting global settings:", error);
        return NextResponse.json({ message: "Kunde inte spara inställningar" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error in PUT /api/admin/settings:", err);
    return NextResponse.json({ message: "Serverfel" }, { status: 500 });
  }
}
