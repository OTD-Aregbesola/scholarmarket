"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/apiClient";

export function useFeatureFlag(key, walletAddress) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    apiClient(`/api/flags?key=${encodeURIComponent(key)}&walletAddress=${encodeURIComponent(walletAddress || "")}`)
      .then(({ flags }) => {
        const flag = flags?.find((item) => item.key === key);
        if (active) setEnabled(Boolean(flag?.enabled));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [key, walletAddress]);
  return enabled;
}
