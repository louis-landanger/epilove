import type { Meta, StoryObj } from "@storybook/react-vite";
import { Inbox } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ProgressBar,
  SchoolChip,
  Skeleton,
  Tabs,
  Watermark,
} from "../index";

const meta: Meta = { title: "Affichage" };
export default meta;

export const Badges: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge>Promo 2028</Badge>
        <Badge tone="plasma">Nouveau</Badge>
        <Badge tone="volt">Photo vérifiée</Badge>
        <Badge tone="success">Validée</Badge>
        <Badge tone="danger">Refusée</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <SchoolChip school="epita" name="EPITA" />
        <SchoolChip school="esme" name="ESME" />
        <SchoolChip school="supbiotech" name="Sup'Biotech" />
        <SchoolChip school="isg" name="ISG" />
        <SchoolChip school="ipsa" name="IPSA" />
      </div>
      <div className="flex gap-3">
        <Avatar name="Camille" />
        <Avatar name="Noa" />
      </div>
    </div>
  ),
};

export const States: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <ProgressBar value={3} max={10} label="Étape 3 sur 10" />
      </Card>
      <div className="flex gap-3">
        <Skeleton className="h-24 w-20 rounded-2xl" />
        <Skeleton className="h-24 flex-1 rounded-2xl" />
      </div>
      <EmptyState
        icon={<Inbox className="size-6" aria-hidden="true" />}
        title="Aucun like pour l'instant"
        description="Complète ton profil pour être plus visible."
        action={<Button size="sm">Mon profil</Button>}
      />
    </div>
  ),
};

export const Navigation: StoryObj = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <div className="flex flex-col gap-6">
        <Tabs
          label="Mon profil"
          items={[
            { value: "preview", label: "Aperçu", content: <p>Tel que les autres te voient.</p> },
            { value: "edit", label: "Modifier", content: <p>Photos, prompts, intérêts.</p> },
          ]}
        />
        <Button variant="outline" onClick={() => setOpen(true)}>
          Ouvrir le dialogue
        </Button>
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="Bloquer Camille ?"
          description="Elle ne sera pas prévenue."
        >
          <Button variant="danger" block onClick={() => setOpen(false)}>
            Bloquer
          </Button>
        </Dialog>
      </div>
    );
  },
};

export const PhotoWatermark: StoryObj = {
  render: () => (
    <div className="relative aspect-[4/5] w-60 overflow-hidden rounded-3xl bg-[linear-gradient(160deg,#c2187a,#1b2a6b)]">
      <Watermark code="7KQ2-XA9M" />
    </div>
  ),
};
