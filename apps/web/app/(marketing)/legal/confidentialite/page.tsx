import { LegalDocument } from "@/components/acces/marketing/legal/legal-document";
import { legalMetadata } from "@/components/acces/marketing/legal/legal-metadata";

export const generateMetadata = () => legalMetadata("privacy");

export default function PrivacyPage() {
  return <LegalDocument page="privacy" />;
}
