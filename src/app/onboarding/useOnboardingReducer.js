"use client";

import { useReducer, useCallback } from "react";

export const initialOnboardingState = {
  step: 0,
  accountType: null,
  formData: {
    fullName: "",
    bio: "",
    institution: "",
    country: "",
    institutionName: "",
    institutionRole: "",
    institutionSize: "",
  },
  formErrors: {},
};

export function onboardingReducer(state, action) {
  switch (action.type) {
    case "SET_STEP":
      return {
        ...state,
        step: action.step,
      };
    case "NEXT_STEP":
      return {
        ...state,
        step: Math.min(state.step + 1, action.maxStep ?? 6),
        formErrors: {},
      };
    case "PREV_STEP":
      return {
        ...state,
        step: Math.max(state.step - 1, 0),
      };
    case "SET_ACCOUNT_TYPE":
      return {
        ...state,
        accountType: action.accountType,
        formErrors: {},
      };
    case "SET_FIELD":
      return {
        ...state,
        formData: {
          ...state.formData,
          [action.name]: action.value,
        },
        formErrors: state.formErrors[action.name]
          ? { ...state.formErrors, [action.name]: undefined }
          : state.formErrors,
      };
    case "SET_ERRORS":
      return {
        ...state,
        formErrors: action.errors,
      };
    case "CLEAR_ERRORS":
      return {
        ...state,
        formErrors: {},
      };
    default:
      return state;
  }
}

/**
 * Builds the onboarding profile payload and submits it via the provided mutation.
 * Preserves the exact payload shape expected by the profile API.
 */
export function buildOnboardingPayload(formData, walletAddress) {
  return {
    fullName: formData.fullName.trim(),
    bio: formData.bio.trim(),
    institution: formData.institution.trim(),
    country: formData.country.trim(),
    walletAddress,
  };
}

export function submitOnboarding({ formData, walletAddress, createProfile }) {
  const payload = buildOnboardingPayload(formData, walletAddress);
  createProfile.mutate(payload);
  return payload;
}

export function useOnboardingReducer(steps) {
  const [state, dispatch] = useReducer(onboardingReducer, initialOnboardingState);

  const setStep = useCallback((step) => {
    dispatch({ type: "SET_STEP", step });
  }, []);

  const setAccountType = useCallback((accountType) => {
    dispatch({ type: "SET_ACCOUNT_TYPE", accountType });
  }, []);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    dispatch({ type: "SET_FIELD", name, value });
  }, []);

  const goNext = useCallback(() => {
    const currentStepConfig = steps[state.step];
    if (currentStepConfig?.validate) {
      const errors = currentStepConfig.validate(state);
      if (Object.keys(errors).length > 0) {
        dispatch({ type: "SET_ERRORS", errors });
        return false;
      }
    }
    dispatch({ type: "NEXT_STEP", maxStep: steps.length - 1 });
    return true;
  }, [state, steps]);

  const goBack = useCallback(() => {
    dispatch({ type: "PREV_STEP" });
  }, []);

  return {
    state,
    dispatch,
    setStep,
    setAccountType,
    handleInputChange,
    goNext,
    goBack,
  };
}
