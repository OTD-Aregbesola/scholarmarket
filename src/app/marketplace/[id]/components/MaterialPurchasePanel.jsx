"use client";

import Image from "next/image";
import { useState } from "react";
import {
	FaHeart,
	FaCheckCircle,
	FaClock,
	FaExclamationTriangle,
	FaFlag,
} from "react-icons/fa";
import SaveMaterialButton from "@/components/materials/SaveMaterialButton";
import ShareMaterialButton from "@/components/materials/ShareMaterialButton";

function getAverageScore(material) {
	const score = Number(material.averageScore ?? material.rating);
	return Number.isFinite(score) && score > 0 ? score.toFixed(1) : "New";
}

function getFeedbackCount(material) {
	return Number(material.feedbackCount ?? material.reviewsCount ?? 0) || 0;
}

function getAccessCopy(status, isLoading) {
	if (isLoading) {
		return {
			label: "Checking access",
			message: "We are checking your payment and entitlement status.",
			className: "border-slate-200 bg-slate-50 text-slate-700",
			icon: FaClock,
		};
	}

	switch (status) {
		case "active":
			return {
				label: "Access granted",
				message: "Payment is complete. This material is unlocked for your wallet.",
				className: "border-emerald-200 bg-emerald-50 text-emerald-800",
				icon: FaCheckCircle,
			};
		case "pending":
			return {
				label: "Payment pending",
				message: "Your access request started, but payment still needs to be completed.",
				className: "border-amber-200 bg-amber-50 text-amber-800",
				icon: FaClock,
			};
		case "payment_failed":
			return {
				label: "Payment incomplete",
				message: "The previous payment attempt did not complete, so access is still locked.",
				className: "border-rose-200 bg-rose-50 text-rose-800",
				icon: FaExclamationTriangle,
			};
		case "wallet_required":
			return {
				label: "Wallet required",
				message: "Connect your wallet to request access and complete payment.",
				className: "border-blue-200 bg-blue-50 text-blue-800",
				icon: FaClock,
			};
		default:
			return {
				label: "Payment required",
				message:
					"Start an access request from this page, then complete payment to unlock the file.",
				className: "border-slate-200 bg-white text-slate-700",
				icon: FaClock,
			};
	}
}

function AccessStatusPanel({ status, isLoading }) {
	const copy = getAccessCopy(status, isLoading);
	const Icon = copy.icon;

	return (
		<div className={`rounded-2xl border px-4 py-3 text-sm ${copy.className}`}>
			<div className="flex items-start gap-3">
				<Icon className="mt-0.5 shrink-0" aria-hidden="true" />
				<div className="min-w-0">
					<p className="font-semibold">{copy.label}</p>
					<p className="mt-1 leading-5 break-words">{copy.message}</p>
				</div>
			</div>
		</div>
	);
}

function PriceLine({ price, currency, rating, reviewsCount }) {
	return (
		<div className="flex flex-wrap items-center gap-3 sm:gap-4">
			<div className="flex items-center gap-2">
				<Image
					src="/images/stellar.png"
					alt="Stellar"
					width={28}
					height={28}
					className="rounded-full"
				/>
				<span className="text-xl sm:text-2xl font-bold text-gray-900">
					{price} {currency || "XLM"}
				</span>
			</div>
			<div className="flex items-center gap-2 text-sm">
				{rating && rating !== "New" ? (
					<span className="text-yellow-500">⭐ {rating}</span>
				) : (
					<span className="text-gray-400">No ratings yet</span>
				)}
				<span className="text-gray-400">({reviewsCount || 0} reviews)</span>
			</div>
		</div>
	);
}

export function ReportModal({ isOpen, onClose, materialId, materialTitle }) {
	const [reason, setReason] = useState("");
	const [description, setDescription] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState("");

	if (!isOpen) return null;

	const reasons = [
		"Inappropriate content",
		"Copyright violation",
		"Low quality / Unreadable",
		"Spam / Advertising",
		"Incorrect information",
		"Other",
	];

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!reason) {
			setError("Please select a reason for reporting.");
			return;
		}

		setSubmitting(true);
		setError("");

		try {
			const res = await fetch(`/api/materials/${materialId}/report`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ reason, description }),
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || "Failed to submit report");
			}

			setSubmitted(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
			<div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-xl border border-gray-100">
				{submitted ? (
					<div className="text-center py-6 space-y-4">
						<div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 text-green-600">
							<FaCheckCircle className="h-6 w-6" />
						</div>
						<h3 className="text-lg font-bold text-gray-900">Report Submitted</h3>
						<p className="text-sm text-gray-500 leading-relaxed">
							Thank you for your report. The listing has been flagged and is currently under admin review. We will investigate the issue.
						</p>
						<div className="mt-4 bg-slate-50 rounded-xl p-3 border border-slate-100 text-left">
							<span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Moderation Queue</span>
							<p className="text-xs text-slate-600 mt-1">
								Status: <span className="font-semibold text-amber-600">Pending Review</span>
							</p>
							<p className="text-[11px] text-slate-500 mt-0.5">
								Placeholder: Admin review will process this flag shortly.
							</p>
						</div>
						<button
							onClick={() => {
								setSubmitted(false);
								setReason("");
								setDescription("");
								onClose();
							}}
							className="mt-6 w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition"
						>
							Close
						</button>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="flex items-center justify-between border-b border-gray-100 pb-3">
							<h3 className="text-lg font-bold text-gray-950">Report Resource</h3>
							<button
								type="button"
								onClick={onClose}
								className="text-gray-400 hover:text-gray-600 font-semibold text-lg"
							>
								&times;
							</button>
						</div>

						<p className="text-xs text-gray-500">
							Help us keep ScholarMarket clean and reliable. Please tell us why you are flagging this listing:
						</p>

						<div className="space-y-2">
							<label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
								Reason for Flagging
							</label>
							<select
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
								required
							>
								<option value="">Select a reason...</option>
								{reasons.map((r) => (
									<option key={r} value={r}>
										{r}
									</option>
								))}
							</select>
						</div>

						<div className="space-y-2">
							<label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
								Additional Information
							</label>
							<textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Please provide details about the issue..."
								rows={4}
								className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
							/>
						</div>

						{error && <p className="text-xs text-red-600 font-medium">{error}</p>}

						<div className="flex items-center gap-3 pt-2">
							<button
								type="button"
								onClick={onClose}
								className="flex-1 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-xl transition"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={submitting}
								className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition disabled:opacity-60"
							>
								{submitting ? "Submitting..." : "Submit Report"}
							</button>
						</div>
					</form>
				)}
			</div>
		</div>
	);
}

export default function MaterialPurchasePanel({
	material,
	accessStatus,
	entitlementQuery,
	address,
	isOwned,
	isDownloading,
	downloadError,
	onDownload,
	onRequestAccess,
	onAddToCart,
	onReport,
	isNetworkMismatch,
}) {
	// NOTE: avoid `overflow-hidden/clip` on any ancestor of this card or
	// `lg:sticky` will silently stop working (browsers need an overflow-visible
	// scroll container between the sticky element and the viewport).
	return (
		<aside className="bg-white border border-gray-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 lg:sticky lg:top-24">
			<div className="space-y-3">
				<PriceLine
					price={material.price}
					currency={material.currency}
					rating={getAverageScore(material)}
					reviewsCount={getFeedbackCount(material)}
				/>
				<AccessStatusPanel
					status={accessStatus}
					isLoading={Boolean(address && entitlementQuery.isLoading)}
				/>
			</div>

			<div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-start items-stretch sm:items-center gap-3 w-full">
				<div className="w-full sm:w-auto sm:flex-1 flex gap-2">
					<SaveMaterialButton material={material} variant="detail" className="flex-1" />
					<ShareMaterialButton material={material} className="flex-1" />
				</div>
				{isOwned ? (
					<button
						type="button"
						className="w-full sm:w-auto sm:flex-1 px-6 sm:px-8 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition flex items-center justify-center gap-2 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
						onClick={onDownload}
						disabled={isDownloading}
					>
						<FaCheckCircle aria-hidden="true" />
						{isDownloading ? "Preparing..." : "Download material"}
					</button>
				) : (
					<>
						<button
							type="button"
							disabled={isNetworkMismatch}
							title={isNetworkMismatch ? "Switch your wallet to the configured Stellar network before checking out." : undefined}
							className="w-full sm:w-auto sm:flex-1 px-6 py-2 border border-gray-300 text-gray-700 font-semibold rounded-md hover:bg-gray-100 transition focus-visible:ring-2 focus-visible:ring-blue-500"
							onClick={onAddToCart}
						>
							Buy now
						</button>
						<button
							type="button"
							disabled={isNetworkMismatch}
							title={isNetworkMismatch ? "Switch your wallet to the configured Stellar network before checking out." : undefined}
							className="w-full sm:w-auto sm:flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition focus-visible:ring-2 focus-visible:ring-blue-500"
							onClick={onRequestAccess}
						>
							{accessStatus === "pending" ? "Complete payment" : "Request access"}
						</button>
					</>
				)}
			</div>

			{downloadError ? (
				<p role="alert" className="text-sm text-red-600">
					{downloadError}
				</p>
			) : null}

			<div className="flex items-center justify-between text-sm text-gray-500 pt-3 border-t border-gray-100">
				<div className="flex items-center gap-2">
					<FaHeart className="text-pink-500" aria-hidden="true" />
					<span>{material.likes || 0} likes</span>
				</div>
				<button
					type="button"
					onClick={onReport}
					className="flex items-center gap-1.5 text-gray-400 hover:text-red-600 transition duration-150 font-medium"
				>
					<FaFlag className="text-xs" aria-hidden="true" />
					<span>Report quality issue</span>
				</button>
			</div>
		</aside>
	);
}
