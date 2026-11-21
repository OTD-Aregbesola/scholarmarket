"use client";

import { useState } from "react";
import { FaShareAlt, FaCheck } from "react-icons/fa";
import { useToast } from "@/hooks/useToast";

function getCanonicalUrl(material) {
  if (material?.canonicalUrl) {
    return material.canonicalUrl;
  }
  if (material?.url) {
    return material.url;
  }
  const id = material?._id || material?.id;
  if (id) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}/marketplace/${id}`;
    }
    return `/marketplace/${id}`;
  }
  if (typeof window !== "undefined" && window.location?.href) {
    return window.location.href;
  }
  return "";
}

function getShareUrl(material) {
  const canonical = getCanonicalUrl(material);
  if (!canonical) return "";

  try {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost:3000";
    const urlObj = new URL(canonical, origin);
    urlObj.searchParams.set("utm_source", "share");
    return urlObj.toString();
  } catch {
    const sep = canonical.includes("?") ? "&" : "?";
    return `${canonical}${sep}utm_source=share`;
  }
}

export default function ShareMaterialButton({ material = {}, className = "" }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleShare = async () => {
    const title = material?.title || "ScholarMarket Material";
    const shareUrl = getShareUrl(material);
    const shortDescription =
      material?.shortDescription ||
      material?.shortSummary ||
      material?.description;
    const shareText =
      shortDescription || `Check out "${title}" on ScholarMarket!`;
    const clipboardMessage = `Check out "${title}" on ScholarMarket!\n${shareUrl}`;

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        });
      } else {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(clipboardMessage);
        }
        setCopied(true);
        if (toast?.show) {
          toast.show({
            title: "Link copied",
            message: "Link copied to clipboard",
            type: "success",
          });
        }
        setTimeout(() => setCopied(false), 2000);
      }

      console.log(
        "[Analytics] Tracked Share Interaction for material:",
        material?._id || material?.id
      );
      try {
        await fetch("/api/analytics/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "share_material",
            materialId: material?._id || material?.id,
          }),
        });
      } catch (e) {
        // silently ignore tracking errors
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }
      console.error("Failed to share", err);
      if (toast?.show) {
        toast.show({
          title: "Share failed",
          message: "Unable to share material",
          type: "error",
        });
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`flex items-center justify-center gap-2 border border-gray-300 text-gray-700 font-semibold rounded-md hover:bg-gray-100 transition focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      title="Share this material"
    >
      {copied ? <FaCheck className="text-green-600" /> : <FaShareAlt />}
      {copied ? "Shared!" : "Share"}
    </button>
  );
}
