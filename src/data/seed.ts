/**
 * Demo customers and orders. Each order was chosen to exercise one branch of
 * the return policy: inside the regret window, past the exchange window, a
 * durable product with a defect, an order still in transit, a perfume that
 * needs to be sealed.
 *
 * Dates are stored as "days ago" and resolved against the current date, so
 * the scenarios stay valid no matter when the demo runs.
 */
export interface SeedItem {
  sku: number;
  title: string;
  category: string;
  priceBRL: number;
  image: string;
}

export interface SeedOrder {
  id: string;
  customerId: string;
  status: "delivered" | "in_transit";
  placedDaysAgo: number;
  deliveredDaysAgo: number | null;
  expectedInDays: number | null;
  tracking: string | null;
  items: SeedItem[];
}

export interface SeedCustomer {
  id: string;
  name: string;
  email: string;
  city: string;
  scenario: string;
}

const img = (path: string) => `https://cdn.dummyjson.com/product-images/${path}/thumbnail.webp`;

export const customers: SeedCustomer[] = [
  { id: "ana", name: "Ana Souza", email: "ana@example.com", city: "Porto Alegre", scenario: "Tênis entregue há 3 dias e um vestido de 45 dias atrás" },
  { id: "bruno", name: "Bruno Lima", email: "bruno@example.com", city: "Curitiba", scenario: "Notebook com defeito e um pedido ainda em trânsito" },
  { id: "carla", name: "Carla Mendes", email: "carla@example.com", city: "Florianópolis", scenario: "Perfume entregue há 2 dias e óculos de sol" },
];

export const orders: SeedOrder[] = [
  {
    id: "1042", customerId: "ana", status: "delivered", placedDaysAgo: 8, deliveredDaysAgo: 3, expectedInDays: null, tracking: "BR1042PA",
    items: [{ sku: 90, title: "Puma Future Rider Trainers", category: "mens-shoes", priceBRL: 494.9, image: img("mens-shoes/puma-future-rider-trainers") }],
  },
  {
    id: "1031", customerId: "ana", status: "delivered", placedDaysAgo: 52, deliveredDaysAgo: 45, expectedInDays: null, tracking: "BR1031PA",
    items: [{ sku: 163, title: "Girl Summer Dress", category: "tops", priceBRL: 109.9, image: img("tops/girl-summer-dress") }],
  },
  {
    id: "1055", customerId: "bruno", status: "delivered", placedDaysAgo: 66, deliveredDaysAgo: 60, expectedInDays: null, tracking: "BR1055CT",
    items: [{ sku: 80, title: "Huawei Matebook X Pro", category: "laptops", priceBRL: 7699.9, image: img("laptops/huawei-matebook-x-pro") }],
  },
  {
    id: "1060", customerId: "bruno", status: "in_transit", placedDaysAgo: 4, deliveredDaysAgo: null, expectedInDays: 2, tracking: "BR1060CT",
    items: [{ sku: 100, title: "Apple Airpods", category: "mobile-accessories", priceBRL: 714.9, image: img("mobile-accessories/apple-airpods") }],
  },
  {
    id: "1071", customerId: "carla", status: "delivered", placedDaysAgo: 6, deliveredDaysAgo: 2, expectedInDays: null, tracking: "BR1071FL",
    items: [{ sku: 7, title: "Chanel Coco Noir Eau De", category: "fragrances", priceBRL: 714.9, image: img("fragrances/chanel-coco-noir-eau-de") }],
  },
  {
    id: "1068", customerId: "carla", status: "delivered", placedDaysAgo: 20, deliveredDaysAgo: 15, expectedInDays: null, tracking: "BR1068FL",
    items: [{ sku: 155, title: "Classic Sun Glasses", category: "sunglasses", priceBRL: 136.9, image: img("sunglasses/classic-sun-glasses") }],
  },
];
