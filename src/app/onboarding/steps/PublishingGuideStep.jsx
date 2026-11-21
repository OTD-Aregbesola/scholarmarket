"use client";

import { FaUpload } from "react-icons/fa";

const PUBLISHING_ITEMS = [
  {
    step: "1",
    title: "Upload Your Material",
    desc: 'Go to your Dashboard and click "Upload Material." Add a title, description, subject, and attach your file (PDF, DOCX, or PPTX up to 50MB).',
  },
  {
    step: "2",
    title: "Set Your Price",
    desc: "Choose a price in XLM for your material, or make it free. You receive payments directly to your connected Stellar wallet.",
  },
  {
    step: "3",
    title: "Publish & Share",
    desc: "Once published, your resource appears on the Marketplace. Share the link with students and track performance from your Analytics dashboard.",
  },
  {
    step: "4",
    title: "Manage Listings",
    desc: 'Edit titles, update prices, or unpublish materials anytime from the "My Materials" section in your dashboard.',
  },
];

export default function PublishingGuideStep({ accountType }) {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 text-2xl mx-auto">
          <FaUpload />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          {accountType === "institution"
            ? "Using the Platform"
            : "Publishing Your Resources"}
        </h2>
        <p className="text-gray-500 leading-relaxed">
          Learn how to publish and manage your educational materials on
          ScholarMarket.
        </p>
      </div>

      <div className="space-y-4">
        {PUBLISHING_ITEMS.map((item) => (
          <div
            key={item.step}
            className="flex items-start gap-4 bg-white/80 border border-gray-100 rounded-xl p-4 shadow-sm"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              {item.step}
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm">
                {item.title}
              </h4>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
