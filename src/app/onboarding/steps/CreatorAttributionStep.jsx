"use client";

import {
  FaShieldAlt,
  FaWallet,
  FaUser,
  FaCheckCircle,
  FaRocket,
} from "react-icons/fa";

export default function CreatorAttributionStep({
  accountType,
  address,
  formData,
}) {
  return (
    <div className="space-y-6 max-w-lg mx-auto text-center">
      <div className="space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 text-2xl mx-auto">
          <FaShieldAlt />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          {accountType === "institution"
            ? "Account Security"
            : "Creator Attribution"}
        </h2>
        <p className="text-gray-500 leading-relaxed">
          Every material you upload to ScholarMarket is permanently linked to
          your identity through your wallet address and display name.
        </p>
      </div>

      <div className="bg-white/80 border border-gray-100 rounded-xl p-6 shadow-sm space-y-5 text-left">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
            <FaWallet className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 text-sm">
              Wallet Address
            </h4>
            <p className="text-sm text-gray-500">
              {address || "Not yet connected"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Serves as your immutable creator ID on the Stellar network.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
            <FaUser className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 text-sm">
              Display Name
            </h4>
            <p className="text-sm text-gray-500">
              {formData.fullName || "Not yet set"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Shown publicly on your materials and creator profile.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <h4 className="font-semibold text-gray-900 text-sm text-center">
            Trust &amp; Transparency
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                icon: <FaShieldAlt className="w-4 h-4" />,
                title: "Immutable",
                desc: "On-chain proof of authorship",
              },
              {
                icon: <FaCheckCircle className="w-4 h-4" />,
                title: "Verifiable",
                desc: "Content linked to your wallet",
              },
              {
                icon: <FaRocket className="w-4 h-4" />,
                title: "Reputable",
                desc: "Build your creator brand",
              },
              {
                icon: <FaWallet className="w-4 h-4" />,
                title: "Monetizable",
                desc: "Earn XLM for your work",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 bg-gray-50 rounded-lg p-3"
              >
                <div className="text-blue-600 shrink-0 mt-0.5">{item.icon}</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {item.title}
                  </p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
