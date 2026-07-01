import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

interface OrderItem {
  handle: string;
  title: string;
  image: string;
  selectedOptions: Record<string, string>;
  price: number;
  quantity: number;
}

interface CheckoutBody {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  items: OrderItem[];
}

function buildProviderPayload(body: CheckoutBody, orderId: string, total: number, checkoutId: string) {
  return {
    checkoutId,
    orderId,
    customer: {
      name: body.name,
      email: body.email,
      phone: body.phone,
    },
    shipping: {
      address: body.address,
      city: body.city,
      state: body.state,
      zipCode: body.zipCode,
    },
    items: body.items.map((item) => ({
      handle: item.handle,
      title: item.title,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: item.price * item.quantity,
    })),
    total,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: CheckoutBody = await request.json();

    const { name, email, phone, address, city, state: stateField, zipCode, items } = body;

    // Validate required fields
    if (!name || !email || !address || !items?.length) {
      return NextResponse.json(
        { error: "Campos obrigatórios faltando." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const checkoutId = process.env.CHECKOUT_API_ID || "8856b8ae-b866-4e31-8f8b-61283ccb1aba";
    const checkoutApiUrl = process.env.CHECKOUT_API_URL;
    const checkoutRedirectUrl = process.env.CHECKOUT_REDIRECT_URL;

    // 1. Upsert user by email
    const { data: user, error: userError } = await supabase
      .from("users")
      .upsert({ email, name, phone }, { onConflict: "email" })
      .select("id")
      .single();

    if (userError) {
      console.error("User upsert error:", userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    // 2. Calculate total
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // 3. Insert order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        total,
        status: "pending",
        shipping_address: address,
        shipping_city: city,
        shipping_state: stateField,
        shipping_zip: zipCode,
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("Order insert error:", orderError);
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    // 4. Insert order items
    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_handle: item.handle,
      title: item.title,
      image: item.image,
      selected_options: item.selectedOptions,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Order items insert error:", itemsError);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    let checkoutUrl: string | undefined;

    if (checkoutApiUrl) {
      try {
        const providerRes = await fetch(checkoutApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.CHECKOUT_API_TOKEN
              ? { Authorization: `Bearer ${process.env.CHECKOUT_API_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(buildProviderPayload(body, order.id, total, checkoutId)),
        });

        if (providerRes.ok) {
          const providerData = await providerRes.json().catch(() => null);
          checkoutUrl = providerData?.checkoutUrl || providerData?.url || providerData?.paymentUrl;
        } else {
          const providerData = await providerRes.json().catch(() => null);
          console.error("Checkout provider error:", providerData || providerRes.statusText);
        }
      } catch (providerError) {
        console.error("Checkout provider request failed:", providerError);
      }
    }

    if (!checkoutUrl && checkoutRedirectUrl) {
      const separator = checkoutRedirectUrl.includes("?") ? "&" : "?";
      checkoutUrl = `${checkoutRedirectUrl}${separator}checkoutId=${encodeURIComponent(checkoutId)}&orderId=${order.id}`;
    }

    return NextResponse.json({
      orderId: order.id,
      success: true,
      checkoutId,
      ...(checkoutUrl ? { checkoutUrl } : {}),
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
