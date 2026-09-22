import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const validPlans = new Set(["free", "basic", "pro"]);

export function useSubscription(userId) {
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!userId || !supabase) {
      setPlan("free");
      setLoading(false);
      return undefined;
    }

    setPlan("free");
    setLoading(true);

    const fetchSubscription = async () => {
      try {
        const { data, error } = await supabase
          .from("subscriptions")
          .select("plan_type, status, expires_at")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) throw error;

        const isExpired = data?.expires_at && new Date(data.expires_at) < new Date();
        const nextPlan =
          data?.status === "active" && !isExpired && validPlans.has(data.plan_type)
            ? data.plan_type
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

  return { plan, loading };
}
