"use client";

import { motion } from "framer-motion";
import { FaRocket, FaUser, FaWallet, FaShieldAlt } from "react-icons/fa";

export default function WelcomeStep() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-600 text-white text-3xl mx-auto"
        >
          <FaRocket />
        </motion.div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
          Welcome to ScholarMarket
        </h1>
        <p className="text-lg text-gray-600 max-w-xl mx-auto leading-relaxed">
          Set up your creator profile in a few simple steps. Connect your
          wallet, tell us about yourself, and start sharing your knowledge
          with the world.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
        {[
          {
            icon: <FaUser className="w-5 h-5" />,
            title: "Profile Setup",
            desc: "Tell learners who you are and what you teach.",
          },
          {
            icon: <FaWallet className="w-5 h-5" />,
            title: "Wallet Connection",
            desc: "Link your Stellar wallet for attribution and payments.",
          },
          {
            icon: <FaShieldAlt className="w-5 h-5" />,
            title: "Creator Attribution",
            desc: "Every material is permanently tied to your identity.",
          },
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.15 }}
            className="bg-white/80 border border-gray-100 rounded-xl p-5 text-center shadow-sm"
          >
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-600 mb-3">
              {item.icon}
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
