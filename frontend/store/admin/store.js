import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { adminApi } from "./api";
import posReducer from "./posSlice";

/** Admin-only store. The storefront has its own small cart store, so admin code never ships to shoppers. */
export function makeAdminStore() {
  const store = configureStore({
    reducer: {
      [adminApi.reducerPath]: adminApi.reducer,
      pos: posReducer,
    },
    middleware: (getDefault) => getDefault().concat(adminApi.middleware),
  });

  setupListeners(store.dispatch);

  return store;
}
