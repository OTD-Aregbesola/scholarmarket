"use client";

import {
  FaUser,
  FaExclamationCircle,
  FaGlobe,
  FaUniversity,
} from "react-icons/fa";

export default function ProfileSetupStep({
  accountType,
  formData,
  formErrors = {},
  onInputChange,
}) {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 text-2xl mx-auto">
          <FaUser />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          {accountType === "institution"
            ? "Institution Setup"
            : "Tell us about yourself"}
        </h2>
        <p className="text-gray-500">
          {accountType === "institution"
            ? "Set up your institution profile and team."
            : "This information will appear on your public creator profile."}
        </p>
      </div>

      <div className="space-y-4">
        {accountType === "institution" ? (
          <>
            <div>
              <label
                htmlFor="institutionName"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                Institution Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <FaUniversity className="w-4 h-4" />
                </div>
                <input
                  id="institutionName"
                  name="institutionName"
                  type="text"
                  value={formData.institutionName}
                  onChange={onInputChange}
                  placeholder="University of Knowledge"
                  aria-required="true"
                  aria-invalid={!!formErrors.institutionName}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    formErrors.institutionName
                      ? "border-red-400"
                      : "border-gray-200"
                  }`}
                />
              </div>
              {formErrors.institutionName && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <FaExclamationCircle className="w-3 h-3" />
                  {formErrors.institutionName}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="institutionRole"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                Your Role
              </label>
              <select
                id="institutionRole"
                name="institutionRole"
                value={formData.institutionRole}
                onChange={onInputChange}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              >
                <option value="">Select your role</option>
                <option value="admin">Administrator</option>
                <option value="teacher">Teacher/Instructor</option>
                <option value="cohort">Cohort Manager</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="institutionSize"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                Institution Size
              </label>
              <select
                id="institutionSize"
                name="institutionSize"
                value={formData.institutionSize}
                onChange={onInputChange}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              >
                <option value="">Select size</option>
                <option value="small">Small (1-50 students)</option>
                <option value="medium">Medium (51-500 students)</option>
                <option value="large">Large (500+ students)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="country"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                Country
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <FaGlobe className="w-4 h-4" />
                </div>
                <input
                  id="country"
                  name="country"
                  type="text"
                  value={formData.country}
                  onChange={onInputChange}
                  placeholder="Nigeria"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                value={formData.fullName}
                onChange={onInputChange}
                placeholder="Dr. Jane Smith"
                aria-required="true"
                aria-invalid={!!formErrors.fullName}
                aria-describedby={
                  formErrors.fullName ? "fullName-error" : undefined
                }
                className={`w-full px-4 py-3 rounded-xl border bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                  formErrors.fullName ? "border-red-400" : "border-gray-200"
                }`}
              />
              {formErrors.fullName && (
                <p
                  id="fullName-error"
                  className="mt-1 text-sm text-red-500 flex items-center gap-1"
                  role="alert"
                >
                  <FaExclamationCircle className="w-3 h-3" />
                  {formErrors.fullName}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="bio"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                rows={3}
                value={formData.bio}
                onChange={onInputChange}
                placeholder="A passionate educator specializing in..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
              />
            </div>

            <div>
              <label
                htmlFor="institution"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                Institution (Optional)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <FaUniversity className="w-4 h-4" />
                </div>
                <input
                  id="institution"
                  name="institution"
                  type="text"
                  value={formData.institution}
                  onChange={onInputChange}
                  placeholder="University of Knowledge"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="country"
                className="block text-sm font-semibold text-gray-700 mb-1.5"
              >
                Country
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <FaGlobe className="w-4 h-4" />
                </div>
                <input
                  id="country"
                  name="country"
                  type="text"
                  value={formData.country}
                  onChange={onInputChange}
                  placeholder="Nigeria"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
