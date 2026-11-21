"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/providers/CartProvider";

export default function BundlePageClient({ id }) {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState("");
  const { addToCart } = useCart();

  useEffect(() => {
    fetch(`/api/bundles/${encodeURIComponent(id)}`).then(async (response) => {
      if (!response.ok) throw new Error("Bundle not found");
      setBundle(await response.json());
    }).catch((reason) => setError(reason.message));
  }, [id]);

  if (error) return <p className="p-8 text-rose-600">{error}</p>;
  if (!bundle) return <p className="p-8">Loading bundle…</p>;

  const bundleItem = { ...bundle, _id: `bundle:${bundle.id}`, title: bundle.name || bundle.title, price: bundle.price, isBundle: true };
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <p className="text-sm text-slate-500">Bundle</p>
        <h1 className="text-3xl font-bold">{bundle.name || bundle.title}</h1>
        <p className="mt-2 text-slate-600">Save {Number(bundle.savings || 0).toFixed(2)} XLM compared with buying separately.</p>
      </div>
      <ul className="space-y-3">
        {bundle.materials.map((material) => (
          <li key={material._id} className="rounded-xl border p-4"><Link className="font-medium text-blue-700" href={`/marketplace/${material._id}`}>{material.title}</Link><span className="float-right">{material.price} XLM</span></li>
        ))}
      </ul>
      <button type="button" onClick={() => addToCart(bundleItem)} className="rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white">Add bundle to cart · {bundle.price} XLM</button>
    </main>
  );
}
