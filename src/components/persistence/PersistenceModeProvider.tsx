"use client";

import { createContext, useContext } from "react";

export type ClientPersistenceMode = "browser" | "server";

const PersistenceModeContext = createContext<ClientPersistenceMode>("browser");

export function PersistenceModeProvider(props: {
  readonly mode: ClientPersistenceMode;
  readonly children: React.ReactNode;
}) {
  return (
    <PersistenceModeContext.Provider value={props.mode}>
      {props.children}
    </PersistenceModeContext.Provider>
  );
}

export function usePersistenceMode(): ClientPersistenceMode {
  return useContext(PersistenceModeContext);
}
