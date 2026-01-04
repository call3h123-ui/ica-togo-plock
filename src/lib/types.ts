export type Category = { id: string; name: string; sort_index: number };
export type Product = { ean: string; name: string; brand?: string | null; image_url: string | null; default_category_id: string | null; weight?: string | null };

export type OrderItem = {
  id: string;
  ean: string;
  qty: number;
  category_id: string;
  is_picked: boolean;
  picked_at: string | null;
  picked_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderRow = OrderItem & { product: Product | null; category: Category | null };
