import React from 'react';
import './checkout.css';

/**
 * GasEstimator – displays a simple estimation of total transactions and gas cost.
 * It receives totalTx (number of transactions) and gasCost (string XLM).
 */
export default function GasEstimator({ totalTx, gasCost, baseFee = 0.00001 }) {
  const formattedCost = gasCost == null ? (Number(totalTx || 0) * Number(baseFee)).toFixed(7) : Number(gasCost).toFixed(7);
  return (
    <div className="gas-estimator">
      <p><strong>Total Transactions:</strong> {totalTx}</p>
      <p><strong>Estimated Stellar Gas Cost:</strong> {formattedCost} XLM</p>
    </div>
  );
}
