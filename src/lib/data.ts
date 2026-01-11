import { supabase } from "@/lib/supabase";
import type { Category, OrderRow } from "@/lib/types";

export async function getCategories(storeId?: string): Promise<Category[]> {
  let query = supabase
    .from("categories")
    .select("*")
    .order("sort_index", { ascending: true });

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Category[];
}

export async function getOrderRows(storeId?: string): Promise<OrderRow[]> {
  try {
    let query = supabase
      .from("order_items")
      .select("*, product:products(ean,name,brand,image_url,default_category_id,weight), category:categories(*)")
      .order("is_picked", { ascending: true })
      .order("updated_at", { ascending: false });

    if (storeId) {
      query = query.eq("store_id", storeId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as OrderRow[];
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("weight") || msg.includes("brand") || msg.includes("Could not find")) {
      let query = supabase
        .from("order_items")
        .select("*, product:products(ean,name,brand,image_url,default_category_id,weight), category:categories(*)")
        .order("is_picked", { ascending: true })
        .order("updated_at", { ascending: false });

      if (storeId) {
        query = query.eq("store_id", storeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OrderRow[];
    }
    throw err;
  }
}

export async function ensureProduct(ean: string) {
  try {
    const { data, error } = await supabase.from("products").select("ean,name,brand,image_url,default_category_id,weight").eq("ean", ean).maybeSingle();
    if (error) throw error;
    return data;
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("weight") || msg.includes("brand") || msg.includes("Could not find")) {
      const { data, error } = await supabase.from("products").select("ean,name,brand,image_url,default_category_id,weight").eq("ean", ean).maybeSingle();
      if (error) throw error;
      return data;
    }
    throw err;
  }
}

export async function createProduct(payload: { ean: string; name: string; brand?: string | null; image_url?: string | null; default_category_id?: string | null; weight?: string | null }) {
  const insertObj: any = {
    ean: payload.ean,
    name: payload.name,
    image_url: payload.image_url ?? null,
    default_category_id: payload.default_category_id ?? null,
  };
  if (payload.brand != null) insertObj.brand = payload.brand;
  if (payload.weight != null) insertObj.weight = payload.weight;

  try {
    const { error } = await supabase.from("products").insert(insertObj);
    if (error) throw error;
  } catch (err: any) {
    const msg = err?.message || String(err);
    // If failure due to missing columns, retry without them
    if (msg.includes("brand") || msg.includes("weight") || msg.includes("Could not find")) {
      const safeInsert: any = { 
        ean: payload.ean,
        name: payload.name,
        image_url: payload.image_url ?? null,
        default_category_id: payload.default_category_id ?? null,
      };
      const { error } = await supabase.from("products").insert(safeInsert);
      if (error) throw error;
      return;
    }
    throw err;
  }
}

export async function updateProduct(ean: string, payload: { name?: string; brand?: string | null; image_url?: string | null; weight?: string | null; default_category_id?: string | null }) {
  const updateObj: any = {};
  if (payload.name != null) updateObj.name = payload.name;
  if (payload.brand != null) updateObj.brand = payload.brand;
  if (payload.image_url != null) updateObj.image_url = payload.image_url;
  if (payload.weight != null) updateObj.weight = payload.weight;
  if (payload.default_category_id != null) updateObj.default_category_id = payload.default_category_id;

  if (Object.keys(updateObj).length === 0) return; // Nothing to update

  try {
    const { error } = await supabase.from("products").update(updateObj).eq("ean", ean);
    if (error) throw error;
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("brand") || msg.includes("weight") || msg.includes("Could not find")) {
      // Retry without optional fields if schema error
      const safeUpdate: any = {};
      if (payload.name != null) safeUpdate.name = payload.name;
      if (payload.image_url != null) safeUpdate.image_url = payload.image_url;
      const { error } = await supabase.from("products").update(safeUpdate).eq("ean", ean);
      if (error) throw error;
      return;
    }
    throw err;
  }
}

export async function rpcIncrement(ean: string, categoryId: string, delta: number, storeId?: string) {
  const { data, error } = await supabase.rpc("increment_order_item", { 
    p_ean: ean, 
    p_category_id: categoryId, 
    p_delta: delta,
    p_store_id: storeId || null
  });
  if (error) throw error;
  return data;
}

export async function rpcSetQty(ean: string, categoryId: string, qty: number, storeId?: string) {
  const { data, error } = await supabase.rpc("set_order_item_qty", { 
    p_ean: ean, 
    p_category_id: categoryId, 
    p_qty: qty,
    p_store_id: storeId || null
  });
  if (error) throw error;
  return data;
}

export async function rpcPicked(ean: string, isPicked: boolean, pickedBy: string, storeId?: string) {
  const { data, error } = await supabase.rpc("set_picked", { 
    p_ean: ean, 
    p_is_picked: isPicked, 
    p_picked_by: pickedBy,
    p_store_id: storeId || null
  });
  if (error) throw error;
  return data;
}

export async function rpcClearPicked(storeId?: string) {
  const { data, error } = await supabase.rpc("clear_picked", { p_store_id: storeId || null });
  if (error) throw error;
  return data as number;
}

export async function createCategory(name: string, storeId?: string): Promise<Category> {
  // Get the highest sort_index for this store (if storeId provided)
  let query = supabase
    .from("categories")
    .select("sort_index")
    .order("sort_index", { ascending: false })
    .limit(1);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data: cats, error: getError } = await query;

  if (getError) throw getError;
  const maxIndex = cats && cats.length > 0 ? cats[0].sort_index : 0;

  const { data, error } = await supabase
    .from("categories")
    .insert({ name, sort_index: maxIndex + 1, store_id: storeId || null })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data as Category;
}

export async function updateCategory(id: string, name: string, storeId?: string, sortIndex?: number): Promise<void> {
  const updateObj: any = { name };
  if (sortIndex !== undefined) {
    updateObj.sort_index = sortIndex;
  }
  const { error } = await supabase
    .from("categories")
    .update(updateObj)
    .eq("id", id)
    .eq("store_id", storeId || null);
  if (error) throw error;
}

export async function moveCategoryUp(id: string, currentSortIndex: number, storeId?: string): Promise<void> {
  // Get the category with the next lower sort_index
  let query = supabase
    .from("categories")
    .select("id, sort_index")
    .lt("sort_index", currentSortIndex)
    .order("sort_index", { ascending: false })
    .limit(1);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data: cats, error: getError } = await query;
  if (getError) throw getError;
  
  if (!cats || cats.length === 0) return; // Already at top

  const swapCat = cats[0];
  
  // Swap sort_index values
  await supabase
    .from("categories")
    .update({ sort_index: swapCat.sort_index })
    .eq("id", id);
  
  await supabase
    .from("categories")
    .update({ sort_index: currentSortIndex })
    .eq("id", swapCat.id);
}

export async function moveCategoryDown(id: string, currentSortIndex: number, storeId?: string): Promise<void> {
  // Get the category with the next higher sort_index
  let query = supabase
    .from("categories")
    .select("id, sort_index")
    .gt("sort_index", currentSortIndex)
    .order("sort_index", { ascending: true })
    .limit(1);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data: cats, error: getError } = await query;
  if (getError) throw getError;
  
  if (!cats || cats.length === 0) return; // Already at bottom

  const swapCat = cats[0];
  
  // Swap sort_index values
  await supabase
    .from("categories")
    .update({ sort_index: swapCat.sort_index })
    .eq("id", id);
  
  await supabase
    .from("categories")
    .update({ sort_index: currentSortIndex })
    .eq("id", swapCat.id);
}

export async function deleteCategory(id: string, storeId?: string): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("store_id", storeId || null);
  if (error) throw error;
}

// ========== GLOBAL CATEGORIES (NEW) ==========

export async function getGlobalCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_index", { ascending: true });
  
  if (error) throw error;
  return data as Category[];
}

export async function createGlobalCategory(name: string): Promise<Category> {
  const { data: cats, error: getError } = await supabase
    .from("categories")
    .select("sort_index")
    .order("sort_index", { ascending: false })
    .limit(1);

  if (getError) throw getError;
  const maxIndex = cats && cats.length > 0 ? cats[0].sort_index : 0;

  const { data, error } = await supabase
    .from("categories")
    .insert({ name, sort_index: maxIndex + 1 })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data as Category;
}

export async function updateGlobalCategory(id: string, name: string, sortIndex?: number): Promise<void> {
  const updateObj: any = { name };
  if (sortIndex !== undefined) {
    updateObj.sort_index = sortIndex;
  }
  const { error } = await supabase
    .from("categories")
    .update(updateObj)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGlobalCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function moveGlobalCategoryUp(id: string, currentSortIndex: number): Promise<void> {
  const { data: cats, error: getError } = await supabase
    .from("categories")
    .select("id, sort_index")
    .lt("sort_index", currentSortIndex)
    .order("sort_index", { ascending: false })
    .limit(1);

  if (getError) throw getError;
  if (!cats || cats.length === 0) return;

  const swapCat = cats[0];
  await supabase.from("categories").update({ sort_index: swapCat.sort_index }).eq("id", id);
  await supabase.from("categories").update({ sort_index: currentSortIndex }).eq("id", swapCat.id);
}

export async function moveGlobalCategoryDown(id: string, currentSortIndex: number): Promise<void> {
  const { data: cats, error: getError } = await supabase
    .from("categories")
    .select("id, sort_index")
    .gt("sort_index", currentSortIndex)
    .order("sort_index", { ascending: true })
    .limit(1);

  if (getError) throw getError;
  if (!cats || cats.length === 0) return;

  const swapCat = cats[0];
  await supabase.from("categories").update({ sort_index: swapCat.sort_index }).eq("id", id);
  await supabase.from("categories").update({ sort_index: currentSortIndex }).eq("id", swapCat.id);
}

// ========== STORE CATEGORY PREFERENCES ==========

export async function getStoreCategoryPreferences(storeId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("store_category_preferences")
    .select("*")
    .eq("store_id", storeId)
    .order("sort_index", { ascending: true });
  
  if (error) throw error;
  return data || [];
}

export async function updateStoreCategoryPreference(storeId: string, categoryId: string, sortIndex: number): Promise<void> {
  const { error } = await supabase
    .from("store_category_preferences")
    .update({ sort_index: sortIndex })
    .eq("store_id", storeId)
    .eq("category_id", categoryId);
  
  if (error) throw error;
}

export async function moveStoreCategoryUp(storeId: string, categoryId: string, currentSortIndex: number): Promise<void> {
  const { data: prefs, error: getError } = await supabase
    .from("store_category_preferences")
    .select("id, category_id, sort_index")
    .eq("store_id", storeId)
    .lt("sort_index", currentSortIndex)
    .order("sort_index", { ascending: false })
    .limit(1);

  if (getError) throw getError;
  if (!prefs || prefs.length === 0) return;

  const swapPref = prefs[0];
  await supabase
    .from("store_category_preferences")
    .update({ sort_index: swapPref.sort_index })
    .eq("store_id", storeId)
    .eq("category_id", categoryId);
  
  await supabase
    .from("store_category_preferences")
    .update({ sort_index: currentSortIndex })
    .eq("store_id", storeId)
    .eq("category_id", swapPref.category_id);
}

export async function moveStoreCategoryDown(storeId: string, categoryId: string, currentSortIndex: number): Promise<void> {
  const { data: prefs, error: getError } = await supabase
    .from("store_category_preferences")
    .select("id, category_id, sort_index")
    .eq("store_id", storeId)
    .gt("sort_index", currentSortIndex)
    .order("sort_index", { ascending: true })
    .limit(1);

  if (getError) throw getError;
  if (!prefs || prefs.length === 0) return;

  const swapPref = prefs[0];
  await supabase
    .from("store_category_preferences")
    .update({ sort_index: swapPref.sort_index })
    .eq("store_id", storeId)
    .eq("category_id", categoryId);
  
  await supabase
    .from("store_category_preferences")
    .update({ sort_index: currentSortIndex })
    .eq("store_id", storeId)
    .eq("category_id", swapPref.category_id);
}
