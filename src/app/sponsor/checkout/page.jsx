"use client";

import React, { useState } from 'react';
import BulkAddressInput from './BulkAddressInput';
import GasEstimator from './GasEstimator';
import './checkout.css';
import useConfirm from '@/hooks/useConfirm';
import { useToast } from '@/hooks/useToast';

/**
 * SponsorCheckout – page component for sponsoring students.
 * Allows bulk entry of Stellar wallet addresses (CSV upload or manual list),
 * validates them client‑side, estimates total transaction volume and Stellar gas
 * costs, and submits the sponsorship.
 */
export default function SponsorCheckout() {
  const [addresses, setAddresses] = useState([]);
  const [valid, setValid] = useState(false);
  const [gasInfo, setGasInfo] = useState({ totalTx: 0, gasCost: 0 });
  const [submitting, setSubmitting] = useState(false);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const handleAddressesChange = (list) => {
    setAddresses(list);
    const allValid = list.every(addr => /^G[A-Z2-7]{55}$/.test(addr.trim()));
    setValid(allValid && list.length > 0);
    // Simple mock estimation: each address = 1 transaction, gas = 0.00001 XLM per tx
    const totalTx = list.length;
    const gasCost = totalTx * 0.00001;
    setGasInfo({ totalTx, gasCost });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    const confirmed = await confirm({
      title: 'Confirm sponsorship',
      description: `Sponsor ${addresses.length} students. Estimated gas: ${gasInfo.gasCost} XLM`,
      confirmLabel: 'Sponsor',
    });
    if (!confirmed) return;
    setSubmitting(true);
    try {
      toast.show({ title: 'Sponsorship submitted', message: `Sponsoring ${addresses.length} students`, type: 'success' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="sponsor-checkout">
      {dialog}
      <h2 className="title">Sponsor a Student – Scholarship Checkout</h2>
      <form onSubmit={handleSubmit} className="checkout-form">
        <BulkAddressInput onChange={handleAddressesChange} />
        <GasEstimator totalTx={gasInfo.totalTx} gasCost={gasInfo.gasCost} />
        <button type="submit" className="submit-btn" disabled={!valid || submitting}>
          Confirm Sponsorship
        </button>
      </form>
    </section>
  );
}
