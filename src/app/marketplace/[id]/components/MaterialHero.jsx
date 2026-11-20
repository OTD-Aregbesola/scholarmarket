"use client";

import Link from "next/link";
import { FaTag } from "react-icons/fa";
import ResourceStatusBadge from "@/components/materials/ResourceStatusBadge";

export default function MaterialHero({ material }) {
	return (
		<>
			{/* Breadcrumb */}
			<nav aria-label="Breadcrumb" className="mb-4 sm:mb-6">
				<p className="text-xs sm:text-sm text-gray-500 break-words">
					<Link
						href="/marketplace"
						className="text-blue-600 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm"
					>
						Marketplace
					</Link>{" "}
					→ <span className="text-gray-700">{material.title}</span>
				</p>
			</nav>

			{/* Page header (title) */}
			<header className="mb-6 sm:mb-8">
				<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 break-words">
					{material.title}
				</h1>
				<div className="mt-3 flex flex-wrap items-center gap-3">
					<ResourceStatusBadge material={material} />
					<span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-blue-700 bg-blue-50 border border-blue-200">
						Current Revision: v{material.version || 1}
					</span>
				</div>
				<p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed max-w-3xl break-words">
					{material.shortSummary || material.description || "Creator preview not shared yet."}
				</p>
				{material.tags?.length ? (
					<div className="mt-4 flex flex-wrap gap-2" role="list">
						{material.tags.map((tag, i) => (
							<span
								key={i}
								role="listitem"
								className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full"
							>
								<FaTag aria-hidden="true" className="text-[10px] text-gray-400" />
								#{tag}
							</span>
						))}
					</div>
				) : null}
			</header>
		</>
	);
}
