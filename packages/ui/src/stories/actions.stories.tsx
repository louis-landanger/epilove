import type { Meta, StoryObj } from "@storybook/react-vite";
import { Flag, Heart, Plus, Settings, ShieldOff } from "lucide-react";
import { ActionMenu, Button, IconButton, Spinner } from "../index";

const meta: Meta = { title: "Actions" };
export default meta;

export const Buttons: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Button>Recevoir mon code</Button>
        <Button variant="secondary">Plus tard</Button>
        <Button variant="outline" leadingIcon={<Plus className="size-4" aria-hidden="true" />}>
          Ajouter
        </Button>
        <Button variant="ghost">Annuler</Button>
        <Button variant="danger">Supprimer</Button>
        <Button variant="link">Conditions</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm">Petit</Button>
        <Button size="lg">Grand</Button>
        <Button loading>Envoi</Button>
        <Button disabled>Indisponible</Button>
      </div>
      <Button block>Pleine largeur</Button>
    </div>
  ),
};

export const IconButtons: StoryObj = {
  render: () => (
    <div className="flex gap-3">
      <IconButton label="J'aime">
        <Heart className="size-5" aria-hidden="true" />
      </IconButton>
      <IconButton label="Réglages" variant="solid">
        <Settings className="size-5" aria-hidden="true" />
      </IconButton>
      <Spinner label="Chargement" />
    </div>
  ),
};

export const Menu: StoryObj = {
  render: () => (
    <ActionMenu
      label="Plus d'options"
      items={[
        { label: "Signaler", icon: <Flag className="size-4" aria-hidden="true" />, onSelect: () => {} },
        {
          label: "Bloquer",
          icon: <ShieldOff className="size-4" aria-hidden="true" />,
          tone: "danger",
          onSelect: () => {},
        },
      ]}
    />
  ),
};
