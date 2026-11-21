import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(_request, { params }) {
  const id = (await params).id;
  const db = await getDb();
  const bundle = await db.collection("bundles").findOne({ _id: ObjectId.isValid(id) ? new ObjectId(id) : id });
  if (!bundle) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  const materials = await db.collection("materials").find({ _id: { $in: (bundle.materialIds || []).filter(ObjectId.isValid).map((value) => new ObjectId(value)) } }).toArray();
  const total = materials.reduce((sum, material) => sum + Number(material.price || 0), 0);
  return NextResponse.json({ ...bundle, id: String(bundle._id), materials, total, savings: Math.max(0, total - Number(bundle.price || total)) });
}
