"use client";

/**
 * Interactive API documentation page.
 *
 * Renders the OpenAPI 3.1 spec at /openapi.yaml using swagger-ui-react.
 * Route: /api-docs
 */

import { useEffect } from "react";
import dynamic from "next/dynamic";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDocsPage() {
  useEffect(() => {
    // Lazy-load swagger-ui CSS only on this page
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css';
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div style={{ padding: "1rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.35rem" }}>ScholarMarket API Documentation</h1>
        <p style={{ color: "#475569", marginBottom: "0.5rem" }}>
          Interactive reference for Materials, Purchases, Creators, Marketplace, and Checkout endpoints.
          All authenticated endpoints require a valid JWT session cookie.
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <code style={{ padding: "0.25rem 0.5rem", background: "#f1f5f9", borderRadius: "4px", fontSize: "0.85rem" }}>
            GET /api/materials — List your materials
          </code>
          <code style={{ padding: "0.25rem 0.5rem", background: "#f1f5f9", borderRadius: "4px", fontSize: "0.85rem" }}>
            POST /api/purchase — Buy a material
          </code>
          <code style={{ padding: "0.25rem 0.5rem", background: "#f1f5f9", borderRadius: "4px", fontSize: "0.85rem" }}>
            GET /api/market-materials — Browse marketplace
          </code>
        </div>
      </div>
      <SwaggerUI
        url="/openapi.yaml"
        docExpansion="list"
        defaultModelsExpandDepth={1}
        defaultModelExpandDepth={1}
        tryItOutEnabled={true}
        requestSnippetsEnabled={true}
      />
    </div>
  );
}
