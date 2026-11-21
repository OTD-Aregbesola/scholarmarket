"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  FaCheckCircle,
  FaSpinner,
  FaExclamationCircle,
  FaUpload,
  FaTachometerAlt,
} from "react-icons/fa";

export default function CompleteStep({
  accountType,
  isPending,
  isError,
  error,
  onRetry,
}) {
  return (
    <div className="space-y-6 max-w-lg mx-auto text-center">
      <div className="space-y-3">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 150, delay: 0.1 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 text-3xl mx-auto"
        >
          {isPending ? (
            <FaSpinner className="animate-spin" />
          ) : isError ? (
            <FaExclamationCircle />
          ) : (
            <FaCheckCircle />
          )}
        </motion.div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          {isPending
            ? "Saving your profile..."
            : isError
              ? "Something went wrong"
              : "You're all set!"}
        </h2>
        <p className="text-gray-500 leading-relaxed">
          {isPending
            ? `Just a moment while we set up your ${accountType === "institution" ? "institution" : "creator"} account.`
            : isError
              ? error?.message ||
                "Failed to create your profile. Please try again."
              : accountType === "institution"
                ? "Your institution is ready. Start managing cohorts and materials."
                : "Your creator profile is ready. Start uploading materials and build your reputation on ScholarMarket."}
        </p>
      </div>

      {isError && (
        <button
          onClick={onRetry}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition shadow-sm"
        >
          Try Again
        </button>
      )}

      {!isPending && !isError && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          <Link
            href="/dashboard/upload"
            className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition shadow-sm inline-flex items-center justify-center gap-2"
          >
            <FaUpload className="w-4 h-4" />
            Upload Your First Material
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-6 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition shadow-sm inline-flex items-center justify-center gap-2"
          >
            <FaTachometerAlt className="w-4 h-4" />
            Go to Dashboard
          </Link>
        </div>
      )}

      {!isPending && !isError && (
        <p className="text-xs text-gray-400 pt-2">
          You can update your profile and settings anytime from your dashboard.
        </p>
      )}
    </div>
  );
}
