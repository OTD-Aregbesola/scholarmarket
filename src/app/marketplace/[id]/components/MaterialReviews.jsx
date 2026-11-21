"use client";

import MaterialReviewPanel from "@/components/materials/MaterialReviewPanel";
import LearnerNotes from "@/components/materials/LearnerNotes";

export default function MaterialReviews({
	materialId,
	material,
	entitlementQuery,
	address,
	isOwned,
}) {
	return (
		<>
			<MaterialReviewPanel
				materialId={materialId}
				initialReviews={material.reviews || material.reviewHistory || []}
				entitlement={entitlementQuery}
				currentAddress={address}
				creatorAddress={
					material.userAddress ||
					material.ownerAddress ||
					material.creatorAddress ||
					material.author?.walletAddress
				}
			/>

			{isOwned && address ? (
				<LearnerNotes materialId={materialId} walletAddress={address} />
			) : null}
		</>
	);
}
