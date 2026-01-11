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

    const newStore = data?.[0];
    
    // Initialize category preferences for the new store (all global categories with default sort)
    if (newStore?.id) {
      const { error: prefError } = await supabase.rpc("init_store_category_preferences", {
        p_store_id: newStore.id,
      });
      
      if (prefError) {
        console.error("Error initializing category preferences:", prefError);
        // Don't fail the store creation if preferences fail
      }
    }

    return NextResponse.json({
      success: true,
      store: newStore,
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
    const { storeId, name, password, logo_url, email } = body;

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

    if (email !== undefined) {
      updateData.email = email;
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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");

    if (!storeId) {
      return NextResponse.json(
        { message: "StoreID krävs" },
        { status: 400 }
      );
    }

    // Delete the store (cascade will delete categories, order_items due to FK constraints)
    const { error } = await supabase
      .from("stores")
      .delete()
      .eq("id", storeId);

    if (error) {
      console.error("Delete store error:", error);
      throw error;
    }

    return NextResponse.json({
      success: true,
    });
  } catch (err) {
    console.error("Delete store error:", err);
    return NextResponse.json(
      { message: "Kunde inte radera butik" },
      { status: 500 }
    );
  }
}
