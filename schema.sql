-- ESQUEMA COMPLETO VAPERIA (itopy.ai) --

-- 1. Profiles (Un perfil por operador o negocio)
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  phone_number text,
  suggestions_enabled boolean not null default true,
  teen_tone_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Customers (Cada contacto de WhatsApp)
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  wa_phone text not null,
  display_name text,
  last_seen_at timestamptz,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  unique(profile_id, wa_phone)
);

-- 3. Product Models (40K, 80K, etc.)
create table if not exists product_models (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  code text not null,         -- 40K / 80K
  name text not null,         -- King Pro / Quads
  cost_per_unit numeric(10,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(profile_id, code)
);

-- 4. Product Flavors (Sabores por modelo)
create table if not exists product_flavors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  model_id uuid not null references product_models(id) on delete cascade,
  flavor_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(profile_id, model_id, flavor_name)
);

-- 5. Inventory (Stock actual)
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  model_id uuid not null references product_models(id) on delete cascade,
  flavor_id uuid not null references product_flavors(id) on delete cascade,
  stock_units integer not null default 0,
  low_stock_threshold integer not null default 5,
  updated_at timestamptz not null default now(),
  unique(profile_id, model_id, flavor_id)
);

-- 6. Price Rules (Precios por tramo)
create table if not exists price_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  model_id uuid not null references product_models(id) on delete cascade,
  min_qty integer not null,
  max_qty integer,
  unit_price numeric(10,2) not null,
  created_at timestamptz not null default now()
);

-- 7. Orders (Pedidos en borrador o pendientes)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  customer_id uuid references customers(id),
  status text not null default 'draft', -- draft / pending / ready / completed / cancelled
  model_id uuid references product_models(id),
  flavor_id uuid references product_flavors(id),
  qty integer,
  estimated_price numeric(10,2),
  pickup_location text,
  pickup_time text,
  pickup_type text, -- in_person / delivery
  notes text,
  created_at timestamptz default now()
);

-- 8. Sales (Ventas cerradas)
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  customer_id uuid references customers(id),
  source text not null default 'whatsapp',
  status text not null default 'confirmed',
  total_amount numeric(10,2) not null default 0,
  total_cost numeric(10,2) not null default 0,
  total_margin numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- 9. Sale Items
create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  model_id uuid not null references product_models(id),
  flavor_id uuid not null references product_flavors(id),
  qty integer not null,
  unit_price numeric(10,2) not null,
  unit_cost numeric(10,2) not null,
  line_total numeric(10,2) generated always as (qty * unit_price) stored,
  line_margin numeric(10,2) generated always as (qty * (unit_price - unit_cost)) stored
);

-- 10. Función para obtener precio dinámico
create or replace function get_applicable_price(
  p_profile_id uuid,
  p_model_id uuid,
  p_qty integer
)
returns numeric as $$
declare
  v_price numeric;
begin
  select unit_price
  into v_price
  from price_rules
  where profile_id = p_profile_id
    and model_id = p_model_id
    and p_qty >= min_qty
    and (max_qty is null or p_qty <= max_qty)
  order by min_qty desc
  limit 1;

  return v_price;
end;
$$ language plpgsql;

-- RLS Básico (Aislamiento por profile_id)
alter table profiles enable row level security;
alter table customers enable row level security;
alter table product_models enable row level security;
alter table product_flavors enable row level security;
alter table inventory enable row level security;
alter table price_rules enable row level security;
alter table orders enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
