"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useWallet } from "@/hooks/useWallet";

export default function SessionExpiredModal() {
  const { connect } = useWallet();
  const [open, setOpen] = useState(false);
  const resumeRef = useRef(null);

  useEffect(() => {
    const handleExpired = (event) => {
      event.preventDefault();
      resumeRef.current = event.detail?.resume;
      setOpen(true);
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  const finish = (success) => {
    resumeRef.current?.(success);
    resumeRef.current = null;
    setOpen(false);
  };

  const signInAgain = async () => {
    await connect();
    finish(true);
  };

  return (
    <Modal isOpen={open} onClose={() => finish(false)} title="Session expired">
      <p>Your session expired. Sign in again to continue without losing your current page.</p>
      <button
        type="button"
        onClick={signInAgain}
        className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
      >
        Sign in again
      </button>
    </Modal>
  );
}
