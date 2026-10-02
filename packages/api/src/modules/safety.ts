import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";

const notYetImplemented = () => {
  throw new ORPCError("NOT_IMPLEMENTED");
};

/** Placeholder until stream A implements blocks and reports (SAF-01, SAF-02). */
export const safety = {
  block: os.safety.block.use(requireViewer).handler(notYetImplemented),
  unblock: os.safety.unblock.use(requireViewer).handler(notYetImplemented),
  report: os.safety.report.use(requireViewer).handler(notYetImplemented),
};
