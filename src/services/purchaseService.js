import { apiClient } from '@/lib/api/apiClient';
import { cursorQuery } from '@/lib/pagination/query';

export const purchaseService = {
  createPurchase: async (purchaseData) => {
    return apiClient('/api/purchase', { body: purchaseData });
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

  getPurchaseHistory: async (cursor, limit) => {
    return apiClient(`/api/purchase${cursorQuery(cursor, limit)}`);
  },

  getPurchasedMaterials: async (cursor, limit) => {
    return apiClient(`/api/purchased-materials${cursorQuery(cursor, limit)}`);
  },
};

