import { supabase } from "@/lib/supabase";
import type { Category, OrderRow } from "@/lib/types";

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_index", { ascending: true });

  if (error) throw error;
  return data as Category[];
}

export async function getOrderRows(): Promise<OrderRow[]> {
  try {
    // Try with explicit column selection first (includes brand and weight)
    const { data, error } = await supabase
      .from("order_items")
      .select("*, product:products(ean,name,brand,image_url,default_category_id,weight), category:categories(*)")
      .order("is_picked", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return data as OrderRow[];
  } catch (err: any) {
    // Fallback: try with wildcard
    const msg = err?.message || String(err);
    if (msg.includes("weight") || msg.includes("brand") || msg.includes("Could not find")) {
      const { data, error } = await supabase
        .from("order_items")
        .select("*, product:products(ean,name,brand,image_url,default_category_id,weight), category:categories(*)")
        .order("is_picked", { ascending: true })
        .order("updated_at", { ascending: false });
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

export async function rpcIncrement(ean: string, categoryId: string, delta: number) {
  const { data, error } = await supabase.rpc("increment_order_item", { p_ean: ean, p_category_id: categoryId, p_delta: delta });
  if (error) throw error;
  return data;
}

export async function rpcSetQty(ean: string, categoryId: string, qty: number) {
  const { data, error } = await supabase.rpc("set_order_item_qty", { p_ean: ean, p_category_id: categoryId, p_qty: qty });
  if (error) throw error;
  return data;
}

export async function rpcPicked(ean: string, isPicked: boolean, pickedBy: string) {
  const { data, error } = await supabase.rpc("set_picked", { p_ean: ean, p_is_picked: isPicked, p_picked_by: pickedBy });
  if (error) throw error;
  return data;
}

export async function rpcClearPicked() {
  const { data, error } = await supabase.rpc("clear_picked");
  if (error) throw error;
  return data as number;
}

export async function createCategory(name: string): Promise<Category> {
  // Get the highest sort_index
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

export async function updateCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("categories").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}
