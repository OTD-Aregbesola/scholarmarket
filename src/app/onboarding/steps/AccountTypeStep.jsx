"use client";

import { FaUser, FaExclamationCircle } from "react-icons/fa";

const ACCOUNT_OPTIONS = [
  {
    id: "creator",
    title: "Individual Creator",
    desc: "I publish and sell my own educational materials",
  },
  {
    id: "institution",
    title: "School or Institution",
    desc: "We manage cohorts, curriculum, and learner progress",
  },
];

export default function AccountTypeStep({
  accountType,
  formErrors = {},
  onSelectAccountType,
}) {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 text-2xl mx-auto">
          <FaUser />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          How will you use ScholarMarket?
        </h2>
        <p className="text-gray-500">
          We&apos;ll customize your experience based on your role.
        </p>
      </div>
      <div className="space-y-3">
        {ACCOUNT_OPTIONS.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelectAccountType(option.id)}
            className={`w-full text-left p-4 rounded-xl border-2 transition ${
              accountType === option.id
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <h3 className="font-semibold text-gray-900">{option.title}</h3>
            <p className="text-sm text-gray-500 mt-1">{option.desc}</p>
          </button>
        ))}
        {formErrors.accountType && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <FaExclamationCircle className="w-3 h-3" />
            {formErrors.accountType}
          </p>
        )}
      </div>
    </div>
  );
}
