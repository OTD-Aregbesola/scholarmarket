import { apiClient } from '@/lib/api/apiClient';
import { generateIdempotencyKey } from '@/lib/api/clientIdempotency';

function resolveIdempotencyKey(options = {}) {
  if (options.idempotencyKey === null) return undefined;
  return options.idempotencyKey || generateIdempotencyKey();
}

export const purchaseService = {
  initiateCheckout: async (checkoutData, options = {}) => {
    return apiClient('/api/checkout/initiate', {
      body: checkoutData,
      idempotencyKey: resolveIdempotencyKey(options),
    });
  },

  createPurchase: async (purchaseData, options = {}) => {
    return apiClient('/api/purchase', {
      body: purchaseData,
      idempotencyKey: resolveIdempotencyKey(options),
    });
  },

  checkEntitlement: async (materialId, buyerAddress) => {
    const params = new URLSearchParams({ materialId, buyerAddress });
    return apiClient(`/api/materials/access?${params.toString()}`);
  },

  startAccessRequest: async (accessRequest) => {
    return apiClient('/api/materials/access', { body: accessRequest });
  },

  checkBatchEntitlements: async (materialIds, buyerAddress) => {
    return apiClient('/api/entitlements/batch', { body: { materialIds, buyerAddress } });
  },

  getPurchaseHistory: async () => {
    return apiClient('/api/purchase');
  },

  getPurchasedMaterials: async () => {
    return apiClient('/api/purchased-materials');
  },
};
