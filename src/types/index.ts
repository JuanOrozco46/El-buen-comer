export enum OrderStatus {
  PENDING = 'PENDING',
  PREPARING = 'PREPARING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DELIVERED = 'DELIVERED',
  PAID = 'PAID'
}

export enum OrderSource {
  POS = 'POS',
  WHATSAPP = 'WHATSAPP',
  DELIVERY = 'DELIVERY'
}

export interface ProductSize {
  id: number;
  name: string;
  price: number;
}

export interface Product {
  id: number;
  name: string;
  description?: string | null;
  category: string;
  isActive: boolean;
  isSoldOut: boolean;
  sizes: ProductSize[];
}

export interface CartItem {
  product: Product;
  size: ProductSize;
  quantity: number;
}

export interface OrderItem {
  id: number;
  productId: number;
  product: Product;
  sizeName: string;
  quantity: number;
  price: number;
}

export interface Payment {
  id: number;
  amount: number;
  method: string;
  createdAt: string | Date;
}

export interface FullOrder {
  id: number;
  customerName?: string | null;
  tableId?: number | null;
  table?: { number: string } | null;
  source: OrderSource;
  status: OrderStatus;
  total: number;
  createdAt: Date | string;
  items: OrderItem[];
  payments?: Payment[];
}
