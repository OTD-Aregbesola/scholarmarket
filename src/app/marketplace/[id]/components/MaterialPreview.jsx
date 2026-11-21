"use client";

import Image from "next/image";
import {
	FaCheckCircle,
	FaBookOpen,
	FaListUl,
	FaStickyNote,
	FaImage,
	FaHistory,
} from "react-icons/fa";
import CreatorCard from "./CreatorCard";

const FALLBACK_IMAGE = "/images/image2.jpg";

function getPreviewImage(material) {
	return material.coverImageUrl || material.thumbnailUrl || material.image || FALLBACK_IMAGE;
}

function getPreviewCounts(material) {
	return {
		outcomes: Array.isArray(material.learningOutcomes) ? material.learningOutcomes.length : 0,
		sections: Array.isArray(material.tableOfContents) ? material.tableOfContents.length : 0,
		notes: Array.isArray(material.sampleNotes) ? material.sampleNotes.length : 0,
	};
}

function hasCoverImage(material) {
	return Boolean(material.coverImageUrl || material.thumbnailUrl || material.image);
}

function PreviewBlock({ title, emptyLabel, items, icon: Icon }) {
	const hasItems = Array.isArray(items) && items.length > 0;

	return (
		<section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm sm:p-6 h-full">
			<div className="flex items-center gap-2 mb-3">
				{Icon ? <Icon className="text-blue-600" aria-hidden="true" /> : null}
				<h2 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h2>
			</div>
			{hasItems ? (
				<ul role="list" className="space-y-2 sm:space-y-3">
					{items.map((item) => (
						<li
							key={item}
							role="listitem"
							className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 sm:px-4 sm:py-3 text-sm text-gray-700"
						>
							{item}
						</li>
					))}
				</ul>
			) : (
				<div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
					{emptyLabel}
				</div>
			)}
		</section>
	);
}

function PreviewStat({ label, value, icon: Icon }) {
	return (
		<div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm flex items-start gap-3">
			{Icon ? (
				<span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
					<Icon aria-hidden="true" />
				</span>
			) : null}
			<div className="min-w-0">
				<p className="text-[10px] uppercase tracking-[0.24em] text-gray-400">{label}</p>
				<p className="mt-1.5 text-base font-semibold text-gray-900 break-words">{value}</p>
			</div>
		</div>
	);
}

function RevisionHistoryPanel({ history, currentVersion }) {
	return (
		<section className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
			<div className="flex items-center gap-2 mb-4">
				<FaHistory className="text-blue-600" aria-hidden="true" />
				<h2 className="text-base sm:text-lg font-semibold text-gray-900">Revision History</h2>
			</div>
			{history.length === 0 ? (
				<div className="text-sm text-gray-500 py-3">
					No past edits recorded. This is the initial version (v1).
				</div>
			) : (
				<div className="relative border-l border-gray-200 pl-4 ml-2 space-y-6">
					{/* Current active version */}
					<div className="relative">
						<span className="absolute -left-[22px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 ring-4 ring-white" />
						<div className="flex flex-col gap-1 text-sm">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-bold text-blue-700 text-xs uppercase px-2 py-0.5 rounded bg-blue-50 border border-blue-100">
									v{currentVersion || 1} (Current)
								</span>
							</div>
						</div>
					</div>

					{/* Previous versions */}
					{history.map((entry, index) => {
						const revVersion = entry.version || history.length - index;
						return (
							<div key={entry._id || index} className="relative">
								<span className="absolute -left-[22px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gray-300 ring-4 ring-white" />
								<div className="flex flex-col gap-1 text-sm text-gray-600">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-bold text-gray-800 text-xs uppercase px-2 py-0.5 rounded bg-gray-100 border border-gray-200">
											v{revVersion}
										</span>
										<span className="text-xs text-gray-400">
											{entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : "Unknown Date"}
										</span>
									</div>
									{entry.changeReason && (
										<p className="mt-1 text-gray-700 bg-slate-50 border border-slate-100 rounded-lg p-2.5 italic text-xs leading-relaxed max-w-2xl">
											&ldquo;{entry.changeReason}&rdquo;
										</p>
									)}
									{entry.changes && Object.keys(entry.changes).length > 0 && (
										<div className="mt-1 text-xs text-gray-400">
											Modified: {Object.keys(entry.changes).join(", ")}
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}

export default function MaterialPreview({ material, history = [] }) {
	const counts = getPreviewCounts(material);

	return (
		<>
			{/* Preview hero image */}
			<div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200">
				<Image
					src={getPreviewImage(material)}
					alt={material.title}
					width={800}
					height={600}
					className="w-full h-56 sm:h-72 md:h-[380px] object-cover"
				/>
			</div>

			{/* Preview stat grid */}
			<section aria-labelledby="preview-summary-heading" className="space-y-3">
				<h2 id="preview-summary-heading" className="text-base sm:text-lg font-semibold text-gray-900">
					What you will get
				</h2>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
					<PreviewStat
						label="Cover image"
						value={hasCoverImage(material) ? "Provided" : "Missing"}
						icon={FaImage}
					/>
					<PreviewStat
						label="Learning outcomes"
						value={`${counts.outcomes} shared`}
						icon={FaBookOpen}
					/>
					<PreviewStat
						label="Table of contents"
						value={`${counts.sections} sections`}
						icon={FaListUl}
					/>
					<PreviewStat
						label="Sample notes"
						value={`${counts.notes} included`}
						icon={FaStickyNote}
					/>
				</div>
			</section>

			{/* About + Creator */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
				<section className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
					<h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
						About
					</h2>
					<p className="text-sm text-gray-600 leading-relaxed break-words">
						{material.shortSummary || material.description}
					</p>
				</section>

				<CreatorCard
					author={material.author}
					creator={material.creator}
					createdAt={material.createdAt}
				/>
			</div>

			{/* Performance Summary */}
			<div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
				<h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Performance Summary</h2>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
					<div className="rounded-xl bg-blue-50 p-4">
						<p className="text-[10px] text-gray-500 font-bold tracking-wider uppercase">Views</p>
						<p className="mt-1 text-2xl font-bold text-blue-600">{material.viewCount || 0}</p>
					</div>
					<div className="rounded-xl bg-emerald-50 p-4">
						<p className="text-[10px] text-gray-500 font-bold tracking-wider uppercase">Saves</p>
						<p className="mt-1 text-2xl font-bold text-emerald-600">{material.saveCount || 0}</p>
					</div>
					<div className="rounded-xl bg-amber-50 p-4">
						<p className="text-[10px] text-gray-500 font-bold tracking-wider uppercase">Requests</p>
						<p className="mt-1 text-2xl font-bold text-amber-600">{material.accessCount || 0}</p>
					</div>
					<div className="rounded-xl bg-pink-50 p-4">
						<p className="text-[10px] text-gray-500 font-bold tracking-wider uppercase">Likes</p>
						<p className="mt-1 text-2xl font-bold text-pink-600">{material.likes || 0}</p>
					</div>
				</div>
			</div>

			{/* Preview blocks */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
				<PreviewBlock
					title="Learning outcomes"
					emptyLabel="The creator has not added learning outcomes yet."
					items={material.learningOutcomes}
					icon={FaBookOpen}
				/>
				<PreviewBlock
					title="Table of contents"
					emptyLabel="The creator has not shared a table of contents yet."
					items={material.tableOfContents}
					icon={FaListUl}
				/>
				<PreviewBlock
					title="Sample notes"
					emptyLabel="No sample notes were shared for this listing."
					items={material.sampleNotes}
					icon={FaStickyNote}
				/>

				{/* On-chain verification */}
				<section className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm h-full">
					<h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
						On-chain verification
					</h2>
					<p className="text-sm text-gray-600 leading-relaxed mb-4">
						ScholarMarket publishes marketplace metadata through Soroban contracts so
						buyers can verify authenticity before paying.
					</p>
					<p className="flex items-center gap-2 text-sm">
						<strong className="text-gray-800">Status:</strong>
						{material.verified ? (
							<span className="text-green-700 flex items-center gap-1 text-xs font-semibold">
								<FaCheckCircle aria-hidden="true" />
								Ready for Soroban
							</span>
						) : (
							<span className="text-amber-700 text-xs font-semibold">
								Not verified yet
							</span>
						)}
					</p>
				</section>

				{/* Resource Details */}
				<div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm h-full">
					<h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
						Resource Details
					</h2>
					<dl className="space-y-3 text-sm">
						{material.category && (
							<div className="flex justify-between items-center">
								<dt className="text-gray-500 font-medium">Category</dt>
								<dd className="text-gray-800 font-semibold capitalize">{material.category}</dd>
							</div>
						)}
						{material.subject && (
							<div className="flex justify-between items-center">
								<dt className="text-gray-500 font-medium">Subject</dt>
								<dd className="text-gray-800 font-semibold">{material.subject}</dd>
							</div>
						)}
						{material.level && (
							<div className="flex justify-between items-center">
								<dt className="text-gray-500 font-medium">Level</dt>
								<dd className="text-gray-800 font-semibold capitalize">{material.level}</dd>
							</div>
						)}
						<div className="flex justify-between items-center">
							<dt className="text-gray-500 font-medium">File Type</dt>
							<dd className="text-gray-800 font-semibold uppercase">{material.fileType || "PDF"}</dd>
						</div>
						{material.pages && (
							<div className="flex justify-between items-center">
								<dt className="text-gray-500 font-medium">Pages</dt>
								<dd className="text-gray-800 font-semibold">{material.pages}</dd>
							</div>
						)}
						<div className="flex justify-between items-center">
							<dt className="text-gray-500 font-medium">Visibility</dt>
							<dd className="text-gray-800 font-semibold capitalize">{material.visibility || "Public"}</dd>
						</div>
					</dl>
				</div>
			</div>

			<RevisionHistoryPanel
				history={history}
				currentVersion={material.version}
			/>
		</>
	);
}
