import { LegalDocument } from "@/components/acces/marketing/legal/legal-document";
import { legalMetadata } from "@/components/acces/marketing/legal/legal-metadata";

export const generateMetadata = () => legalMetadata("transparency");

export default function TransparencyPage() {
  return <LegalDocument page="transparency" />;
}
