-- Parada de Ouro - Supabase Schema Migration
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/dmfpsqcohwxegstlyfxe/sql

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table (guest checkout by email)
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  name text,
  phone text,
  created_at timestamptz default now()
);

-- Orders table
create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete set null,
  total numeric(10,2) not null,
  status text not null default 'pending', -- pending | confirmed | shipped | delivered | cancelled
  shipping_address text,
  shipping_city text,
  shipping_state text,
  shipping_zip text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Order items table
create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  product_handle text not null,
  title text,
  image text,
  selected_options jsonb default '{}',  -- e.g. {"Cor": "Marrom", "Tamanho": "M"}
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null,
  created_at timestamptz default now()
);

-- Indexes for common queries
create index if not exists orders_user_id_idx on orders(user_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists order_items_order_id_idx on order_items(order_id);

-- Row Level Security (optional: enable for production)
-- alter table users enable row level security;
-- alter table orders enable row level security;
-- alter table order_items enable row level security;
