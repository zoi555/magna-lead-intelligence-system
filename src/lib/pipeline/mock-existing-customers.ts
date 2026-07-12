// Mock existing-customer master — Phase 4 (PLACEHOLDER DATA, not real Magna data).
// Replaced by a real import later (see templates/existing-customers-import-template.csv).

import type { CustomerRecord } from "./customer-matching";

export const MOCK_CUSTOMERS: CustomerRecord[] = [
  { customer_code: "C-1001", customer_name: "Royal Nawaab", trading_name: "Royal Nawaab", postcode: "UB6 8DW", address: "Perivale", phone: "020 8998 3000", email: "", status: "active", last_order_date: "2026-07-01", route: "West A", sales_rep: "Raj K", notes: "Large banqueting" },
  { customer_code: "C-1002", customer_name: "New Flame BBQ", trading_name: "New Flame BBQ", postcode: "HA0 1LT", address: "Wembley", phone: "", email: "", status: "active", last_order_date: "2026-06-20", route: "North B", sales_rep: "Aisha M", notes: "" },
  { customer_code: "C-1003", customer_name: "Southall Sweet Centre", trading_name: "Southall Sweet Centre", postcode: "UB1 3EU", address: "Southall", phone: "", email: "", status: "active", last_order_date: "2026-05-30", route: "West A", sales_rep: "Jaspreet S", notes: "" },
  { customer_code: "C-1004", customer_name: "Punjab Karahi", trading_name: "Punjab Karahi", postcode: "UB1 1RD", address: "Southall", phone: "", email: "", status: "lapsed", last_order_date: "2025-02-11", route: "West A", sales_rep: "Jaspreet S", notes: "Lapsed — possible re-open" },
];
