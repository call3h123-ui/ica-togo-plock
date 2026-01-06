-- Make store name login case-insensitive
create or replace function public.verify_store_login(p_store_name text, p_password text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_store_id uuid;
begin
  select id into v_store_id
  from public.stores
  where lower(name) = lower(p_store_name)
  and password_hash = crypt(p_password, password_hash);
  
  return v_store_id;
end;
$$;

grant execute on function public.verify_store_login(text, text) to anon, authenticated;
