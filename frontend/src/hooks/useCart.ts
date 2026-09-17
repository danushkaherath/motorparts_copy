import { useState, useMemo } from 'react';
import type { Product, ProductBatch, CartItem } from '../types';

export interface HeldCart {
  id: string;
  time: string;
  items: CartItem[];
}

export interface AddToCartResult {
  success: boolean;
  reason?: 'OUT_OF_STOCK' | 'MAX_STOCK_REACHED';
  maxStock?: number;
}

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);

  // Add product to active cart with optional specific batch
  const addToCart = (product: Product, selectedBatch?: ProductBatch): AddToCartResult => {
    const stockQty = selectedBatch ? selectedBatch.stock_quantity : product.stock_quantity;

    // Reject immediately if stock is 0 or negative
    if (typeof stockQty === 'number' && stockQty <= 0) {
      return { success: false, reason: 'OUT_OF_STOCK', maxStock: 0 };
    }

    const unitPrice = selectedBatch ? Number(selectedBatch.selling_price) : Number(product.selling_price);
    const mrpPrice = selectedBatch ? Number(selectedBatch.mrp || selectedBatch.selling_price) : Number(product.mrp || product.selling_price);
    const batchNum = selectedBatch?.batch_number || product.batch_number || '';
    const batchId = selectedBatch?.id;
    const expiry = selectedBatch?.expiry_date || product.expiry_date || '';

    // Check if product or batch is already in active cart
    const existingItem = cart.find((item) => {
      if (item.product_id !== product.id) return false;
      if (selectedBatch) {
        return item.batch_id === selectedBatch.id || (item.batch_number === selectedBatch.batch_number && item.unit_price === unitPrice);
      }
      return !item.batch_id && item.unit_price === unitPrice;
    });

    if (existingItem) {
      const currentQty = typeof existingItem.quantity === 'number' ? existingItem.quantity : parseFloat(String(existingItem.quantity)) || 0;
      const maxStock = typeof existingItem.stock_quantity === 'number' ? existingItem.stock_quantity : stockQty;
      if (typeof maxStock === 'number') {
        if (maxStock <= 0) {
          return { success: false, reason: 'OUT_OF_STOCK', maxStock: 0 };
        }
        if (currentQty >= maxStock) {
          return { success: false, reason: 'MAX_STOCK_REACHED', maxStock };
        }
      }
    }

    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => {
        if (item.product_id !== product.id) return false;
        if (selectedBatch) {
          return item.batch_id === selectedBatch.id || (item.batch_number === selectedBatch.batch_number && item.unit_price === unitPrice);
        }
        return !item.batch_id && item.unit_price === unitPrice;
      });

      if (existingIdx >= 0) {
        const updated = [...prev];
        const item = updated[existingIdx];
        const currentQty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity)) || 0;
        const maxStock = typeof item.stock_quantity === 'number' ? item.stock_quantity : stockQty;

        if (typeof maxStock === 'number' && (maxStock <= 0 || currentQty >= maxStock)) {
          return prev;
        }

        let newQty = currentQty + 1;
        if (typeof maxStock === 'number') {
          newQty = Math.min(newQty, maxStock);
        }
        updated[existingIdx] = {
          ...item,
          quantity: newQty,
          subtotal: Math.round(newQty * item.unit_price * 100) / 100,
        };
        return updated;
      } else {
        if (typeof stockQty === 'number' && stockQty <= 0) {
          return prev;
        }
        return [
          ...prev,
          {
            product_id: product.id,
            product_name: product.name,
            barcode: product.barcode,
            unit_price: unitPrice,
            quantity: 1,
            subtotal: unitPrice,
            unit: product.unit || 'pcs',
            category_name: product.category_name || 'General',
            brand: product.brand || '',
            mrp: mrpPrice,
            batch_number: batchNum,
            batch_id: batchId,
            expiry_date: expiry,
            stock_quantity: stockQty,
          },
        ];
      }
    });

    return { success: true };
  };

  // Adjust cart item quantity via buttons (+ / -)
  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      const current = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity)) || 0;
      let newQty = Math.round((current + delta) * 1000) / 1000;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      if (delta > 0 && typeof item.stock_quantity === 'number') {
        if (item.stock_quantity <= 0 || current >= item.stock_quantity) {
          return prev;
        }
        newQty = Math.min(newQty, item.stock_quantity);
      }
      updated[index] = {
        ...item,
        quantity: newQty,
        subtotal: Math.round(newQty * item.unit_price * 100) / 100,
      };
      return updated;
    });
  };

  // Direct edit of cart item quantity (supports decimals e.g. 1.25, 0.5, 2.750)
  const handleQuantityChange = (index: number, valStr: string) => {
    // Allow digits and at most one decimal point
    if (!/^\d*\.?\d*$/.test(valStr)) return;

    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      if (valStr === '' || valStr === '.') {
        updated[index] = {
          ...item,
          quantity: valStr,
          subtotal: 0,
        };
        return updated;
      }
      const val = parseFloat(valStr);
      if (isNaN(val)) return prev;
      updated[index] = {
        ...item,
        quantity: valStr,
        subtotal: Math.round(val * item.unit_price * 100) / 100,
      };
      return updated;
    });
  };

  // Clean up and format quantity on blur
  const handleQuantityBlur = (index: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      const val = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity));
      if (isNaN(val) || val <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      let cleanQty = Math.round(val * 1000) / 1000;
      if (typeof item.stock_quantity === 'number') {
        if (item.stock_quantity <= 0) {
          return updated.filter((_, i) => i !== index);
        }
        cleanQty = Math.min(cleanQty, item.stock_quantity);
      }
      updated[index] = {
        ...item,
        quantity: cleanQty,
        subtotal: Math.round(cleanQty * item.unit_price * 100) / 100,
      };
      return updated;
    });
  };

  // Remove single line item
  const removeLineItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
  };

  // Hold current cart
  const holdCart = (): boolean => {
    if (cart.length === 0) return false;
    const holdItem: HeldCart = {
      id: 'HOLD-' + Math.floor(100 + Math.random() * 900),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      items: cart,
    };
    setHeldCarts((prev) => [holdItem, ...prev]);
    setCart([]);
    return true;
  };

  // Recall held cart
  const recallCart = (index: number = 0): boolean => {
    if (heldCarts.length === 0) return false;
    const target = heldCarts[index];
    if (!target) return false;
    setCart(target.items);
    setHeldCarts((prev) => prev.filter((_, i) => i !== index));
    return true;
  };

  // Subtotal calculation
  const subtotal = useMemo(() => {
    return Math.round(
      cart.reduce((sum, item) => {
        const itemQty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity)) || 0;
        return sum + itemQty * item.unit_price;
      }, 0) * 100
    ) / 100;
  }, [cart]);

  // Total items count
  const itemCount = useMemo(() => {
    return cart.reduce((count, item) => {
      const itemQty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity)) || 0;
      return count + itemQty;
    }, 0);
  }, [cart]);

  return {
    cart,
    setCart,
    heldCarts,
    setHeldCarts,
    addToCart,
    updateQuantity,
    handleQuantityChange,
    handleQuantityBlur,
    removeLineItem,
    clearCart,
    holdCart,
    recallCart,
    subtotal,
    itemCount,
  };
}
