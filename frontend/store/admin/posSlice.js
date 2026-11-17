import { createSlice } from "@reduxjs/toolkit";

/**
 * Manual sale (POS) basket. Survives navigating away and back inside the admin
 * so a half-entered WhatsApp order isn't lost.
 */
const initialState = {
  lines: [], // { variantId, productName, variantTitle, sku, price, unitPrice, quantity, available, allowBackorder }
  channel: "facebook",
  status: "delivered",
};

const posSlice = createSlice({
  name: "pos",
  initialState,
  reducers: {
    addLine(state, { payload }) {
      const existing = state.lines.find((line) => line.variantId === payload.variantId);
      if (existing) {
        existing.quantity += 1;
      } else {
        state.lines.push({ ...payload, quantity: 1, unitPrice: payload.price });
      }
    },
    updateLine(state, { payload: { variantId, ...changes } }) {
      const line = state.lines.find((item) => item.variantId === variantId);
      if (line) Object.assign(line, changes);
    },
    removeLine(state, { payload: variantId }) {
      state.lines = state.lines.filter((line) => line.variantId !== variantId);
    },
    setChannel(state, { payload }) {
      state.channel = payload;
    },
    setSaleStatus(state, { payload }) {
      state.status = payload;
    },
    resetSale() {
      return initialState;
    },
  },
});

export const { addLine, updateLine, removeLine, setChannel, setSaleStatus, resetSale } = posSlice.actions;
export default posSlice.reducer;
