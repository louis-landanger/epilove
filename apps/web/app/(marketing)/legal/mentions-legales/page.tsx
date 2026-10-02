import { LegalDocument } from "@/components/acces/marketing/legal/legal-document";
import { legalMetadata } from "@/components/acces/marketing/legal/legal-metadata";

export const generateMetadata = () => legalMetadata("legalNotice");

export default function LegalNoticePage() {
  return <LegalDocument page="legalNotice" />;
}
