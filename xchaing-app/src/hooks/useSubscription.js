import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useSubscription(userId) {
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchSubscription = async () => {
      if (!userId || !supabase) {
        if (!cancelled) {
          setPlan("free");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("subscriptions")
          .select("plan_type, status, expires_at")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) throw error;

        const normalizedPlan = String(data?.plan_type || "free").trim().toLowerCase();
        const isExpired = data?.expires_at && new Date(data.expires_at) < new Date();
        const nextPlan =
          data?.status?.toLowerCase() === "active" && !isExpired && normalizedPlan === "pro"
            ? "pro"
            : "free";

        if (!cancelled) setPlan(nextPlan);
      } catch (error) {
        console.error("Error fetching subscription:", error);
        if (!cancelled) setPlan("free");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSubscription();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshSubscription = async () => {
    if (!userId || !supabase) {
      setPlan("free");
      return "free";
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("plan_type, status, expires_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      const normalizedPlan = String(data?.plan_type || "free").trim().toLowerCase();
      const isExpired = data?.expires_at && new Date(data.expires_at) < new Date();
      const nextPlan =
        data?.status?.toLowerCase() === "active" && !isExpired && normalizedPlan === "pro"
          ? "pro"
          : "free";

      setPlan(nextPlan);
      return nextPlan;
    } catch (error) {
      console.error("Error refreshing subscription:", error);
      setPlan("free");
      return "free";
    } finally {
      setLoading(false);
    }
  };

  return { plan, loading, refreshSubscription };
}
