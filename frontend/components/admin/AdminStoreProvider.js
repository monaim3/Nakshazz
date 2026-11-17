"use client";

import { useState } from "react";
import { Provider } from "react-redux";
import { makeAdminStore } from "@/store/admin/store";

export default function AdminStoreProvider({ children }) {
  const [store] = useState(makeAdminStore);

  return <Provider store={store}>{children}</Provider>;
}
