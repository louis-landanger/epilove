import { apiApp } from "@/lib/server/api";

const handler = (request: Request) => apiApp.fetch(request);

export { handler as GET, handler as POST };
