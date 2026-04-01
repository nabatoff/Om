"use client";

import type { Tables } from "@/types/database";

type Supplier = Tables<"clients">;

type Props = {
  supplier: Supplier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSupplierUpdated?: (s: Supplier) => void;
};

export function SupplierCardDialog({
  supplier: _supplier,
  open: _open,
  onOpenChange: _onOpenChange,
  onSupplierUpdated: _onSupplierUpdated,
}: Props) {
  return null;
}
