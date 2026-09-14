import { createContext } from "react";
import { CodexApiConfig } from "../../ApiConfigContext";
import { useApiEndpoint } from "../common";
import { Run } from "./types";
import { cleanRun } from "./util";

export const useSharedRun = (
  hash: string,
  config?: CodexApiConfig,
): Run | undefined => {
  const raw = useApiEndpoint<RawRun>(`runs/shared/${hash}`, config);
  return raw ? cleanRun(raw) : undefined;
};
const SharedRunContext = createContext<Run | undefined>(undefined);
export default SharedRunContext;
