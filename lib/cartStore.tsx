"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CartItem {
  id: string;               // unique: handle + JSON.stringify(options)
  handle: string;
  title: string;
  image: string;
  selectedOptions: Record<string, string>;
  price: number;            // unit price in BRL cents for precision
  quantity: number;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

type CartAction =
  | { type: "ADD_ITEM"; item: CartItem }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "UPDATE_QTY"; id: string; quantity: number }
  | { type: "CLEAR_CART" }
  | { type: "OPEN_CART" }
  | { type: "CLOSE_CART" }
  | { type: "LOAD"; items: CartItem[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = "pdo_cart";

function makeId(handle: string, options: Record<string, string>): string {
  return `${handle}::${JSON.stringify(options)}`;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "LOAD":
      return { ...state, items: action.items };

    case "ADD_ITEM": {
      const existing = state.items.find((i) => i.id === action.item.id);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.id === action.item.id
              ? { ...i, quantity: i.quantity + action.item.quantity }
              : i
          ),
        };
      }
      return { ...state, items: [...state.items, action.item] };
    }

    case "REMOVE_ITEM":
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };

    case "UPDATE_QTY":
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, quantity: Math.max(1, action.quantity) } : i
        ),
      };

    case "CLEAR_CART":
      return { ...state, items: [] };

    case "OPEN_CART":
      return { ...state, isOpen: true };

    case "CLOSE_CART":
      return { ...state, isOpen: false };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface CartContextValue {
  state: CartState;
  addItem: (
    product: Omit<CartItem, "id" | "quantity">,
    quantity?: number
  ) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  total: number;   // in BRL as float
  count: number;
}

const CartContext = createContext<CartContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [], isOpen: false });

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "LOAD", items: JSON.parse(raw) });
    } catch {
      // ignore
    }
  }, []);

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // ignore
    }
  }, [state.items]);

  const addItem = (
    product: Omit<CartItem, "id" | "quantity">,
    quantity = 1
  ) => {
    const id = makeId(product.handle, product.selectedOptions);
    dispatch({ type: "ADD_ITEM", item: { ...product, id, quantity } });
    dispatch({ type: "OPEN_CART" });
  };

  const removeItem = (id: string) => dispatch({ type: "REMOVE_ITEM", id });
  const updateQuantity = (id: string, quantity: number) =>
    dispatch({ type: "UPDATE_QTY", id, quantity });
  const clearCart = () => dispatch({ type: "CLEAR_CART" });
  const openCart = () => dispatch({ type: "OPEN_CART" });
  const closeCart = () => dispatch({ type: "CLOSE_CART" });

  const total = state.items.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );
  const count = state.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ state, addItem, removeItem, updateQuantity, clearCart, openCart, closeCart, total, count }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

export { makeId };
