"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/hooks/useWallet";
import { useCreateProfile } from "@/hooks/api/useProfile";
import Navbar from "@/components/Navbar";
import {
  FaCheckCircle,
  FaChevronLeft,
  FaChevronRight,
  FaSpinner,
} from "react-icons/fa";
import { ONBOARDING_STEPS } from "./steps";
import {
  useOnboardingReducer,
  submitOnboarding,
} from "./useOnboardingReducer";

const containerVariants = {
  enter: { opacity: 0, x: 80 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -80 },
};

export default function OnboardingPage() {
  const {
    state: onboardingState,
    setStep,
    setAccountType,
    handleInputChange,
    goNext,
    goBack,
  } = useOnboardingReducer(ONBOARDING_STEPS);

  const { step, accountType, formData, formErrors } = onboardingState;
  const { isConnected, address, state: walletState, connect } = useWallet();
  const createProfile = useCreateProfile();

  const isWalletConnecting = walletState?.status === "connecting";
  const isWalletError = walletState?.status === "error";

  const handleComplete = () => {
    submitOnboarding({
      formData,
      walletAddress: address,
      createProfile,
    });
    setStep(5);
  };

  const currentStepConfig = ONBOARDING_STEPS[step];
  const StepComponent = currentStepConfig?.component;

  const isLastStep = step === ONBOARDING_STEPS.length - 1;
  const isFirstStep = step === 0;
  const isAttributionStep = step === ONBOARDING_STEPS.length - 2;
  const isWalletStep = currentStepConfig?.id === "wallet-connection";

  const canProceed = currentStepConfig?.canProceed
    ? currentStepConfig.canProceed(onboardingState, { isConnected })
    : true;

  return (
    <div className="min-h-screen bg-[#fffaf6]">
      <Navbar />

      <main className="pt-28 pb-16 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Progress indicator */}
          <div
            className="mb-10"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={6}
            aria-label={`Step ${step + 1} of 6: ${currentStepConfig.title}`}
          >
            <div className="flex items-center justify-between mb-3">
              {ONBOARDING_STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center">
                  <button
                    className={`flex flex-col items-center gap-1 group ${
                      i > step ? "pointer-events-none opacity-40" : ""
                    }`}
                    onClick={() => {
                      if (i < step) setStep(i);
                    }}
                    aria-current={i === step ? "step" : undefined}
                    aria-label={`Step ${s.num}: ${s.title}${i <= step ? "" : " (locked)"}`}
                    disabled={i > step}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        i < step
                          ? "bg-blue-600 text-white"
                          : i === step
                            ? "bg-blue-600 text-white ring-4 ring-blue-100"
                            : "bg-gray-200 text-gray-400"
                      }`}
                    >
                      {i < step ? <FaCheckCircle className="w-4 h-4" /> : s.num}
                    </div>
                    <span
                      className={`text-xs font-semibold hidden sm:block ${
                        i <= step ? "text-gray-700" : "text-gray-400"
                      }`}
                    >
                      {s.title}
                    </span>
                  </button>
                  {i < ONBOARDING_STEPS.length - 1 && (
                    <div
                      className={`w-8 sm:w-16 h-0.5 mx-1 mt-[-14px] ${
                        i < step ? "bg-blue-600" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <p className="text-center text-sm font-medium text-gray-500">
              Step {step + 1} of 6 &mdash; {currentStepConfig.title}
            </p>
          </div>

          {/* Step content */}
          <div className="bg-white/90 backdrop-blur border border-gray-100 rounded-2xl shadow-sm p-8 md:p-10 min-h-[360px] flex flex-col">
            <div className="flex-1 flex items-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  variants={containerVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  className="w-full"
                >
                  {StepComponent ? (
                    <StepComponent
                      accountType={accountType}
                      formData={formData}
                      formErrors={formErrors}
                      onSelectAccountType={setAccountType}
                      onInputChange={handleInputChange}
                      isConnected={isConnected}
                      address={address}
                      isWalletConnecting={isWalletConnecting}
                      isWalletError={isWalletError}
                      onConnect={connect}
                      isPending={createProfile.isPending}
                      isError={createProfile.isError}
                      error={createProfile.error}
                      onRetry={handleComplete}
                    />
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation */}
            {!isLastStep && (
              <div className="flex items-center justify-between pt-8 border-t border-gray-100 mt-6">
                <button
                  onClick={goBack}
                  disabled={isFirstStep}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                    isFirstStep
                      ? "text-gray-300 cursor-not-allowed"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                  aria-label="Go back to previous step"
                >
                  <FaChevronLeft className="w-3.5 h-3.5" />
                  Back
                </button>

                <button
                  onClick={isAttributionStep ? handleComplete : goNext}
                  disabled={
                    (isWalletStep && !isConnected) ||
                    (isAttributionStep && createProfile.isPending) ||
                    !canProceed
                  }
                  className={`inline-flex items-center gap-1.5 px-6 py-3 rounded-xl text-sm font-semibold transition shadow-sm ${
                    (isWalletStep && !isConnected) ||
                    (isAttributionStep && createProfile.isPending) ||
                    !canProceed
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                  aria-label={
                    isAttributionStep
                      ? "Complete onboarding"
                      : "Go to next step"
                  }
                >
                  {isAttributionStep ? (
                    createProfile.isPending ? (
                      <>
                        <FaSpinner className="animate-spin w-3.5 h-3.5" />
                        Creating Profile...
                      </>
                    ) : (
                      "Complete"
                    )
                  ) : (
                    <>
                      {isWalletStep && !isConnected ? "Connect First" : "Next"}
                      <FaChevronRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
