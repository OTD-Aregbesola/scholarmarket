"use client";

import { FaWallet, FaSpinner, FaExclamationCircle } from "react-icons/fa";

export default function WalletConnectionStep({
  isConnected,
  address,
  isWalletConnecting,
  isWalletError,
  onConnect,
}) {
  return (
    <div className="space-y-6 max-w-lg mx-auto text-center">
      <div className="space-y-2">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-2xl mx-auto ${
            isConnected
              ? "bg-green-100 text-green-600"
              : "bg-blue-100 text-blue-600"
          }`}
        >
          <FaWallet />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          Connect Your Wallet
        </h2>
        <p className="text-gray-500 leading-relaxed">
          Link your Stellar wallet to receive payments, sign transactions,
          and establish immutable creator attribution for every material
          you publish.
        </p>
      </div>

      <div className="bg-white/80 border border-gray-100 rounded-xl p-6 shadow-sm space-y-4">
        {isConnected ? (
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-semibold">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Wallet Connected
            </div>
            <p className="text-sm text-gray-600 font-mono break-all bg-gray-50 rounded-lg px-4 py-2">
              {address}
            </p>
            <p className="text-xs text-gray-400">
              This address will be used for creator attribution and
              receiving payments.
            </p>
          </div>
        ) : isWalletConnecting ? (
          <div className="flex items-center justify-center gap-3 text-blue-600 py-4">
            <FaSpinner className="animate-spin w-5 h-5" />
            <span className="font-semibold">Connecting to wallet...</span>
          </div>
        ) : isWalletError ? (
          <div className="space-y-3">
            <div
              className="text-red-600 bg-red-50 rounded-lg px-4 py-3 text-sm flex items-center gap-2"
              role="alert"
            >
              <FaExclamationCircle className="w-4 h-4 shrink-0" />
              Wallet connection failed. Please try again.
            </div>
            <button
              onClick={onConnect}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition shadow-sm"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={onConnect}
              className="w-full px-6 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition shadow-sm flex items-center justify-center gap-2"
            >
              <FaWallet className="w-4 h-4" />
              Connect Stellar Wallet
            </button>
            <p className="text-xs text-gray-400">
              Securely sign in with your preferred Stellar wallet provider.
            </p>
          </div>
        )}

        {!isConnected && !isWalletConnecting && !isWalletError && (
          <div className="text-left space-y-2 border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700">
              Why connect a wallet?
            </p>
            <ul className="text-sm text-gray-500 space-y-1.5 list-disc list-inside">
              <li>Receive XLM payments for your materials</li>
              <li>Immutable proof of authorship on-chain</li>
              <li>Sign and verify your uploaded content</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
