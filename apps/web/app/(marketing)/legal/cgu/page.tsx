import { LegalDocument } from "@/components/acces/marketing/legal/legal-document";
import { legalMetadata } from "@/components/acces/marketing/legal/legal-metadata";

export const generateMetadata = () => legalMetadata("terms");

export default function TermsPage() {
  return <LegalDocument page="terms" />;
}
