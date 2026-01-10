import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, password, logo_url } = body;

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
        logo_url: logo_url || null,
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

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, name, password, logo_url } = body;

    if (!storeId || !name) {
      return NextResponse.json(
        { message: "StoreID och namn krävs" },
        { status: 400 }
      );
    }

    const updateData: any = { name: name.trim() };

    if (password && password.trim()) {
      updateData.password_hash = password;
    }

    if (logo_url !== undefined) {
      updateData.logo_url = logo_url;
    }

    const { data, error } = await supabase
      .from("stores")
      .update(updateData)
      .eq("id", storeId)
      .select();

    if (error) {
      console.error("Update store error:", error, updateData);
      throw error;
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { message: "Butik inte hittad" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      store: data[0],
    });
  } catch (err) {
    console.error("Update store error:", err);
    return NextResponse.json(
      { message: "Kunde inte uppdatera butik" },
      { status: 500 }
    );
  }
}
