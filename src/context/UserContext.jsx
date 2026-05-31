import { createContext, useContext } from "react";
import { getCurrentUser } from "../utils/storage.js";

export const UserContext = createContext(getCurrentUser());

export function useCurrentUser() {
  return useContext(UserContext);
}
