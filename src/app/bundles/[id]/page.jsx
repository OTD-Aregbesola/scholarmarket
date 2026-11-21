import BundlePageClient from "./BundlePageClient";

export async function generateMetadata({ params }) {
  return { title: `Bundle ${ (await params).id } | ScholarMarket` };
}

export default async function BundlePage({ params }) {
  return <BundlePageClient id={(await params).id} />;
}
