"use client";

import { Spinner } from "@/components/ui/spinner";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

export default function AppLoading() {
  const show = useDelayedLoading(true, 200);
  if (!show) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 animate-fade-in">
      <Spinner />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}
