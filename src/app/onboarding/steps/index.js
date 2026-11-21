import WelcomeStep from "./WelcomeStep";
import AccountTypeStep from "./AccountTypeStep";
import ProfileSetupStep from "./ProfileSetupStep";
import WalletConnectionStep from "./WalletConnectionStep";
import PublishingGuideStep from "./PublishingGuideStep";
import CreatorAttributionStep from "./CreatorAttributionStep";
import CompleteStep from "./CompleteStep";

/**
 * Step config array driving onboarding navigation, rendering, and validation.
 * Each entry defines { id, title, num, component, validate, canProceed }.
 */
export const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: "Welcome",
    num: 1,
    component: WelcomeStep,
    validate: () => ({}),
    canProceed: () => true,
  },
  {
    id: "account-type",
    title: "Account Type",
    num: 2,
    component: AccountTypeStep,
    validate: ({ accountType }) => {
      if (!accountType) {
        return { accountType: "Please select an account type" };
      }
      return {};
    },
    canProceed: ({ accountType }) => Boolean(accountType),
  },
  {
    id: "profile-setup",
    title: "Profile Setup",
    num: 3,
    component: ProfileSetupStep,
    validate: ({ accountType, formData }) => {
      const errors = {};
      if (!formData.fullName.trim()) {
        errors.fullName = "Full name is required";
      }
      if (accountType === "institution" && !formData.institutionName.trim()) {
        errors.institutionName = "Institution name is required";
      }
      return errors;
    },
    canProceed: ({ accountType, formData }) =>
      accountType === "institution"
        ? formData.institutionName.trim().length > 0
        : formData.fullName.trim().length > 0,
  },
  {
    id: "wallet-connection",
    title: "Wallet Connection",
    num: 4,
    component: WalletConnectionStep,
    validate: () => ({}),
    canProceed: (_state, { isConnected }) => Boolean(isConnected),
  },
  {
    id: "publishing-guide",
    title: "Publishing Guide",
    num: 5,
    component: PublishingGuideStep,
    validate: () => ({}),
    canProceed: () => true,
  },
  {
    id: "creator-attribution",
    title: "Creator Attribution",
    num: 6,
    component: CreatorAttributionStep,
    validate: () => ({}),
    canProceed: () => true,
  },
  {
    id: "complete",
    title: "Complete",
    num: 7,
    component: CompleteStep,
    validate: () => ({}),
    canProceed: () => true,
  },
];

export {
  WelcomeStep,
  AccountTypeStep,
  ProfileSetupStep,
  WalletConnectionStep,
  PublishingGuideStep,
  CreatorAttributionStep,
  CompleteStep,
};
