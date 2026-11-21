export async function notifyPriceDrop(db, { materialId, oldPrice, newPrice, now = new Date() }) {
  const previous = Number(oldPrice);
  const current = Number(newPrice);
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0 || current >= previous || (previous - current) / previous < 0.1) return 0;

  const saved = await db.collection("saved_materials").find({ materialId: String(materialId) }).toArray();
  let created = 0;
  for (const item of saved) {
    const wallet = String(item.walletAddress || "").toLowerCase();
    if (!wallet) continue;
    const user = await db.collection("users").findOne({ $or: [{ walletAddressLower: wallet }, { walletAddress: wallet }] });
    if (user?.notificationPreferences?.productUpdates === false) continue;
    const owned = await db.collection("purchases").findOne({ materialId: String(materialId), buyerAddress: wallet, status: { $ne: "refunded" } });
    if (owned) continue;
    const recent = await db.collection("notifications").findOne({ userId: wallet, type: "price_drop", "metadata.materialId": String(materialId), createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } });
    if (recent) continue;
    await db.collection("notifications").insertOne({ userId: wallet, recipient: wallet, type: "price_drop", title: "A saved material dropped in price", message: `The price dropped from ${previous} to ${current}.`, metadata: { materialId: String(materialId), oldPrice: previous, newPrice: current }, read: false, createdAt: now });
    created += 1;
  }
  return created;
}
