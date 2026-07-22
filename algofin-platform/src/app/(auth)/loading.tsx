"use client";

import { Spinner } from "@/components/ui/spinner";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

export default function AuthLoading() {
  const show = useDelayedLoading(true, 200);
  if (!show) return null;

  return (
    <div className="flex items-center justify-center py-16 animate-fade-in">
      <Spinner />
    </div>
  );
}
