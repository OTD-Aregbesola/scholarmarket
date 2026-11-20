"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { notFound, useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import BuyNowModal from "./modals/BuyNowModal";
import { useMaterialDetail, useMaterialHistory } from "@/hooks/api/useMaterials";
import { useEntitlement } from "@/hooks/api/useEntitlements";
import { QueryStateProvider } from "@/components/common/QueryStateProvider";
import Web3ErrorBoundary from "@/components/web3/Web3ErrorBoundary";
import { trackRecentlyViewed } from "@/hooks/useRecentlyViewed";
import RecommendedMaterials from "@/components/materials/RecommendedMaterials";
import { useWallet } from "@/hooks/useWallet";
import { NETWORK_PASSPHRASE } from "@/lib/config/chain";
import MaterialHero from "./components/MaterialHero";
import MaterialPreview from "./components/MaterialPreview";
import MaterialReviews from "./components/MaterialReviews";
import MaterialPurchasePanel, { ReportModal } from "./components/MaterialPurchasePanel";

export default function MaterialDetailsPage() {
	const params = useParams();
	const id = String(params.id);
	const [showBuyModal, setShowBuyModal] = useState(false);
	const [showReportModal, setShowReportModal] = useState(false);
	const [downloadError, setDownloadError] = useState(null);
	const [isDownloading, setIsDownloading] = useState(false);

	const materialQuery = useMaterialDetail(id);
	const historyQuery = useMaterialHistory(id);
	const entitlementQuery = useEntitlement(id);
	const { address, networkPassphrase } = useWallet();

	const history = historyQuery.data ?? [];
	const isNetworkMismatch = Boolean(
		address && networkPassphrase && networkPassphrase !== NETWORK_PASSPHRASE
	);

	const accessStatus = !address
		? "wallet_required"
		: entitlementQuery.data?.status || (entitlementQuery.isLoading ? "checking" : "not_purchased");
	const isOwned =
		accessStatus === "active" ||
		Boolean(address && (entitlementQuery.data?.owned || entitlementQuery.data?.hasAccess));

	const handleDownload = async () => {
		if (!address) {
			setShowBuyModal(true);
			return;
		}

		setIsDownloading(true);
		setDownloadError(null);

		try {
			const query = new URLSearchParams({ materialId: id, buyerAddress: address });
			const response = await fetch(`/api/download?${query.toString()}`);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload?.detail || payload?.error || "Unable to request material access.");
			}

			if (payload.fileUrl) {
				window.open(payload.fileUrl, "_blank", "noopener,noreferrer");
			}
		} catch (err) {
			setDownloadError(err instanceof Error ? err.message : "Unable to request material access.");
		} finally {
			setIsDownloading(false);
		}
	};

	useEffect(() => {
		if (materialQuery.data) {
			trackRecentlyViewed(materialQuery.data);
		}
	}, [materialQuery.data]);

	useEffect(() => {
		if (materialQuery.isError && materialQuery.error?.status === 404) {
			notFound();
		}
	}, [materialQuery.isError, materialQuery.error]);

	return (
		<>
			<Navbar />

			<main
				id="main"
				tabIndex={-1}
				className="relative bg-[#fffaf6] min-h-screen py-6 sm:py-10 px-4 sm:px-6 md:px-10 lg:px-20 focus:outline-none"
			>
				{/* Background grid pattern */}
				<div
					className="absolute inset-0 bg-[linear-gradient(to_right,#f2ede8_1px,transparent_1px),linear-gradient(to_bottom,#f2ede8_1px,transparent_1px)] bg-[size:40px_40px] opacity-70 pointer-events-none -z-10"
					aria-hidden="true"
				/>

				<QueryStateProvider query={materialQuery}>
					{(material) => (
						<motion.div
							initial={{ opacity: 0, y: 40 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6 }}
							aria-live="polite"
							className="max-w-6xl mx-auto"
						>
							<MaterialHero material={material} />

							{/* Main two-column area (mobile: purchase card first, lg+: content left + sticky card right) */}
							<div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 items-start">
								{/* LEFT: preview + content */}
								<div className="space-y-6 lg:space-y-8 min-w-0 order-2 lg:order-1">
									<MaterialPreview material={material} history={history} />
									<MaterialReviews
										materialId={id}
										material={material}
										entitlementQuery={entitlementQuery}
										address={address}
										isOwned={isOwned}
									/>
								</div>

								{/* RIGHT: sticky purchase card (first on mobile for early CTA visibility) */}
								<div className="order-1 lg:order-2">
									<MaterialPurchasePanel
										material={material}
										accessStatus={accessStatus}
										entitlementQuery={entitlementQuery}
										address={address}
										isOwned={isOwned}
										isDownloading={isDownloading}
										downloadError={downloadError}
										onDownload={handleDownload}
										onRequestAccess={() => setShowBuyModal(true)}
										onAddToCart={() => setShowBuyModal(true)}
										onReport={() => setShowReportModal(true)}
										isNetworkMismatch={isNetworkMismatch}
									/>
								</div>
							</div>

							{/* Recommendations */}
							{materialQuery.data && (
								<div className="mt-12 sm:mt-14">
									<RecommendedMaterials
										currentId={id}
										subject={materialQuery.data.subject}
										category={materialQuery.data.category}
										level={materialQuery.data.level}
										creator={materialQuery.data.author || materialQuery.data.creator}
									/>
								</div>
							)}
						</motion.div>
					)}
				</QueryStateProvider>
			</main>

			{materialQuery.data && (
				<Web3ErrorBoundary onRetry={() => setShowBuyModal(false)}>
					<BuyNowModal
						isOpen={showBuyModal}
						onClose={() => setShowBuyModal(false)}
						price={materialQuery.data.price}
						materialId={id}
						materialTitle={materialQuery.data.title}
						materialCreator={
							materialQuery.data.author?.name || materialQuery.data.creator || "Unknown"
						}
						onAccessUpdated={() => entitlementQuery.refetch()}
					/>
				</Web3ErrorBoundary>
			)}

			<ReportModal
				isOpen={showReportModal}
				onClose={() => setShowReportModal(false)}
				materialId={id}
				materialTitle={materialQuery.data?.title || ""}
			/>
		</>
	);
}
