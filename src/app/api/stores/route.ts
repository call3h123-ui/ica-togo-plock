import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("stores")
      .select("id, name")
      .order("name");

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to fetch stores:", err);
    return NextResponse.json(
      { message: "Failed to fetch stores" },
      { status: 500 }
    );
  }
}
